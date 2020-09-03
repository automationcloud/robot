import { Request, BasicAuthAgent, OAuth2Agent } from '@automationcloud/request';
import { CloudRobotAuthParams } from './cloud-robot';
import { JobInputObject, JobCategory, JobState, Logger, JobError } from '@automationcloud/robot';

export interface AcApiParams {
    apiUrl: string;
    apiTokenUrl: string;
    auth: CloudRobotAuthParams;
    logger: Logger,
}

export class AcApi {
    request: Request;

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
            onRetry: this.onRetry.bind(this),
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
            if (err.response?.status === 404) {
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

    protected onRetry(error: Error) {
        this.params.logger.warn('Request failed, retrying', { error });
    }

}

export interface AcJob {
    id: string;
    serviceId: string;
    category: JobCategory;
    state: JobState;
    awaitingInputKey: string | null;
    error: JobError | null;
}

export interface AcJobEvent {
    id: string;
    name: AcJobEventName;
    key?: string;
    createdAt: number;
}

export type AcJobEventName = 'awaitingInput' | 'createOutput' | 'success' | 'fail' | 'tdsStart' | 'tdsFinish' | 'restart' | 'processing';

export interface AcJobInput {
    jobId: string;
    key: string;
    data: any;
    encrypted: boolean;
}

export interface AcJobOutput {
    jobId: string;
    key: string;
    data: any;
}
