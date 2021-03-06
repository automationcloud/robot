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

import { EventEmitter } from 'eventemitter3';
import { Exception } from './exception';

/**
 * Unified interface for running Autopilot scripts.
 *
 * This class has two standard implementations:
 *
 * - {@link LocalJob} runs the job using local Autopilot Engine and Chromium browser
 *   and tracks its progress by subscribing to script lifecycle events.
 * - {@link CloudJob} submits the job to Automation Cloud and tracks its progress
 *   Automation Cloud API.
 *
 * The job should be created via {@link Robot.createJob}.
 *
 * @public
 */
export abstract class Job {
    protected _events: JobEventBus = new EventEmitter();

    /**
     * Returns the last known state of the Job.
     * See {@link JobState} for a list of available job states.
     *
     * @public
     */
    abstract getState(): JobState;

    /**
     * If job has failed, returns the information about the error.
     *
     * Note: error info is not an `Error` instance — do not `throw` it.
     *
     * @public
     */
    abstract getErrorInfo(): JobError | null;

    /**
     * If job is waiting for input (i.e. due to input request by script and not yet submitted),
     * then this method returns the requested input key, otherwise `null` is returned.
     *
     * @public
     */
    abstract getAwaitingInputKey(): string | null;

    /**
     * Submits an input with specified `key` and `data`.
     *
     * @param key input key
     * @param data input data
     * @public
     */
    abstract async submitInput(key: string, data: any): Promise<void>;

    /**
     * Retrieves the data of an output with specified `key` if it was already emitted.
     * Returns `undefined` if output does not exist.
     *
     * @param key output key
     * @public
     */
    abstract async getOutput(key: string): Promise<any | undefined>;

    /**
     * Resolves whenever job finishes successfully. Rejects if job fails.
     *
     * Your code should always `await job.waitForCompletion()` to avoid dangling promises.
     *
     * @public
     */
    abstract async waitForCompletion(): Promise<void>;

    /**
     * Instructs the underlying mechanism to cancel the job.
     * This also causes `waitForCompletion` promise to reject with `JobCancelled` error.
     *
     * Note: the job is not guaranteed to get interrupted immediately.
     *
     * @public
     */
    abstract async cancel(): Promise<void>;

    /**
     * Implementations provide this method to inspect the readiness of specified output keys.
     *
     * @param keys output keys to check
     * @internal
     */
    protected abstract _checkOutputs(keys: string[]): any[] | null;

    /**
     * Resolves when all outputs with specified `keys` are available.
     * The output data is returned as an array in the same order as specified keys.
     *
     * ProTip™ Use destructuring to access the data:
     *
     * ```
     * const [products, deliveryOptions] = await job.waitForOutputs('products', 'deliveryOptions');
     * ```
     *
     * @param keys output keys
     * @public
     */
    async waitForOutputs(...keys: string[]): Promise<any[]> {
        return new Promise((resolve, reject) => {
            const onOutput = () => {
                const values = this._checkOutputs(keys);
                if (values) {
                    cleanup();
                    resolve(values);
                }
            };
            const onSuccess = () => {
                cleanup();
                reject(new Exception({
                    name: 'JobSuccessMissingOutputs',
                    message: `Job succeded, but specified outputs were not emitted`,
                    details: { keys },
                }));
            };
            const onFail = () => {
                cleanup();
                reject(new Exception({
                    name: 'JobFailMissingOutputs',
                    message: `Job failed, and specified outputs were not emitted`,
                    details: { keys },
                }));
            };
            const cleanup = () => {
                this._events.off('output', onOutput);
                this._events.off('success', onSuccess);
                this._events.off('fail', onFail);
            };
            this._events.on('output', onOutput);
            this._events.on('success', onSuccess);
            this._events.on('fail', onFail);
            onOutput();
        });
    }

    /**
     * Subscribes to `awaitingInput` event for specified input key and optionally fulfills
     * the input request with data returned by handler funciton.
     *
     * When input with specified `key` is requested by script, the supplied `fn` handler is invoked.
     *
     * Unless the handler returns `undefined`, the result value is sent as input data for that key,
     * fulfilling the input request.
     *
     * Use this to handle deferred inputs.
     *
     * @param key requested input key, `*` to receive all events.
     * @param fn handler callback, can be either synchronous or asynchronous; the return value is
     *  submitted as input data for specified input `key`
     */
    onAwaitingInput(key: string, fn: (key: string) => any | Promise<any>): JobEventHandler {
        return this._createJobEventHandler('awaitingInput', async (requestedKey: string) => {
            if (key === '*' || requestedKey === key) {
                const data = await fn(requestedKey);
                if (data !== undefined) {
                    await this.submitInput(key, data);
                }
            }
        });
    }

    /**
     * Subscribes to `output` event for specified output `key`.
     *
     * When output with specified `key` is emitted by script, the handler `fn` is invoked.
     *
     * @param key output key
     * @param fn handler callback, can be either synchronous or asynchronous
     */
    onOutput(key: string, fn: (outputData: any) => void | Promise<void>): JobEventHandler {
        return this._createJobEventHandler('output', async (output: JobOutput) => {
            if (output.key === key) {
                await fn(output.data);
            }
        });
    }

    /**
     * Subscribes to `output` event for all output keys.
     *
     * When any output is emitted by script, the handler `fn` is invoked.
     *
     * @param fn handler callback, can be either synchronous or asynchronous
     */
    onAnyOutput(fn: (outputKey: string, outputData: any) => void | Promise<void>): JobEventHandler {
        return this._createJobEventHandler('output', async (output: JobOutput) => {
            await fn(output.key, output.data);
        });
    }

