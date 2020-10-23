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

export interface ExceptionSpec {
    name: string;
    code?: string;
    message?: string;
    details?: object;
}

/**
 * An error with formalized code and optional details.
 */
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
