import { Job, JobState, JobOutput, JobInitParams, JobEventHandler } from '@automationcloud/robot';
import { LocalRobot } from './local-robot';
import { Engine, FlowService, Script, Exception, BrowserService } from '@ubio/engine';
import { LocalFlowService } from './overrides/flow';
import path from 'path';
import { promises as fs } from 'fs';
import { JobEvents } from './events';

export type LocalScriptInit = string | object;

export type LocalJobInit = JobInitParams & {
    script: LocalScriptInit;
    inputTimeout: number;
};

export class LocalJob implements Job {
    engine: Engine;
    script: Script | null = null;

    protected currentState: JobState = JobState.CREATED;
    protected runPromise: Promise<void> | null = null;

    constructor(public robot: LocalRobot, public params: LocalJobInit) {
        this.engine = new Engine();
        this.configureEngine();
        this.localFlow.initInputs(params.input);
        this.events.on('stateChanged', newState => {
            this.currentState = newState;
        });
    }

    get events(): JobEvents {
        return this.engine.container.get(JobEvents);
    }

    get localFlow(): LocalFlowService {
        return this.engine.container.get(LocalFlowService);
    }

    get browser(): BrowserService {
        return this.engine.container.get(BrowserService);
    }

    protected configureEngine() {
        this.engine.container.bind('Job').toConstantValue(this);
        this.engine.container.bind(JobEvents).toSelf().inSingletonScope();
        this.engine.container.bind(LocalFlowService).toSelf().inSingletonScope();
        this.engine.container.rebind(FlowService).toService(LocalFlowService);
    }

    run() {
        if (this.runPromise) {
            return;
        }
        this.runPromise = this._run();
    }

    protected async _run() {
        const script = await this._initScript(this.params.script);
        await this.browser.connect();
        await this.browser.openNewTab();
        this.currentState = JobState.PROCESSING;
        await script.runAll();
    }

    get category() {
        return this.params.category;
    }

    get state() {
        return this.currentState;
    }

    get awaitingInputKey() {
        return this.localFlow.awaitingInputKeys[0];
    }

    async submitInput(key: string, data: any) {
        this.localFlow.submitInput(key, data);
    }

    async getOutput(key: string): Promise<any> {
        return this.localFlow.outputs.find(_ => _.key === key)?.data;
    }

    async waitForCompletion() {
        await this.runPromise;
        this.runPromise = null;
    }

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
                this.events.off('output', onOutput);
                this.events.off('success', onSuccess);
                this.events.off('fail', onFail);
            };
            this.events.on('output', onOutput);
            this.events.on('success', onSuccess);
            this.events.on('fail', onFail);
            onOutput();
        });
    }

    async cancel() {
        if (this.script) {
            this.script.pause();
        }
    }

    onAwaitingInput(key: string, fn: () => any | Promise<any>): JobEventHandler {
        return this._createJobEventHandler('inputRequested', async (requestedKey: string) => {
            if (requestedKey === key) {
                const data = await fn();
                this.localFlow.submitInput(key, data);
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

    _setState(newState: JobState) {
        const previousState = this.currentState;
        this.currentState = newState;
        this.events.emit('stateChanged', newState, previousState);
    }

    protected async _initScript(scriptOrPath: any): Promise<Script> {
        switch (typeof scriptOrPath) {
            case 'object': {
                // Script spec is inferred based on object properties
                const spec = [scriptOrPath, scriptOrPath.script].find(obj => {
                    return obj && typeof obj.id === 'string' && typeof obj.contexts === 'object';
                });
                if (spec) {
                    this.script = await Script.load(this.engine, spec);
                    this._setupScriptListeners(this.script);
                    return this.script;
                }
                throw new Exception({
                    name: 'BadScript',
                    message: 'Could not recognize script format: script JSON should contain `id` and `context` fields',
                });
            }
            case 'string': {
                const file = path.resolve(process.cwd(), scriptOrPath);
                const content = await fs.readFile(file, 'utf-8');
                const json = JSON.parse(content);
                return await this._initScript(json);
            }
            default:
                throw new Exception({
                    name: 'ScriptInitFailed',
                    message: 'Script should be either an object or a path to local file',
                });
        }
    }

    protected _setupScriptListeners(script: Script) {
        script.$events.on('success', () => {
            this._setState(JobState.SUCCESS);
            this.events.emit('success');
        });
        script.$events.on('fail', () => {
            this._setState(JobState.FAIL);
            this.events.emit('fail', this.script?.$playback.error ?? new Exception({ name: 'UnknownError' }));
        });
    }

    protected _checkOutputs(keys: string[]): any[] | null {
        const values = [];
        for (const key of keys) {
            const output = this.localFlow.outputs.find(o => o.key === key);
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

    protected _createJobEventHandler(event: 'output', fn: (output: JobOutput) => void | Promise<void>): JobEventHandler
    protected _createJobEventHandler(event: 'inputRequested', fn: (requestedKey: string) => void | Promise<void>): JobEventHandler
    protected _createJobEventHandler(event: 'stateChanged', fn: (newState: JobState) => void | Promise<void>): JobEventHandler
    protected _createJobEventHandler(event: 'success', fn: () => void | Promise<void>): JobEventHandler
    protected _createJobEventHandler(event: 'fail', fn: (error: Error) => void | Promise<void>): JobEventHandler
    protected _createJobEventHandler(event: string, fn: (...args: any[]) => void | Promise<void>): JobEventHandler {
        const handler = async (...args: any[]) => {
            try {
                await fn(...args);
            } catch (error) {
                this.events.emit('error', error);
            }
        };
        this.events.on(event as any, handler);
        return () => this.events.off(event, handler);
    }

}