    /**
     * Subscribes to state change event.
     *
     * @param fn handler callback, can be either synchronous or asynchronous
     */
    onStateChanged(fn: (state: JobState) => void | Promise<void>): JobEventHandler {
        return this._createJobEventHandler('stateChanged', fn);
    }

    /**
     * Subscribes to `success` event.
     *
     * When the job finishes successfully the handler `fn` is invoked.
     *
     * @param fn handler callback, can be either synchronous or asynchronous
     */
    onSuccess(fn: () => void | Promise<void>): JobEventHandler {
        return this._createJobEventHandler('success', fn);
    }

    /**
     * Subscribes to `fail` event.
     *
     * When the job fails the handler `fn` is invoked with error info passed as a parameter.
     *
     * @param fn handler callback, can be either synchronous or asynchronous
     */
    onFail(fn: (err: Error) => void | Promise<void>): JobEventHandler {
        return this._createJobEventHandler('fail', fn);
    }

    protected _createJobEventHandler(event: 'output', fn: (output: JobOutput) => void | Promise<void>): JobEventHandler
    protected _createJobEventHandler(event: 'awaitingInput', fn: (requestedKey: string) => void | Promise<void>): JobEventHandler
    protected _createJobEventHandler(event: 'stateChanged', fn: (newState: JobState) => void | Promise<void>): JobEventHandler
    protected _createJobEventHandler(event: 'success', fn: () => void | Promise<void>): JobEventHandler
    protected _createJobEventHandler(event: 'fail', fn: (error: Error) => void | Promise<void>): JobEventHandler
    protected _createJobEventHandler(event: string, fn: (...args: any[]) => void | Promise<void>): JobEventHandler {
        const handler = async (...args: any[]) => {
            // try {
            await fn(...args);
            // } catch (error) {
            // this._events.emit('error', error);
            // }
        };
        this._events.on(event as any, handler);
        return () => this._events.off(event, handler);
    }
}

/**
 * Job initialization parameters, provided when the job is being created using `robot.createJob()`.
 */
export interface JobInitParams {
    /**
     * Initial job inputs (provided as objects).
     */
    input: JobInputObject;
    /**
     * Job category, used for filtering jobs in Automation Cloud dashboard.
     */
    category: JobCategory;
}

/**
 * Job can be in one particular state at any given time.
 *
 * Note: not all states are necessarily supported by underlying mechanism. For example,
 * 3-D Secure handling is not supported by `LocalRobot` so local jobs will never be in `AWAITING_TDS` state.
 */
export enum JobState {
    CREATED = 'created',
    SCHEDULED = 'scheduled',
    PROCESSING = 'processing',
    AWAITING_INPUT = 'awaitingInput',
    AWAITING_TDS = 'awaitingTds',
    PENDING = 'pending',
    SUCCESS = 'success',
    FAIL = 'fail',
}

/**
 * Indicates whether the job is live or test, useful for filtering jobs in dashboard.
 */
export enum JobCategory {
    LIVE = 'live',
    TEST = 'test',
}

/**
 * Describes the reason of job failure.
 */
export interface JobError {
    /**
     * Error code in PascalCase, typically constrained by schema.
     */
    code: string;

    /**
     * A designation of the root cause of error:
     *
     * - `client` indicates the class of errors that involve client actions
     *   (e.g. invalid inputs supplied, job cancelled, etc.)
     * - `server` indicates platform-related failure (e.g. worker crash, timeout, API unavailable, etc.)
     * - `website` indicates a known limitation with the website (e.g. an unsupported feature, flow or layout)
     */
    category: 'client' | 'server' | 'website';

    /**
     * If applicable, human-readable message for logging and debugging.
     *
     * Note: implementations should never depend on the structure of this string.
     */
    message: string;

    /**
     * Arbitrary details for logging and debugging.
     *
     * Note: implementations should never depend on the structure of this object.
     */
    details?: any;
}

/**
 * Job inputs are the primary means of supplying data to automations.
 *
 * Data is supplied by client in key-value format. Keys must be in camelCase.
 */
export interface JobInput {
    key: string;
    data: any;
}

/**
 * Job outputs are the primary means of receiving data from automations.
 *
 * Data is emitted by script in key-value format. Keys must be in camelCase.
 */
export interface JobOutput {
    key: string;
    data: any;
}

/**
 * Describes initial job inputs in object representation.
 */
export interface JobInputObject {
    [key: string]: any;
}

/**
 * Event subscription methods like `onOutput` return handlers which can subsequently be invoked
 * with zero arguments to unsubscribe from the event.
 *
 * ```ts
 * const unsubscribe = job.onOutput('someKey', async data => { ... });
 * // ...
 * unsubscribe();
 * ```
 */
export type JobEventHandler = () => void;

/**
 * Unified event emitter for passing internal job events between components.
 *
 * @internal
 */
export interface JobEventBus {
    emit(event: 'input', input: JobInput): boolean;
    emit(event: 'output', output: JobOutput): boolean;
    emit(event: 'awaitingInput', key: string): boolean;
    emit(event: 'error', error: Error): boolean;
    emit(event: 'stateChanged', newState: JobState, previousState: JobState): boolean;
    emit(event: 'success'): boolean;
    emit(event: 'fail', error: Error): boolean;

    on(event: 'input', fn: (input: JobInput) => void): this;
    on(event: 'output', fn: (output: JobOutput) => void): this;
    on(event: 'awaitingInput', fn: (key: string) => void): this;
    on(event: 'error', fn: (error: Error) => void): this;
    on(event: 'stateChanged', fn: (newState: JobState, previousState: JobState) => void): this;
    on(event: 'success', fn: () => void): this;
    on(event: 'fail', fn: (error: Error) => void): this;

    off(event: string, fn: (...args: any[]) => any): this;
}
