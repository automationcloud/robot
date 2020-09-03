import { EventEmitter } from 'eventemitter3';
import { Exception } from './exception';

export interface JobInitParams {
    input: JobInputObject;
    category: JobCategory;
}

export abstract class Job {
    protected _events: JobEventBus = new EventEmitter();

    abstract getState(): JobState;
    abstract getError(): JobError | null;
    abstract async submitInput(key: string, data: any): Promise<void>;
    abstract async getOutput(key: string): Promise<any | undefined>;
    abstract async waitForCompletion(): Promise<void>;
    abstract async cancel(): Promise<void>;

    protected abstract _checkOutputs(keys: string[]): any[] | null;

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

    onAwaitingInput(key: string, fn: () => any | Promise<any>): JobEventHandler {
        return this._createJobEventHandler('awaitingInput', async (requestedKey: string) => {
            if (requestedKey === key) {
                const data = await fn();
                await this.submitInput(key, data);
            }
        });
    }

    onOutput(key: string, fn: (outputData: any) => void | Promise<void>): JobEventHandler {
        return this._createJobEventHandler('output', async (output: JobOutput) => {
            if (output.key === key) {
                await fn(output.data);
            }
        });
    }

    onStateChanged(fn: (state: JobState) => void | Promise<void>): JobEventHandler {
        return this._createJobEventHandler('stateChanged', fn);
    }

    onSuccess(fn: () => void | Promise<void>): JobEventHandler {
        return this._createJobEventHandler('success', fn);
    }

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
            try {
                await fn(...args);
            } catch (error) {
                this._events.emit('error', error);
            }
        };
        this._events.on(event as any, handler);
        return () => this._events.off(event, handler);
    }
}

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

export enum JobCategory {
    LIVE = 'live',
    TEST = 'test',
}

export interface JobError {
    code: string;
    category: 'client' | 'server' | 'website';
    message: string;
    details?: any;
}

export interface JobOutput {
    key: string;
    data: any;
}

export interface JobInput {
    key: string;
    data: any;
}

export interface JobInputObject {
    [key: string]: any;
}

export type JobEventHandler = () => void;

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
