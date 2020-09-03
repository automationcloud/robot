export interface ExceptionSpec {
    name: string;
    code?: string;
    message?: string;
    details?: object;
}

export class Exception extends Error {
    code: string;
    details?: any;

    constructor(spec: ExceptionSpec) {
        super(spec.message);
        this.name = spec.name;
        this.code = spec.code || spec.name;
        this.message = spec.message || spec.name;
        this.details = spec.details;
    }

}
