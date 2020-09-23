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

import { LocalRobot } from '../../main/local-robot';
import assert from 'assert';
import { LocalJob } from '../../main/local-job';

describe('Inputs', () => {

    const script = {
        id: 'my-script',
        contexts: [
            {
                type: 'main',
                children: [
                    {
                        type: 'Flow.output',
                        outputKey: 'echo',
                        pipeline: [
                            {
                                type: 'Value.getInput',
                                inputKey: 'value'
                            }
                        ]
                    }
                ]
            }
        ]
    };

    context('input pre-supplied', () => {
        it('resolves input immediately', async () => {
            const robot = new LocalRobot({ script });
            const job = await robot.createJob({
                input: {
                    value: { foo: 1 }
                }
            });
            const [echo] = await job.waitForOutputs('echo');
            assert.deepEqual(echo, { foo: 1 });
        });
    });

    context('input requested, but not provided', () => {
        it('rejects after input timeout', async () => {
            const robot = new LocalRobot({ script, inputTimeout: 200 });
            const job = await robot.createJob();
            try {
                await job.waitForCompletion();
            } catch (err) {
                assert.equal(err.name, 'InputTimeout');
                assert.equal(err.details.key, 'value');
            }
        });
    });

    context('input requested and provided', () => {
        it('resolves input', async () => {
            const robot = new LocalRobot({ script });
            const job = await robot.createJob();
            job.onAwaitingInput('value', async () => {
                // Support async
                await Promise.resolve();
                return { bar: 2 };
            });
            const [echo] = await job.waitForOutputs('echo');
            assert.deepEqual(echo, { bar: 2 });
        });
    });

    describe('submitInput', () => {
        it('adds input', async () => {
            const robot = new LocalRobot({ script, autoRunJobs: true });
            const job = await robot.createJob();
            await job.submitInput('value', { baz: 222 });
            (job as LocalJob).run();
            const [echo] = await job.waitForOutputs('echo');
            assert.deepEqual(echo, { baz: 222 });
        });
    });

});
