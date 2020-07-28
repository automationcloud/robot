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
            const robot = new LocalRobot({
                chromePath: process.env.CHROME_PATH!,
                script,
            });
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
            const robot = new LocalRobot({
                chromePath: process.env.CHROME_PATH!,
                script,
                inputTimeout: 200,
            });
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
            const robot = new LocalRobot({
                chromePath: process.env.CHROME_PATH!,
                script,
            });
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
            const robot = new LocalRobot({
                chromePath: process.env.CHROME_PATH!,
                script,
                autoRunJobs: true,
            });
            const job = await robot.createJob();
            job.submitInput('value', { baz: 222 });
            (job as LocalJob).run();
            const [echo] = await job.waitForOutputs('echo');
            assert.deepEqual(echo, { baz: 222 });
        });
    });

});
