export interface Job {
    // pnr: boolean;
    // createdAt: number;
    // updatedAt: number;
    // finishedAt: number | null;
    // outputs: JobOutputMeta[];

    awaitingInputKey: string | null;
    category: JobCategory;

    createInput(key: string, data: any): Promise<JobInput>;
    getOutput(key: string): Promise<JobOutput | null>;
    waitForFinish(): Promise<void>;
    waitForOutputs(...keys: string[]): Promise<any[]>;
    cancel(): Promise<void>;

    // Experimental
    onAwaitingInput(inputKey: string, fn: () => any | Promise<any>): JobEventHandler;
    onOutput(outputKey: string, fn: (data: any) => void | Promise<void>): JobEventHandler;
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
    id: string;
    key: string;
    data: any;
    createdAt: number;
    updatedAt: number;
}

export interface JobOutputMeta {
    key: string;
    createdAt: number;
}

export interface JobInput {
    id: string;
    key: string;
    data: any;
    encrypted: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface JobInputObject {
    [key: string]: any;
}

export type JobEventHandler = () => void;
