import { JobInput, JobOutput } from '@automationcloud/robot';
import { EventEmitter } from 'events';
import { injectable } from 'inversify';

export interface JobEvents {
    emit(event: 'input', input: JobInput): boolean;
    emit(event: 'output', output: JobOutput): boolean;
    emit(event: 'inputRequested', key: string): boolean;
    emit(event: 'error', error: Error): boolean;
    on(event: 'input', fn: (input: JobInput) => void): this;
    on(event: 'output', fn: (output: JobOutput) => void): this;
    on(event: 'inputRequested', fn: (key: string) => void): this;
    on(event: 'error', fn: (error: Error) => void): this;
}

@injectable()
export class JobEvents extends EventEmitter implements JobEvents {}
