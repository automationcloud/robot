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

import { Robot, Job, JobInitParams } from '@automationcloud/robot';
import { CloudJob } from './cloud-job';
import { AcApi, AcJobInput, AcPreviousJobOutput } from './ac-api';

/**
 * Robot API used to execute automations remotely on Automation Cloud
 * and track their lifecycle events using HTTP polling.
 *
 * When the job is created the POST request is send to Automation Cloud,
 * which results in a new job being created. It is also possible to resume an existing job
 * using `robot.getJob(jobId)`, provided that `jobId` is known.
 *
 * A `CloudRobot` instance is scoped to a single service (which represents a Script in Automation Cloud)
 * and can be used to create multiple jobs with the same configuration.
 * For creating jobs that execute different scripts, separate CloudRobot instances should be created.
 *
 * @see {@link Robot}
 */
export class CloudRobot extends Robot {
    /**
     * Robot instance configuration.
     *
     * @see {@link CloudRobotConfig}
     */
    config: CloudRobotConfig;
    /**
     * @internal
     */
    api: AcApi;

    constructor(params: CloudRobotOptions) {
        super();
        this.config = {
            apiUrl: 'https://api.automationcloud.net',
            apiTokenUrl: 'https://auth.automationcloud.net/auth/realms/automationcloud/protocol/openid-connect/token',
            pollInterval: 1000,
            ...params,
        };
        this.api = new AcApi({
            apiTokenUrl: this.config.apiTokenUrl,
            apiUrl: this.config.apiUrl,
            auth: this.config.auth,
            logger: this.logger,
        });
    }

    /**
     * @internal
     */
    protected async _createJob(params: JobInitParams): Promise<Job> {
        const job = new CloudJob(this, params);
        await job.start();
        return job;
    }

    /**
     * Resumes the tracking of the job that was previously created.
     *
     * @param jobId can be obtained from `CloudJob` instance.
     */
    async getJob(jobId: string): Promise<Job> {
        const job = new CloudJob(this);
        await job.trackExisting(jobId);
        return job;
    }

    /**
     * Cloud-only API: queries Automation Cloud for outputs that were previously emitted
     * for this service, optionally matching specified `inputs`.
     *
     * @param key output key
     * @param inputs optionally filter the results by matching specified inputs
     */
    async queryPreviousOutput(key: string, inputs: AcJobInput[] = []): Promise<AcPreviousJobOutput | null> {
        const outputs = await this.api.queryPreviousOutputs(this.config.serviceId, key, inputs);
        return outputs.length ? outputs[0] : null;
    }
}

/**
 * Cloud robot configuration, consists of required and optional parameters.
 */
export type CloudRobotConfig = CloudRobotRequiredParams & CloudRobotOptionalParams;
export type CloudRobotOptions = CloudRobotRequiredParams & Partial<CloudRobotOptionalParams>;

/**
 * Automation Cloud Authentication. Use `string` form for legacy authentication (aka "client secret key"),
 * otherwise provide the OAuth2 details as an object (you can obtain them by creating a new Application in
 * Automation Cloud dashboard).
 */
export type CloudRobotAuthParams = string | {
    clientId: string;
    clientSecret: string;
}

/**
 * Required CloudRobot configuration parameters.
 */
export interface CloudRobotRequiredParams {
    /**
     * A UUID of the Service to be executed (you can obtain it from Automation Cloud dashboard).
     */
    serviceId: string;

    /**
     * Automation Cloud authentication parameters.
     */
    auth: CloudRobotAuthParams;
}

/**
 * Optional CloudRobot configuration parameters.
 */
export interface CloudRobotOptionalParams {
    apiUrl: string;
    apiTokenUrl: string;
    /**
     * Poll interval in milliseconds for job state synchronization. Default: `1000` (1 second).
     */
    pollInterval: number;
}
