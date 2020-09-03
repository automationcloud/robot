import { Server, createServer, IncomingMessage, ServerResponse } from 'http';
import { AcJob, AcJobEvent, AcJobEventName, AcJobOutput, AcJobInput } from '../main/ac-api';
import { JobState, JobInputObject, JobError } from '@automationcloud/robot';
import { CloudRobot } from '../main';

const PORT = Number(process.env.TEST_PORT) || 3008;

export class AcMock {
    config: MockConfig;
    server: Server;

    job: AcJob | null = null;
    inputs: AcJobInput[] = [];
    outputs: AcJobOutput[] = [];
    events: AcJobEvent[] = [];

    routes: Record<string, RouteHandler> = {
        'POST /jobs': params => this.createJob(params.body),
        'GET /jobs/*': (_params, id) => this.getJob(id),
        'GET /jobs/*/events': (params, id) => this.getJobEvents(id, Number(params.query.get('offset')) || 0),
        'GET /jobs/*/outputs/*': (_params, id, key) => this.getJobOutput(id, key),
        'POST /jobs/*/inputs': (params, id) => this.createInput(id, params.body.key, params.body.data),
    };

    protected _inputTimeoutTimer: any;

    constructor(options: Partial<MockConfig> = {}) {
        this.config = {
            port: PORT,
            inputTimeout: 100,
            ...options,
        };
        this.server = createServer((req, res) => this.dispatch(req, res));
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

    protected async createJob(body: any): Promise<MockResponse> {
        this.job = {
            id: randomId(),
            awaitingInputKey: null,
            category: body.category || 'test',
            state: JobState.PROCESSING,
            error: null,
            serviceId: body.serviceId,
        };
        this.addInputObject(body.input);
        return {
            status: 200,
            body: this.job,
        };
    }

    protected async getJob(jobId: string): Promise<MockResponse> {
        if (this.job?.id !== jobId) {
            return { status: 404 };
        }
        return { status: 200, body: this.job };
    }

    protected async getJobEvents(jobId: string, offset: number = 0): Promise<MockResponse> {
        if (this.job?.id !== jobId) {
            return { status: 404 };
        }
        return {
            status: 200,
            body: {
                data: this.events.slice(offset)
            },
        };
    }

    protected async getJobOutput(jobId: string, key: string) {
        if (this.job?.id !== jobId) {
            return { status: 404 };
        }
        const output = this.outputs.find(_ => _.key === key);
        return output ? {
            status: 200,
            body: output
        } : { status: 404 };
    }

    protected async createInput(jobId: string, key: string, data: any) {
        if (this.job?.id !== jobId) {
            return { status: 404 };
        }
        this.addInputObject({ [key]: data });
        if (this.job.awaitingInputKey === key) {
            clearTimeout(this._inputTimeoutTimer);
            this.setState(JobState.PROCESSING);
        }
        return { status: 201 };
    }

    // Request handling

    protected async route(params: MockRequestParams): Promise<MockResponse> {
        // console.log(params.method, params.path);
        for (const [expr, handler] of Object.entries(this.routes)) {
            const regexp = new RegExp('^' +
                expr.replace(/\//g, '\\/').replace(/\*/g, '([^\\/]+?)') +
                '\\/?$');
            const match = regexp.exec(`${params.method} ${params.path}`);
            if (!match) {
                continue;
            }
            const pathArgs = [].slice.call(match, 1);
            return handler(params, ...pathArgs);
        }
        return { status: 404 };
    }

    protected async dispatch(req: IncomingMessage, res: ServerResponse) {
        try {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
                chunks.push(chunk);
            }
            const payload = Buffer.concat(chunks).toString('utf-8').trim();
            const json = payload ? JSON.parse(payload) : null;
            const url = new URL(req.url!, this.url);
            const params: MockRequestParams = {
                method: req.method!.toUpperCase(),
                path: url.pathname,
                headers: req.headers as Record<string, string>,
                query: new URLSearchParams(url.search),
                body: json,
            };
            const response = await this.route(params);
            res.writeHead(response.status).end(JSON.stringify(response.body || {}));
        } catch (err) {
            res.writeHead(400, 'Malformed request')
                .end(JSON.stringify({
                    name: 'MalformedRequest',
                    message: err.message,
                }));
        }
    }

}

function randomId() {
    return Math.random().toString(36).substring(2);
}

interface MockRequestParams {
    method: string;
    path: string;
    headers: Record<string, string>;
    query: URLSearchParams;
    body: any;
}

interface MockResponse {
    status: number;
    body?: any;
}

interface MockConfig {
    port: number;
    inputTimeout: number;
}

type RouteHandler = (params: MockRequestParams, ...pathArgs: string[]) => Promise<MockResponse>;
