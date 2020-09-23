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

export type CloudRobotConfig = CloudRobotRequiredParams & CloudRobotOptionalParams;
export type CloudRobotOptions = CloudRobotRequiredParams & Partial<CloudRobotOptionalParams>;

export type CloudRobotAuthParams = string | {
    clientId: string;
    clientSecret: string;
}

export interface CloudRobotRequiredParams {
    serviceId: string;
    auth: CloudRobotAuthParams;
}

export interface CloudRobotOptionalParams {
    apiUrl: string;
    apiTokenUrl: string;
    pollInterval: number;
}

export class CloudRobot extends Robot {
    config: CloudRobotConfig;

    constructor(params: CloudRobotOptions) {
        super();
        this.config = {
            apiUrl: 'https://api.automationcloud.net',
            apiTokenUrl: 'https://auth.automationcloud.net/auth/realms/automationcloud/protocol/openid-connect/token',
            pollInterval: 1000,
            ...params,
        };
    }

    protected async _createJob(params: JobInitParams): Promise<Job> {
        const job = new CloudJob(this, params);
        await job.start();
        return job;
    }

}
