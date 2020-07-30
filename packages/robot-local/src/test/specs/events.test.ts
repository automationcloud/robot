import { LocalRobot } from '../../main/local-robot';
import assert from 'assert';
import { JobState } from '@automationcloud/robot';

describe('Events', () => {

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

    describe('onStateChanged', () => {
        describe('AWAITING_INPUT', () => {
            it('emits on awaiting input', async () => {
                let called = false;
                const robot = new LocalRobot({ script });
                const job = await robot.createJob();
                job.onStateChanged(async state => {
                    if (state === JobState.AWAITING_INPUT) {
                        called = true;
                        await job.submitInput('value', { foo: 1 });
                    }
                });
                await job.waitForCompletion();
                assert.equal(called, true);
                assert.deepEqual(await job.getOutput('echo'), { foo: 1 });
            });
        });

        describe('SUCCESS', () => {
            it('emits on success', async () => {
                let called = false;
                const robot = new LocalRobot({ script });
                const job = await robot.createJob({ input: { value: '123' } });
                job.onStateChanged(async state => {
                    if (state === JobState.SUCCESS) {
                        called = true;
                    }
                });
                await job.waitForCompletion();
                assert.equal(called, true);
            });
        });

        describe('FAIL', () => {
            it('emits on fail', async () => {
                let called = false;
                const robot = new LocalRobot({ script });
                const job = await robot.createJob();
                job.onAwaitingInput('value', () => {
                    throw new Error('boo');
                });
                job.onStateChanged(async state => {
                    if (state === JobState.FAIL) {
                        called = true;
                    }
                });
                await job.waitForCompletion().catch(() => {});
                assert.equal(called, true);
            });
        });

        describe('integration', () => {
            it('emits a sequence of state transitions', async () => {
                const states: JobState[] = [];
                const robot = new LocalRobot({ script });
                const job = await robot.createJob();
                job.onStateChanged(async state => {
                    states.push(state);
                });
                job.onAwaitingInput('value', () => {
                    return { foo: 1 };
                });
                await job.waitForCompletion();
                assert.deepEqual(states, [JobState.PROCESSING, JobState.AWAITING_INPUT, JobState.SUCCESS]);
            });
        });
    });

    describe('onSuccess', () => {
        it('emits when job finishes successfully', async () => {
            let called = false;
            const robot = new LocalRobot({ script });
            const job = await robot.createJob({ input: { value: '123' }});
            job.onSuccess(async () => {
                called = true;
            });
            await job.waitForCompletion();
            assert.equal(called, true);
        });
    });

    describe('onFail', () => {
        it('emits when job fails', async () => {
            let error: any = null;
            const robot = new LocalRobot({ script });
            const job = await robot.createJob();
            job.onFail(async err => {
                error = err;
            });
            job.onAwaitingInput('value', () => {
                throw new Error('boo');
            });
            await job.waitForCompletion().catch(() => {});
            assert.equal(error?.message, 'boo');
        });
    });

});
