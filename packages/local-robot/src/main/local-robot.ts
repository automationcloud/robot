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

import { ChromeLauncher, Exception } from '@automationcloud/engine';
import { Robot, JobInitParams, Job } from '@automationcloud/robot';
import { LocalJob } from './local-job';

/**
 * A Robot API instance which is used to execute a particular script
 * with embedded Engine using local Chromium instance.
 *
 * @see {@link Robot}
 */
export class LocalRobot extends Robot {
    launcher: ChromeLauncher;
    config: LocalRobotConfig;

    constructor(options: LocalRobotOptions) {
        super();
        this.config = {
            chromePath: process.env.CHROME_PATH!,
            chromePort: parseInt(process.env.CHROME_PORT!) || 9123,
            chromeHeadless: true,
            chromeAdditionalArgs: [],
            autoRunJobs: true,
            inputTimeout: 60 * 1000,
            closeAllTabs: false,
            closeActiveTab: true,
            ...options,
        };
        if (!this.config.chromePath) {
            throw new Exception({
                name: 'ChromePathNotSpecified',
                message: 'Please specify chromePath option or CHROME_PATH env variable',
            });
        }
        this.launcher = new ChromeLauncher({
            chromePath: this.config.chromePath,
            chromePort: this.config.chromePort,
            additionalArgs: [
                this.config.chromeHeadless ? '--headless' : '',
                ...this.config.chromeAdditionalArgs,
            ].filter(Boolean),
        });
    }

    /**
     * @internal
     */
    async _createJob(params: JobInitParams): Promise<Job> {
        await this.ensureChromeRunning();
        const { autoRunJobs } = this.config;
        const job = new LocalJob(this, params);
        if (autoRunJobs) {
            job.run();
        }
        return job;
    }

    /**
     * @internal
     */
    async ensureChromeRunning() {
        // TODO consider downloading chrome as an option
        try {
            await this.launcher.tryConnect();
        } catch (err) {
            await this.launcher.launch();
        }
    }

}

/**
 * Local robot configuration, includes mandatory `script` which can be
 * either a path to local file containing a script created an Autopilot, or the JSON object
 * representing the serialized script.
 */
export type LocalRobotConfig = LocalRobotRequiredParams & LocalRobotOptionalParams;
export type LocalRobotOptions = LocalRobotRequiredParams & Partial<LocalRobotOptionalParams>;

export interface LocalRobotRequiredParams {
    script: LocalScriptInit;
}

export type LocalScriptInit = string | object;

/**
 * Optional configuration parameters for local robot.
 */
export interface LocalRobotOptionalParams {
    /**
     * Local path to Chromium executable.
     * Default is taken from `CHROME_PATH` environment variable.
     */
    chromePath: string;
    /**
     * Chrome CDP port, as specified in `--remote-debugging-port` command line parameter.
     * Default: `9123`
     */
    chromePort: number;
    /**
     * Indicates whether `--headless` command line parameter will be used to launch Chromium.
     * Default: `false`.
     */
    chromeHeadless: boolean;
    /**
     * An array with additional arguments used to launch Chromium. Default: `[]`.
     */
    chromeAdditionalArgs: string[];
    /**
     * Specifies whether the jobs will be run automatically after they are created. Default: `true`.
     */
    autoRunJobs: boolean;
    /**
     * The duration in milliseconds of waiting for the requested input before failing the job
     * with `InputTimeout` error. Default: `60000` (1 minute).
     */
    inputTimeout: number;
    /**
     * Whether to close all existing tabs after the job is finished. Default: `false`.
     */
    closeAllTabs: boolean;
    /**
     * Whether to close the active tab after the job is finished.
     * Leaving the tab open can be handy for debugging, but not so much for automating on scale.
     * Default: `true`.
     */
    closeActiveTab: boolean;
}
