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

import * as http from 'http';
import { AcJob, AcJobEvent, AcJobEventName, AcJobOutput, AcJobInput } from '../main/ac-api';
import { JobState, JobInputObject, JobError } from '@automationcloud/robot';
import { CloudRobot } from '../main';
import Koa from 'koa';
import Router from 'koa-router2';
import bodyParser from 'koa-body';

const PORT = Number(process.env.TEST_PORT) || 3008;

export class AcMock {
    config: MockConfig;
    app: Koa;
    server: http.Server;
    router: Router;

    job: AcJob | null = null;
    inputs: AcJobInput[] = [];
    outputs: AcJobOutput[] = [];
    events: AcJobEvent[] = [];

    protected _inputTimeoutTimer: any;

    constructor(options: Partial<MockConfig> = {}) {
        this.config = {
            port: PORT,
            inputTimeout: 100,
            ...options,
        };
        this.app = new Koa();
        this.router = new Router();
        this.router.post('/jobs', ctx => this.createJob(ctx));
        this.router.get('/jobs/:id', ctx => this.getJob(ctx));
        this.router.get('/jobs/:id/events', ctx => this.getJobEvents(ctx));
        this.router.get('/jobs/:id/outputs/:outputKey', ctx => this.getJobOutput(ctx));
        this.router.post('/jobs/:id/inputs', ctx => this.createInput(ctx));
        this.router.post('/services/:id/previous-job-outputs', ctx => this.getPreviousJobOutput(ctx));
        this.app.use(async (ctx, next) => {
            try {
                ctx.body = {};
                await next();
            } catch (err) {
                ctx.status = 500;
                ctx.body = { ...err };
            }
        });
        this.app.use(bodyParser({ json: true }));
        this.app.use(this.router.routes());
        this.server = http.createServer(this.app.callback());
    }

    reset() {
        this.job = null;
        this.inputs = [];
        this.outputs = [];
        this.events = [];
    }

    createRobot(): CloudRobot {
        return new CloudRobot({
            serviceId: '123',
            auth: 'secret-key',
            pollInterval: 10,
            apiUrl: this.url,
        });
    }

    get url() {
        return `http://localhost:${this.config.port}`;
    }

    start() {
        this.reset();
        return new Promise(resolve => this.server.listen(this.config.port, resolve));
    }

    stop() {
        return new Promise(resolve => this.server.close(resolve));
    }

    // Behaviour modifiers

    setState(newState: JobState) {
        this.job!.state = newState;
        switch (newState) {
            case JobState.PROCESSING:
                this.addEvent('processing');
                break;
            case JobState.SUCCESS:
                this.addEvent('success');
                break;
            case JobState.FAIL:
                this.addEvent('fail');
                break;
            case JobState.AWAITING_INPUT:
                this.addEvent('awaitingInput', this.job?.awaitingInputKey || undefined);
                break;
            case JobState.AWAITING_TDS:
                this.addEvent('tdsStart');
                break;
        }
    }

    addOutput(key: string, data: any) {
        this.outputs.push({
            key,
            data,
            jobId: this.job!.id,
        });
        this.addEvent('createOutput', key);
    }

    addEvent(name: AcJobEventName, key?: string) {
        this.events.push({
            id: randomId(),
            name,
            key,
            createdAt: Date.now(),
        });
    }

    requestInput(key: string) {
        this.job!.awaitingInputKey = key;
        this.addEvent('awaitingInput', key);
        this._inputTimeoutTimer = setTimeout(() => {
            this.fail({
                category: 'client',
                code: 'InputTimeout',
                message: `Input ${key} was not provided in time`,
                details: { key }
            });
        }, this.config.inputTimeout);
    }

    success() {
        return this.setState(JobState.SUCCESS);
    }

    fail(error: JobError) {
        this.job!.error = error;
        this.setState(JobState.FAIL);
    }

    addInputObject(obj: JobInputObject) {
        for (const [key, data] of Object.entries(obj)) {
            this.inputs.push({
                jobId: this.job!.id,
                key,
                data,
                encrypted: false,
            });
        }
    }

    // Routes

    protected async createJob(ctx: Koa.Context) {
        this.job = {
            id: randomId(),
            awaitingInputKey: null,
            category: ctx.request.body.category || 'test',
            state: JobState.PROCESSING,
            error: null,
            serviceId: ctx.request.body.serviceId,
        };
        this.addInputObject(ctx.request.body.input);
        ctx.status = 200;
        ctx.body = this.job;
    }

    protected async getJob(ctx: Koa.Context) {
        if (this.job?.id !== ctx.params.id) {
            ctx.status = 404;
            return;
        }
        ctx.status = 200;
        ctx.body = this.job;
    }

    protected async getJobEvents(ctx: Koa.Context) {
        if (this.job?.id !== ctx.params.id) {
            ctx.status = 404;
            return;
        }
        ctx.status = 200;
        ctx.body = {
            data: this.events.slice(Number(ctx.query.offset) || 0)
        };
    }

    protected async getJobOutput(ctx: Koa.Context) {
        if (this.job?.id !== ctx.params.id) {
            ctx.status = 404;
            return;
        }
        const output = this.outputs.find(_ => _.key === ctx.params.outputKey);
        if (output) {
            ctx.status = 200;
            ctx.body = output;
        } else {
            ctx.status = 404;
        }
    }

    protected async createInput(ctx: Koa.Context) {
        if (this.job?.id !== ctx.params.id) {
            ctx.status = 404;
            return;
        }
        const { key, data } = ctx.request.body;
        this.addInputObject({ [key]: data });
        if (this.job?.awaitingInputKey === key) {
            clearTimeout(this._inputTimeoutTimer);
            this.setState(JobState.PROCESSING);
        }
        ctx.status = 201;
    }

    protected async getPreviousJobOutput(ctx: Koa.Context) {
        const output = this.outputs.find(_ => _.key === ctx.query.key);
        if (output) {
            ctx.status = 200;
            ctx.body = output;
        } else {
            ctx.status = 404;
        }
    }

}

function randomId() {
    return Math.random().toString(36).substring(2);
}

interface MockConfig {
    port: number;
    inputTimeout: number;
}
