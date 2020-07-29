export interface JobInitParams {
    input: JobInputObject;
    category: JobCategory;
}

export interface Job {
    readonly category: JobCategory;
    readonly state: JobState;
    readonly awaitingInputKey: string | null;

    submitInput(key: string, data: any): Promise<void>;
    getOutput(key: string): Promise<any | undefined>;
    waitForCompletion(): Promise<void>;
    waitForOutputs(...keys: string[]): Promise<any[]>;
    cancel(): Promise<void>;
    onAwaitingInput(inputKey: string, fn: () => any | Promise<any>): JobEventHandler;
    onOutput(outputKey: string, fn: (data: any) => void | Promise<void>): JobEventHandler;
    onFail(fn: (err: Error) => void | Promise<void>): JobEventHandler;
    onSuccess(fn: () => void | Promise<void>): JobEventHandler;
    onStateChanged(fn: (newState: JobState) => void | Promise<void>): JobEventHandler;
}

export enum JobState {
    CREATED = 'created',
    SCHEDULED = 'scheduled',
    PROCESSING = 'processing',
    AWAITING_INPUT = 'awaitingInput',
    AWAITING_TDS = 'awaitingTds',
    PENDING = 'pending',
    SUCCESS = 'success',
    FAIL = 'fail',
}

export enum JobCategory {
    LIVE = 'live',
    TEST = 'test',
}

export interface JobOutput {
    key: string;
    data: any;
}

export interface JobInput {
    key: string;
    data: any;
}

export interface JobInputObject {
    [key: string]: any;
}

export type JobEventHandler = () => void;
