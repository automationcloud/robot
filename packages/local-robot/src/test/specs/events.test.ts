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
import { JobState } from '@automationcloud/robot';

describe('Events', () => {

    describe('onStateChanged', () => {
        describe('AWAITING_INPUT', () => {
            it('emits on awaiting input', async () => {
                let called = false;
                const script = getScript([
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
                ]);
                const robot = new LocalRobot({ script });
                const job = await robot.createJob();
                job.onStateChanged(async state => {
                    if (state === JobState.AWAITING_INPUT) {
                        called = true;
                        await job.submitInput('value', { foo: 1 });
                    }
                });
                await job.waitForCompletion();
                assert.strictEqual(called, true);
                assert.deepStrictEqual(await job.getOutput('echo'), { foo: 1 });
            });
        });

        describe('SUCCESS', () => {
            it('emits on success', async () => {
                let called = false;
                const script = getScript();
                const robot = new LocalRobot({ script });
                const job = await robot.createJob();
                job.onStateChanged(async state => {
                    if (state === JobState.SUCCESS) {
                        called = true;
                    }
                });
                await job.waitForCompletion();
                assert.strictEqual(called, true);
            });
        });

        describe('FAIL', () => {
            it('emits on fail', async () => {
                let called = false;
                const script = getScript([
                    {
                        type: 'Flow.fail',
                        errorCode: 'Boo'
                    }
                ]);
                const robot = new LocalRobot({ script });
                const job = await robot.createJob();
                job.onStateChanged(async state => {
                    if (state === JobState.FAIL) {
                        called = true;
                    }
                });
                await job.waitForCompletion().catch(() => {});
                assert.strictEqual(called, true);
            });
        });

        describe('integration', () => {
            it('emits a sequence of state transitions', async () => {
                const states: JobState[] = [];
                const script = getScript([
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
                ]);
                const robot = new LocalRobot({ script });
                const job = await robot.createJob();
                job.onStateChanged(async state => {
                    states.push(state);
                });
                job.onAwaitingInput('value', () => {
                    return { foo: 1 };
                });
                await job.waitForCompletion();
                assert.deepStrictEqual(states, [JobState.PROCESSING, JobState.AWAITING_INPUT, JobState.SUCCESS]);
            });
        });
    });

    describe('onSuccess', () => {
        it('emits when job finishes successfully', async () => {
            let called = false;
            const script = getScript();
            const robot = new LocalRobot({ script });
            const job = await robot.createJob();
            job.onSuccess(async () => {
                called = true;
            });
            await job.waitForCompletion();
            assert.strictEqual(called, true);
        });
    });

    describe('onFail', () => {
        it('emits when job fails', async () => {
            let error: any = null;
            const script = getScript([
                {
                    type: 'Flow.fail',
                    errorCode: 'Boo',
                }
            ]);
            const robot = new LocalRobot({ script });
            const job = await robot.createJob();
            job.onFail(async err => {
                error = err;
            });
            await job.waitForCompletion().catch(() => {});
            assert.strictEqual(error?.code, 'Boo');
        });
    });

});

function getScript(actions: any[] = [
    { type: 'Flow.group' }
]) {
    return {
        id: 'my-script',
        contexts: [
            {
                type: 'main',
                children: actions
            }
        ]
    };
}
