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

import { AcMock } from '../ac-mock';
import assert from 'assert';

describe('Vault', () => {
    const mock = new AcMock();

    beforeEach(() => mock.start());
    afterEach(() => mock.stop());

    describe('createOtp', () => {
        it('creates an otp', async () => {
            const robot = mock.createRobot();
            const otp = await robot.vault.createOtp();
            assert.ok(typeof otp === 'string');
            assert.strict(otp, mock.otp!);
        });
    });

    describe('createPanToken', () => {
        it('creates token with existing otp', async () => {
            const robot = mock.createRobot();
            const otp = await robot.vault.createOtp();
            const panToken = await robot.vault.createPanToken('4111111111111111', otp);
            assert.strictEqual(panToken, 'some-pan-token');
            assert.strictEqual(mock.otp, null);
        });

        it('does not allow reusing otp', async () => {
            const robot = mock.createRobot();
            const otp = await robot.vault.createOtp();
            await robot.vault.createPanToken('4111111111111111', otp);
            try {
                await robot.vault.createPanToken('4111111111111111', otp);
                throw new Error('UnexpectedSuccess');
            } catch (err) {
                assert.strictEqual(err.name, 'RequestFailed');
                assert.strictEqual(err.details.status, 403);
            }
        });

        it('creates adhoc otp when not provided', async () => {
            const robot = mock.createRobot();
            const panToken = await robot.vault.createPanToken('4111111111111111');
            assert.strictEqual(panToken, 'some-pan-token');
            assert.strictEqual(mock.otp, null);
        });
    });

});
