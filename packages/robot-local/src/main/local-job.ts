import { Job, JobState, JobOutput, JobInput, JobCreateParams, JobEventHandler } from '@automationcloud/robot';
import { LocalRobot } from './local-robot';
import { Engine, FlowService, Script, Exception, BrowserService } from '@ubio/engine';
import { LocalFlowService } from './overrides/flow';
import path from 'path';
import { promises as fs } from 'fs';
import { JobEvents } from './events';

export type LocalScriptInit = string | object;

export type LocalJobInit = JobCreateParams & {
    script: LocalScriptInit;
    inputTimeout: number;
};

export class LocalJob implements Job {
    protected engine: Engine;
    protected script: Script | null = null;
    protected runPromise: Promise<void> | null = null;

    pnr: boolean = false;
    createdAt: number = Date.now();
    updatedAt: number = Date.now();
    finishedAt: number | null = null;

    constructor(public robot: LocalRobot, public params: LocalJobInit) {
        this.engine = new Engine();
        this.configureEngine();
        this.localFlow.initInputs(params.input);
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
        await script.runAll();
    }

    get state() {
        // TODO
        return JobState.CREATED;
    }

    get category() {
        return this.params.category;
    }

    get awaitingInputKey() {
        return this.localFlow.awaitingInputKeys[0];
    }

    async createInput(key: string, data: any): Promise<JobInput> {
        return this.localFlow.submitInput(key, data);
    }

    async getOutput(key: string): Promise<JobOutput | null> {
        return this.localFlow.outputs.find(_ => _.key === key) ?? null;
    }

    async waitForCompletion() {
        await this.runPromise;
        this.runPromise = null;
    }

    async waitForOutputs(...keys: string[]): Promise<any[]> {
        return new Promise((resolve, reject) => {
            // TODO reject on timeout and on finish?
            const onOutput = () => {
                const values = this._checkOutputs(keys);
                if (values) {
                    cleanup();
                    resolve(values);
                }
            };
            const cleanup = () => {
                this.events.off('output', onOutput);
            };
            this.events.on('output', onOutput);
            onOutput();
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

    async cancel(): Promise<void> {
        throw new Error('Method not implemented.');
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

    onAwaitingInput(key: string, fn: () => any | Promise<any>): JobEventHandler {
        const onInput = async (requestedKey: string) => {
            try {
                if (requestedKey === key) {
                    const data = await fn();
                    this.localFlow.submitInput(key, data);
                }
            } catch (error) {
                this.events.emit('error', error);
            }
        };
        this.events.on('inputRequested', onInput);
        return () => this.events.off('input', onInput);
    }

    onOutput(key: string, fn: (outputData: any) => void | Promise<void>): JobEventHandler {
        const onOutput = async (output: JobOutput) => {
            try {
                if (output.key === key) {
                    await fn(output.data);
                }
            } catch (error) {
                this.events.emit('error', error);
            }
        };
        this.events.on('output', onOutput);
        return () => this.events.off('output', onOutput);
    }

}
