import { LocalRobot } from '../../main/local-robot';
import assert from 'assert';

describe('Outputs', () => {

    const script = {
        id: 'my-script',
        contexts: [
            {
                type: 'main',
                children: [
                    {
                        type: 'Flow.output',
                        outputKey: 'someOutput',
                        pipeline: [
                            {
                                type: 'Value.getJson',
                                value: JSON.stringify({ foo: 123 })
                            }
                        ]
                    }
                ]
            }
        ]
    };

    describe('waitForOutput', () => {
        it('resolves instantly if output is already produced', async () => {
            const robot = new LocalRobot({
                chromePath: process.env.CHROME_PATH!,
                script,
            });
            const job = await robot.createJob();
            await job.waitForCompletion();
            const [someOutput] = await job.waitForOutputs('someOutput');
            assert.deepEqual(someOutput, { foo: 123 });
        });

        it('resolves after output is produced', async () => {
            const robot = new LocalRobot({
                chromePath: process.env.CHROME_PATH!,
                script,
            });
            const job = await robot.createJob();
            const [someOutput] = await job.waitForOutputs('someOutput');
            assert.deepEqual(someOutput, { foo: 123 });
        });
    });

    describe('getOutput', () => {
        it('returns undefined if output is not ready yet', async () => {
            const robot = new LocalRobot({
                chromePath: process.env.CHROME_PATH!,
                script,
                autoRunJobs: false,
            });
            const job = await robot.createJob();
            const output = await job.getOutput('someOutput');
            assert.equal(output, undefined);
        });

        it('resolves output if it is produced', async () => {
            const robot = new LocalRobot({
                chromePath: process.env.CHROME_PATH!,
                script,
            });
            const job = await robot.createJob();
            await job.waitForCompletion();
            const someOutput = await job.getOutput('someOutput');
            assert.deepEqual(someOutput, { foo: 123 });
        });
    });

});
