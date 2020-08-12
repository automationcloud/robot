import { ChromeLauncher, Exception } from '@ubio/engine';
import { Robot, JobInitParams, Job } from '@automationcloud/robot';
import { LocalJob } from './local-job';

export type LocalRobotConfig = LocalRobotRequiredParams & LocalRobotOptionalParams;
export type LocalRobotOptions = LocalRobotRequiredParams & Partial<LocalRobotOptionalParams>;

export interface LocalRobotRequiredParams {
    script: LocalScriptInit;
}

export type LocalScriptInit = string | object;

export interface LocalRobotOptionalParams {
    chromePath: string;
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
            chromePath: process.env.CHROME_PATH!,
            chromePort: parseInt(process.env.CHROME_PORT!) || 9123,
            chromeHeadless: true,
            chromeAdditionalArgs: [],
            autoRunJobs: true,
            inputTimeout: 60 * 1000,
            ...options,
        };
        if (!this.config.chromePath) {
            throw new Exception({
                name: 'ChromePathNotSpecified',
                message: 'Please specify chromePath option or CHROME_PATH env variable',
            });
        }
        this.launcher = new ChromeLauncher({
            chromePath: this.config.chromePath,
            chromePort: this.config.chromePort,
            additionalArgs: [
                this.config.chromeHeadless ? '--headless' : '',
                ...this.config.chromeAdditionalArgs,
            ].filter(Boolean),
        });
    }

    async _createJob(params: JobInitParams): Promise<Job> {
        await this.ensureChromeRunning();
        const { autoRunJobs } = this.config;
        const job = new LocalJob(this, params);
        if (autoRunJobs) {
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
