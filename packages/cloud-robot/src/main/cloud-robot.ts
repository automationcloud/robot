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
