import { Job, JobCategory, JobInitParams } from './job';

export abstract class Robot {

    async createJob(options: Partial<JobInitParams> = {}): Promise<Job> {
        return await this._createJob({
            category: JobCategory.TEST,
            input: {},
            ...options,
        });
    }

    protected abstract _createJob(params: JobInitParams): Promise<Job>;
}
