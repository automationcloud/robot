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

import { Request, BasicAuthAgent, OAuth2Agent } from '@automationcloud/request';
import { CloudRobotAuthParams } from './cloud-robot';
import { JobInputObject, JobCategory, JobState, Logger, JobError } from '@automationcloud/robot';

/**
 * Automation Cloud HTTP client adapter.
 *
 * @internal
 */
export class AcApi {
    protected request: Request;

    constructor(
        public params: AcApiParams,
    ) {
        const auth = typeof params.auth === 'string' ?
            new BasicAuthAgent({ username: params.auth }) :
            new OAuth2Agent({
                clientId: params.auth.clientId,
                clientSecret: params.auth.clientSecret,
                tokenUrl: params.apiTokenUrl,
            });
        this.request = new Request({
            baseUrl: params.apiUrl,
            auth,
        });
    }

    async createJob(params: {
        serviceId: string,
        category: JobCategory,
        input: JobInputObject,
    }): Promise<AcJob> {
        const { serviceId, category, input } = params;
        const body = await this.request.post('/jobs', {
            body: {
                serviceId,
                category,
                input,
            }
        });
        return body;
    }

    async getJob(jobId: string): Promise<AcJob> {
        const body = await this.request.get(`/jobs/${jobId}`);
        return body;
    }

    async getJobEvents(jobId: string, offset: number): Promise<AcJobEvent[]> {
        const { data } = await this.request.get(`/jobs/${jobId}/events`, {
            query: { offset },
        });
        return data;
    }

    async getJobOutputData(jobId: string, key: string): Promise<AcJobOutput | null> {
        try {
            const body = await this.request.get(`/jobs/${jobId}/outputs/${key}`);
            return body;
        } catch (err) {
            if (err.details?.status === 404) {
                return null;
            }
            throw err;
        }
    }

    async sendJobInput(jobId: string, key: string, data: any): Promise<AcJobInput> {
        const body = await this.request.post(`/jobs/${jobId}/inputs`, {
            body: {
                key,
                data,
            },
        });
        return body;
    }

    async cancelJob(jobId: string) {
        await this.request.post(`/jobs/${jobId}/cancel`);
    }

    async queryPreviousOutputs(serviceId: string, key?: string, inputs: JobInputObject[] = []): Promise<AcPreviousJobOutput[]> {
        const { data } = await this.request.post(`/services/${serviceId}/previous-job-outputs`, {
            body: {
                inputs
            },
            query: {
                key
            }
        });
        return data;
    }
}

/**
 * @internal
 */
export interface AcJob {
    id: string;
    serviceId: string;
    category: JobCategory;
    state: JobState;
    awaitingInputKey: string | null;
    error: JobError | null;
}

/**
 * @internal
 */
export interface AcJobEvent {
    id: string;
    name: AcJobEventName;
    key?: string;
    createdAt: number;
}

/**
 * @internal
 */
export type AcJobEventName = 'awaitingInput' | 'createOutput' | 'success' | 'fail' | 'tdsStart' | 'tdsFinish' | 'restart' | 'processing';

/**
 * @internal
 */
export interface AcJobInput {
    jobId: string;
    key: string;
    data: any;
    encrypted: boolean;
}

/**
 * @internal
 */
export interface AcJobOutput {
    jobId: string;
    key: string;
    data: any;
}

/**
 * @internal
 */
export interface AcPreviousJobOutput {
    jobId: string;
    key: string;
    data: any;
    variability: number;
}

/**
 * @internal
 */
export interface AcApiParams {
    apiUrl: string;
    apiTokenUrl: string;
    auth: CloudRobotAuthParams;
    logger: Logger,
}
