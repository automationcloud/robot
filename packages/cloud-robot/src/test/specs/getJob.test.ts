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
import { CloudJob } from '../../main';
import { JobState } from '@automationcloud/robot';

describe('getJob', () => {
    const mock = new AcMock();

    beforeEach(() => mock.start());
    afterEach(() => mock.stop());

    it('resumes tracking already created job', async () => {
        const robot = mock.createRobot();
        const job = (await robot.createJob()) as CloudJob;
        mock.addOutput('someOutput', { foo: 1 });
        const anotherInstance = await robot.getJob(job.jobId);
        mock.success();
        await job.waitForCompletion();
        await anotherInstance.waitForCompletion();
        assert.strictEqual(job.getState(), JobState.SUCCESS);
        assert.strictEqual(anotherInstance.getState(), JobState.SUCCESS);
        assert.deepStrictEqual(await job.getOutput('someOutput'), { foo: 1 });
        assert.deepStrictEqual(await anotherInstance.getOutput('someOutput'), { foo: 1 });
    });

});
