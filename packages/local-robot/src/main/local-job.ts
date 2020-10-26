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

import { Job, JobState, JobInitParams, JobError } from '@automationcloud/robot';
import { LocalRobot } from './local-robot';
import { Engine, FlowService, Script, Exception, BrowserService } from '@automationcloud/engine';
import { LocalFlowService } from './overrides/flow';
import path from 'path';
import { promises as fs } from 'fs';

/**
 * LocalJob represents the state of the locally running automation.
 *
 * Each job sets up a new `Engine` instance which manages the connection to Chromium browser,
 * alongside all the state associated with running a script.
 *
 * Note: running multiple jobs in parallel on the same Chromium browser is technically possible,
 * but can be a subject to various limitations:
 *
 *  - scripts gain an access to an entire browser instance, not just some specific tabs,
 *    so jobs can interfere with each other, depending on functionality being used by both
 *    (for example, it is possible for a script to close all the tabs, therefore preventing other
 *    job from executing normally)
 *  - Chrome can put inactive tabs to background process, which can cause some issues (for example,
 *    some users reported not being able to execute JavaScript)
 *  - when taking screenshots or changing emulation settings the tab needs to be activated; this can also
 *    cause problems with adjacent jobs executed in parallel.
 */
export class LocalJob extends Job {
    /**
     * The embedded Engine instance.
     * @internal
     */
    engine: Engine;

    /**
     * The embedded Script instance.
     * @internal
     */
    script: Script | null = null;

    protected _state: JobState = JobState.CREATED;
    protected _error: JobError | null = null;
    protected _runPromise: Promise<void> | null = null;

    /**
     * Job constructor should not be used directly; use `robot.createJob()` to run the scripts.
     *
     * @internal
     * @param robot
     * @param params
     */
    constructor(public robot: LocalRobot, public params: JobInitParams) {
        super();
        this.engine = new Engine();
        this.configureEngine();
        this.localFlow.initInputs(params.input);
        this.events.on('stateChanged', newState => {
            this._state = newState;
        });
    }

    /**
     * @internal
     */
    get events() {
        return this._events;
    }

    /**
     * @internal
     */
    get localFlow(): LocalFlowService {
        return this.engine.container.get(LocalFlowService);
    }

    /**
     * @internal
     */
    get browser(): BrowserService {
        return this.engine.container.get(BrowserService);
    }

    /**
     * Configures the Engine instance by specifying overrides for engine services.
     * @internal
     */
    protected configureEngine() {
        this.engine.container.bind('Job').toConstantValue(this);
        this.engine.container.bind(LocalFlowService).toSelf().inSingletonScope();
        this.engine.container.rebind(FlowService).toService(LocalFlowService);
    }

    /**
     * @internal
     */
    run() {
        if (this._runPromise) {
            return;
        }
        this._runPromise = this._run()
            .then(() => {
                this._runPromise = null;
            });
    }

    /**
     * @internal
     */
    protected async _run() {
        try {
            const script = await this._initScript(this.robot.config.script);
            await this._initialize();
            await script.runAll();
        } finally {
            await this._finalize();
        }
    }

    /**
     * @internal
     */
    protected async _initialize() {
        await this.browser.connect();
        await this.browser.openNewTab();
        await this.engine.startSession();
        this._state = JobState.PROCESSING;
    }

    /**
     * @internal
     */
    protected async _finalize() {
        try {
            if (this.robot.config.closeAllTabs) {
                this.browser.closeAllTabs();
            } else if (this.robot.config.closeActiveTab && this.browser.isAttached()) {
                this.browser.page.close();
            }
            this.browser.detach();
            await this.engine.finishSession();
        } catch (error) {
            this.robot.logger.warn(`Job finalization failed`, { ...error });
        }
    }

    getState() {
        return this._state;
    }

    getErrorInfo() {
        return this._error;
    }

    getAwaitingInputKey() {
        return this.localFlow.awaitingInputKeys.find(_ => _ != null) || null;
    }

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
        }
    }

    /**
     * @internal
     */
    _setState(newState: JobState) {
        const previousState = this._state;
        this._state = newState;
        this.events.emit('stateChanged', newState, previousState);
    }

    /**
    * @internal
    */
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

    /**
    * @internal
    */
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

    /**
    * @internal
    */
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
