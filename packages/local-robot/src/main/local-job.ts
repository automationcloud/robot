import { Job, JobState, JobInitParams, JobError } from '@automationcloud/robot';
import { LocalRobot } from './local-robot';
import { Engine, FlowService, Script, Exception, BrowserService } from '@ubio/engine';
import { LocalFlowService } from './overrides/flow';
import path from 'path';
import { promises as fs } from 'fs';

export class LocalJob extends Job {
    engine: Engine;
    script: Script | null = null;

    protected _state: JobState = JobState.CREATED;
    protected _error: JobError | null = null;
    protected _runPromise: Promise<void> | null = null;

    constructor(public robot: LocalRobot, public params: JobInitParams) {
        super();
        this.engine = new Engine();
        this.configureEngine();
        this.localFlow.initInputs(params.input);
        this.events.on('stateChanged', newState => {
            this._state = newState;
        });
    }

    get events() {
        return this._events;
    }

    get localFlow(): LocalFlowService {
        return this.engine.container.get(LocalFlowService);
    }

    get browser(): BrowserService {
        return this.engine.container.get(BrowserService);
    }

    protected configureEngine() {
        this.engine.container.bind('Job').toConstantValue(this);
        this.engine.container.bind(LocalFlowService).toSelf().inSingletonScope();
        this.engine.container.rebind(FlowService).toService(LocalFlowService);
    }

    run() {
        if (this._runPromise) {
            return;
        }
        this._runPromise = this._run()
            .then(() => {
                this._runPromise = null;
            });
    }

    protected async _run() {
        const script = await this._initScript(this.robot.config.script);
        await this.browser.connect();
        await this.browser.openNewTab();
        this._state = JobState.PROCESSING;
        await script.runAll();
    }

    getState() {
        return this._state;
    }

    getError() {
        return this._error;
    }

    // Note: this is not a part of the Job interface just yet, kept for reference
    // getAwaitingInputKey() {
    //     return this.localFlow.awaitingInputKeys[0] ?? null;
    // }

    async submitInput(key: string, data: any) {
        this.localFlow.submitInput(key, data);
    }

    async getOutput(key: string): Promise<any> {
        return this.localFlow.outputs.find(_ => _.key === key)?.data;
    }

    async waitForCompletion() {
        await this._runPromise;
    }

    async cancel() {
        if (this.script) {
            this.script.pause();
            // TODO should also cancel waiting for inputs
        }
    }

    _setState(newState: JobState) {
        const previousState = this._state;
        this._state = newState;
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

}
