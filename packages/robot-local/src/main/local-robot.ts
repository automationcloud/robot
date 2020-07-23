import { ChromeLauncher } from '@ubio/engine';
import { Robot, JobCreateParams, Job } from '@automationcloud/robot';
import { LocalJob, LocalScriptInit } from './local-job';

export type LocalRobotConfig = LocalRobotRequiredParams & LocalRobotOptionalParams;
export type LocalRobotOptions = LocalRobotRequiredParams & Partial<LocalRobotOptionalParams>;

export interface LocalRobotRequiredParams {
    script: LocalScriptInit;
    chromePath: string;
}

export interface LocalRobotOptionalParams {
    chromePort: number;
    chromeHeadless: boolean;
    chromeAdditionalArgs: string[];
    autoRunJobs: boolean;
    inputTimeout: number;
}

export class LocalRobot extends Robot {
    launcher: ChromeLauncher;
    config: LocalRobotConfig;

    constructor(options: LocalRobotOptions) {
        super();
        this.config = {
            autoRunJobs: true,
            chromePort: 9123,
            chromeHeadless: true,
            chromeAdditionalArgs: [],
            inputTimeout: 60 * 1000,
            ...options,
        };
        this.launcher = new ChromeLauncher({
            chromePath: this.config.chromePath,
            chromePort: this.config.chromePort,
            additionalArgs: [
                this.config.chromeHeadless ? '--headless' : '',
                ...this.config.chromeAdditionalArgs,
            ].filter(Boolean),
        });
    }

    async _createJob(params: JobCreateParams): Promise<Job> {
        await this.ensureChromeRunning();
        const { category, input } = params;
        const { script, inputTimeout } = this.config;
        const job = new LocalJob(this, {
            category,
            input,
            script,
            inputTimeout,
        });
        if (this.config.autoRunJobs) {
            job.run();
        }
        return job;
    }

    async ensureChromeRunning() {
        // TODO consider downloading chrome as an option
        try {
            await this.launcher.tryConnect();
        } catch (err) {
            await this.launcher.launch();
        }
    }

}
