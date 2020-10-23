// Copyright 2020 UBIO Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Job, JobInitParams, JobState, JobOutput, JobInput, JobError, Exception, JobCategory } from '@automationcloud/robot';
import { CloudRobot } from './cloud-robot';
import { AcJobEvent } from './ac-api';

/**
 * Cloud job instance reflects the Job created in Automation Cloud.
 *
 * When the job is created it is automatically tracked, which results in mirroring the
 * state of the remote jobs and emitting appropriate lifecycle events when outputs are emitted,
 * inputs are requested, job finishes successfully, job fails, etc.
 *
 * The exact job state is not guaranteed to be precise due to polling delays and network latencies.
 *
 * Note: cloud jobs are not subject to the concurrency limitations described in `LocalJob` because
 * Automation Cloud will run them in isolated runners.
 *
 * With `CloudRobot` it is also possible to resume tracking existing jobs using `robot.getJob` method.
 */
export class CloudJob extends Job {
    /**
     * @internal
     */
    awaitingInputKey: string | null = null;
    /**
     * @internal
     */
    inputsMap: Map<string, JobInput> = new Map();
    /**
     * @internal
     */
    outputsMap: Map<string, JobOutput> = new Map();

    protected _initParams: JobInitParams;
    protected _state: JobState = JobState.CREATED;
    protected _error: JobError | null = null;
    protected _tracking: boolean = false;
    protected _trackPromise: Promise<void> | null = null;
    protected _jobId: string | null = null;
    protected _jobEventOffset: number = 0;

    /**
     * Job constructor should not be used directly; use `robot.createJob()` to run the scripts.
     *
     * @param robot
     * @param params
     */
    constructor(
        public robot: CloudRobot,
        params: Partial<JobInitParams> = {},
    ) {
        super();
        this._initParams = {
            category: JobCategory.TEST,
            input: {},
            ...params,
        };
    }

    /**
     * @internal
     */
    get api() {
        return this.robot.api;
    }

    /**
     * The `jobId` of the AutomationCloud job. Can be used to resume tracking of existing job
     * using `const job = await robot.getJob(jobId)`.
     *
     * Note: this method is Cloud-only, so the job instance must be cast to `CloudJob` to access `jobId`.
     */
    get jobId(): string {
        if (!this._jobId) {
            throw new Exception({
                name: 'InvalidStateError',
                message: 'Job is not yet created',
            });
        }
        return this._jobId;
    }

    /**
     * Starts a new job by sending a POST /jobs request to Automation Cloud API
     * and begin tracking its events.
     *
     * This method is internal. Use `await robot.createJob()` for starting new jobs.
     *
     * @internal
     */
    async start() {
        if (this._jobId) {
            throw new Exception({
                name: 'JobAlreadyStarted',
                message: `Job ${this._jobId} alreade initialized; use track() to follow its progress`,
            });
        }
        const { category, input } = this._initParams;
        const { serviceId } = this.robot.config;
        const { id, state } = await this.api.createJob({ serviceId, category, input });
        this._jobId = id;
        this._setState(state);
        for (const [key, data] of Object.entries(input)) {
            this.inputsMap.set(key, { key, data });
        }
        this.track();
    }

    /**
     * Tracks the job that was previosly created.
     *
     * This method is internal. Use `await robot.getJob()` for tracking existing jobs.
     *
     * @internal
     */
    async trackExisting(jobId: string) {
        if (this._jobId) {
            throw new Exception({
                name: 'JobAlreadyStarted',
                message: `Job ${this._jobId} alreade initialized; use track() to follow its progress`,
            });
        }
        const { state, category } = await this.api.getJob(jobId);
        this._jobId = jobId;
        this._initParams.category = category;
        this._setState(state);
        this.track();
    }

    /**
     * @internal
     */
    track() {
        if (this._trackPromise) {
            return;
        }
        this._tracking = true;
        this._trackPromise = this._track()
            .then(() => {
                this._trackPromise = null;
            });
    }

    /**
     * @internal
     */
    protected async _track() {
        while (this._tracking) {
            const { pollInterval } = this.robot.config;
            try {
                const events = await this.api.getJobEvents(this.jobId, this._jobEventOffset);
                this._jobEventOffset += events.length;
                for (const event of events) {
                    await this._processJobEvent(event);
                }
                // This probably becomes more complicated with restarts, but we'll see about that
                switch (this._state) {
                    case JobState.SUCCESS: {
                        return;
                    }
                    case JobState.FAIL: {
                        throw new Exception({
                            name: this._error?.code ?? 'UnknownError',
                            message: this._error?.message ?? 'Unknown error',
                            details: {
                                category: this._error?.category ?? 'server',
                                ...this._error?.details ?? {},
                            }
                        });
                    }
                }
            } finally {
                await new Promise(r => setTimeout(r, pollInterval));
            }
        }
    }

    /**
     * @internal
     */
    protected async _processJobEvent(jobEvent: AcJobEvent) {
        const key = jobEvent.key!;
        switch (jobEvent.name) {
            case 'awaitingInput': {
                this._setState(JobState.AWAITING_INPUT);
                this.awaitingInputKey = key;
                this._events.emit('awaitingInput', key);
            } break;
            case 'createOutput': {
                const jobOutput = await this.api.getJobOutputData(this.jobId, key);
                if (jobOutput) {
                    const data = jobOutput.data;
                    this.outputsMap.set(key, { key, data });
                    this._events.emit('output', { key, data });
                }
            } break;
            case 'processing': {
                this._setState(JobState.PROCESSING);
            } break;
            case 'success': {
                this._setState(JobState.SUCCESS);
                this._events.emit('success');
            } break;
            case 'fail': {
                const { error } = await this.api.getJob(this.jobId);
                this._setState(JobState.FAIL);
                this._error = {
                    category: 'server',
                    code: 'UnknownError',
                    message: 'Unknown error',
                    ...error,
                };
                const exception = new Exception({
                    name: this._error.code,
                    message: this._error.message,
                    details: {
                        category: this._error.category,
                        ...this._error.details ?? {},
                    }
                });
                this._events.emit('fail', exception);
            } break;
            // TODO handle those
            case 'restart':
            case 'tdsStart':
            case 'tdsFinish':
        }
    }

    /**
     * @internal
     */
    protected _checkOutputs(keys: string[]): any[] | null {
        const values = [];
        for (const key of keys) {
            const output = this.outputsMap.get(key);
            if (output) {
                values.push(output.data);
            } else {
                break;
            }
        }
        if (values.length === keys.length) {
            return values;
        }
        return null;
    }

    getState() {
        return this._state;
    }

    getErrorInfo() {
        return this._error;
    }

    async submitInput(key: string, data: any) {
        await this.api.sendJobInput(this.jobId, key, data);
        this.inputsMap.set(key, { key, data });
    }

    async getOutput(key: string): Promise<any> {
        const cached = this.outputsMap.get(key);
        if (cached) {
            return cached.data;
        }
        const output = await this.api.getJobOutputData(this.jobId, key);
        return output?.data;
    }

    async waitForCompletion() {
        await this._trackPromise;
    }

    /**
     * Cancels the remote Job which results in `JobCancelled` error (if the job was still running).
     */
    async cancel() {
        await this.api.cancelJob(this.jobId);
    }

    /**
     * @param newState
     * @internal
     */
    protected _setState(newState: JobState) {
        const previousState = this._state;
        this._state = newState;
        this._events.emit('stateChanged', newState, previousState);
    }

}
