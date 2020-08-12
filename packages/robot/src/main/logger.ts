/* eslint-disable no-console */
export interface Logger {
    info(message: string, object?: any): void;
    warn(message: string, object?: any): void;
    error(message: string, object?: any): void;
    debug(message: string, object?: any): void;
}
