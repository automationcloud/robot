import { FlowService, Exception, Script } from '@ubio/engine';
import { JobInput, JobOutput, JobInputObject, JobState } from '@automationcloud/robot';
import { inject } from 'inversify';
import { LocalJob } from '../local-job';

export class LocalFlowService extends FlowService {

    inputs: JobInput[] = [];
    outputs: JobOutput[] = [];
    awaitingInputKeys: string[] = [];

    constructor(
        @inject('Job')
        protected job: LocalJob,
    ) {
        super();
    }

    initInputs(inputObject: JobInputObject) {
        this.inputs = [];
        for (const [key, data] of Object.entries(inputObject)) {
            this.inputs.push(this._createInput(key, data));
        }
    }

    async requestInputData(key: string) {
        const existingInput = this.inputs.find(_ => _.key === key);
        if (existingInput) {
            return existingInput.data;
        }
        return new Promise((resolve, reject) => {
            const { inputTimeout } = this.job.robot.config;
            const timer = setTimeout(() => {
                cleanup();
                reject(new Exception({
                    name: 'InputTimeout',
                    message: `Input timeout (key=${key})`,
                    details: { key },
                }));
            }, inputTimeout);
            const onInput = (input: JobInput) => {
                if (input.key === key) {
                    this.awaitingInputKeys = this.awaitingInputKeys.filter(k => k !== key);
                    cleanup();
                    resolve(input.data);
                }
            };
            const onError = (err: Error) => {
                cleanup();
                reject(err);
            };
            const onStateChanged = (state: JobState) => {
                if (state !== JobState.AWAITING_INPUT) {
                    cleanup();
                    reject(new Exception({
                        name: 'AwaitingInputInterrupted',
                        message: `Awaiting input was interrupted because job was switched to state ${state}`,
                    }));
                }
            };
            // TODO hey, auto-reject if there's no listener for 'awaitingInput'?
            const cleanup = () => {
                clearTimeout(timer);
                this.job.events.off('input', onInput);
                this.job.events.off('error', onError);
                this.job.events.off('stateChanged', onStateChanged);
            };
            this.job.events.on('input', onInput);
            this.job.events.on('error', onError);
            this.job.events.on('stateChanged', onStateChanged);
            this.awaitingInputKeys.push(key);
            this.job._setState(JobState.AWAITING_INPUT);
            this.job.events.emit('awaitingInput', key);
        });
    }

    async peekInputData(key: string) {
        const input = this.inputs.find(_ => _.key === key);
        return input?.data;
    }

    async sendOutputData(key: string, data: any) {
        const output = this._createOutput(key, data);
        this.outputs.push(output);
        this.job.events.emit('output', output);
    }

    async tick(script: Script) {
        await super.tick(script);
        this.job._setState(JobState.PROCESSING);
    }

    submitInput(key: string, data: any) {
        // TODO deduplicate?
        const input = this._createInput(key, data);
        this.inputs.push(input);
        this.job.events.emit(`input`, input);
        return input;
    }

    protected _createInput(key: string, data: any): JobInput {
        return { key, data };
    }

    protected _createOutput(key: string, data: any): JobOutput {
        return { key, data };
    }

}