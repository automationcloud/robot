import { Job, JobInputObject, JobCategory } from './job';

export abstract class Robot {

    async createJob(options: Partial<JobCreateParams> = {}): Promise<Job> {
        return await this._createJob({
            category: JobCategory.TEST,
            input: {},
            ...options,
        });
    }

    protected abstract _createJob(params: JobCreateParams): Promise<Job>;
}

export interface JobCreateParams {
    input: JobInputObject;
    category: JobCategory;
}
