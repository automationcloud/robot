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

import { CloudRobot } from './cloud-robot';
import { Request, BasicAuthAgent, OAuth2Agent } from '@automationcloud/request';

/**
 * Vault is used to store sensitive information like payment card number (PAN).
 *
 * The typical usage involves:
 *
 * - obtaining a one-time password: `const otp = await robot.vault.createOtp()`
 * - putting the card number into the vault: `const panToken = await robot.vault.createPanToken(pan, otp)`;
 * - using the obtained token as part of Job input
 */
export class Vault {
    protected request: Request;

    constructor(protected robot: CloudRobot) {
        const { config } = robot;
        const auth = typeof config.auth === 'string' ?
            new BasicAuthAgent({ username: config.auth }) :
            new OAuth2Agent({
                clientId: config.auth.clientId,
                clientSecret: config.auth.clientSecret,
                tokenUrl: config.apiTokenUrl,
            });
        this.request = new Request({
            baseUrl: config.vaultUrl,
            auth,
        });
    }

    protected get api() {
        return this.robot.api;
    }

    /**
     * Creates one time password (OTP) which can subsequently be used to put data to vault.
     */
    async createOtp(): Promise<string> {
        const { id } = await this.request.post('/otp');
        return id;
    }

    /**
     * Exchanges payment card number (PAN) to a pan token which can be safely passed around
     * (i.e. used as part of inputs).
     *
     * If `otp` is not provided, it will be automatically created.
     */
    async createPanToken(pan: string, existingOtp?: string): Promise<string> {
        const otp = existingOtp ?? await this.createOtp();
        const { panToken } = await this.request.post('/pan', {
            body: { otp, pan },
        });
        return panToken;
    }

}
