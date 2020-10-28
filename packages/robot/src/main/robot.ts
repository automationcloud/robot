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

import { Job, JobCategory, JobInitParams } from './job';
import { Logger } from './logger';

/**
 * A Robot instance which is used to execute a particular script.
 *
 * Robot instance is scoped to a script or service and can be used
 * to create multiple jobs with the same configuration.
 * For creating jobs that execute different scripts, separate Robot instances should be created.
 */
export abstract class Robot {
    logger: Logger = console;

    /**
     * Creates a new job which conceptually results in starting an automation
     * and starts tracking its lifecycle events (i.e. emitted outputs, requested inputs, success,
     * failures, etc.)
     *
     * The exact behaviour depends on the underlying mechanism:
     *
     * - `LocalRobot` will run a provided script using the embedded `Engine`
     *   connected to a local Chromium instance;
     * - `CloudRobot` submits a new job to Automation Cloud API and starts tracking it
     *   by polling its state.
     *
     * The job is automatically tracked after creation. The tracking stops after the job
     * reaches one of the final states (`success`, `fail`). For this reason it is recommended
     * that `await job.waitForCompletion()` is always included to prevent dangling promises
     * and unhandled promise rejections.
     *
     * Please refer to specific implementations for more details.
     *
     * @param options Job initilalization parameters (includes `category` and `input`).
     */
    async createJob(options: Partial<JobInitParams> = {}): Promise<Job> {
        return await this._createJob({
            category: JobCategory.TEST,
            input: {},
            ...options,
        });
    }

    /**
     * An actual implementation of job create functionality.
     *
     * @param params
     * @internal
     */
    protected abstract _createJob(params: JobInitParams): Promise<Job>;
}
