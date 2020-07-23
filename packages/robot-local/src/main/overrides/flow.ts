import { FlowService, Exception } from '@ubio/engine';
import { JobInput, JobOutput, JobInputObject } from '@automationcloud/robot';
import * as uuid from 'uuid';
import { inject } from 'inversify';
import { JobEvents } from '../events';
import { LocalJob } from '../local-job';

export class LocalFlowService extends FlowService {

    inputs: JobInput[] = [];
    outputs: JobOutput[] = [];
    awaitingInputKeys: string[] = [];

    constructor(
        @inject('Job')
        protected job: LocalJob,
        @inject(JobEvents)
        protected events: JobEvents
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
        this.awaitingInputKeys.push(key);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                cleanup();
                reject(new Exception({
                    name: 'InputTimeout',
                    message: `Input timeout (key=${key})`,
                    details: { key },
                }));
            }, this.job.params.inputTimeout);
            const onInput = (input: JobInput) => {
                if (input.key === key) {
                    this.awaitingInputKeys = this.awaitingInputKeys.filter(k => k !== key);
                    cleanup();
                    resolve(input.data);
                }
            };
            // TODO add timeout?
            // TODO reject if script is paused?
            // TODO hey, auto-reject if there's no listener for 'inputRequested'?
            const cleanup = () => {
                clearTimeout(timer);
                this.events.off('input', onInput);
            };
            this.events.on('input', onInput);
            this.events.emit('inputRequested', key);
        });
    }

    async peekInputData(key: string) {
        const input = this.inputs.find(_ => _.key === key);
        return input?.data;
    }

    async sendOutputData(key: string, data: any) {
        const output = this._createOutput(key, data);
        this.outputs.push(output);
        this.events.emit('output', output);
    }

    submitInput(key: string, data: any) {
        // TODO deduplicate?
        const input = this._createInput(key, data);
        this.inputs.push(input);
        this.events.emit(`input`, input);
        return input;
    }

    protected _createInput(key: string, data: any): JobInput {
        return {
            id: uuid.v4(),
            key,
            data,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            encrypted: false,
        };
    }

    protected _createOutput(key: string, data: any): JobOutput {
        return {
            id: uuid.v4(),
            key,
            data,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
    }

}
