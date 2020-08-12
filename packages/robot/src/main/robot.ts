import { Job, JobCategory, JobInitParams } from './job';
import { Logger } from './logger';

export abstract class Robot {
    logger: Logger = console;

    async createJob(options: Partial<JobInitParams> = {}): Promise<Job> {
        return await this._createJob({
            category: JobCategory.TEST,
            input: {},
            ...options,
        });
    }

    protected abstract _createJob(params: JobInitParams): Promise<Job>;
}
