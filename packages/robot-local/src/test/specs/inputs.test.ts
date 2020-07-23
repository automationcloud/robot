import { LocalRobot } from '../../main/local-robot';
import assert from 'assert';

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
            const job = await robot.createJob({
                input: {}
            });
            try {
                await job.waitForFinish();
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
            const job = await robot.createJob({
                input: {}
            });
            job.onAwaitingInput('value', () => {
                return { bar: 2 };
            });
            const [echo] = await job.waitForOutputs('echo');
            assert.deepEqual(echo, { bar: 2 });
        });
    });

});
