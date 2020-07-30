import { JobInput, JobOutput, JobState } from '@automationcloud/robot';
import { EventEmitter } from 'events';
import { injectable } from 'inversify';

export interface JobEvents {
    emit(event: 'input', input: JobInput): boolean;
    emit(event: 'output', output: JobOutput): boolean;
    emit(event: 'inputRequested', key: string): boolean;
    emit(event: 'error', error: Error): boolean;
    emit(event: 'stateChanged', newState: JobState, previousState: JobState): boolean;
    on(event: 'input', fn: (input: JobInput) => void): this;
    on(event: 'output', fn: (output: JobOutput) => void): this;
    on(event: 'inputRequested', fn: (key: string) => void): this;
    on(event: 'error', fn: (error: Error) => void): this;
    on(event: 'stateChanged', fn: (newState: JobState, previousState: JobState) => void): this;
}

@injectable()
export class JobEvents extends EventEmitter implements JobEvents {}
