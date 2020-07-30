import { LocalRobot } from '../../main/local-robot';
import assert from 'assert';

describe('Outputs', () => {

    const script = getScript();

    describe('waitForOutput', () => {
        context('output already produced', () => {
            it('resolves instantly', async () => {
                const robot = new LocalRobot({ script });
                const job = await robot.createJob();
                await job.waitForCompletion();
                const [someOutput] = await job.waitForOutputs('someOutput');
                assert.deepEqual(someOutput, { foo: 123 });
            });
        });

        context('output produced later by script', () => {
            it('resolves', async () => {
                const robot = new LocalRobot({ script });
                const job = await robot.createJob();
                const [someOutput] = await job.waitForOutputs('someOutput');
                assert.deepEqual(someOutput, { foo: 123 });
            });
        });

        context('job success, outputs not emitted', () => {
            it('rejects', async () => {
                const robot = new LocalRobot({ script });
                const job = await robot.createJob();
                try {
                    await job.waitForOutputs('someOutput', 'someOtherOutput');
                    throw new Error();
                } catch (err) {
                    assert.equal(err.name, 'JobSuccessMissingOutputs');
                }
            });
        });

        context('job fail, outputs not emitted', () => {
            it('rejects', async () => {
                const script = getScript({ type: 'Flow.fail' });
                const robot = new LocalRobot({ script });
                const job = await robot.createJob();
                try {
                    await job.waitForOutputs('someOutput');
                    throw new Error();
                } catch (err) {
                    assert.equal(err.name, 'JobFailMissingOutputs');
                } finally {
                    // Mute unhandled rejection
                    await job.waitForCompletion().catch(() => {});
                }
            });
        });
    });

    describe('getOutput', () => {
        it('returns undefined if output is not ready yet', async () => {
            const robot = new LocalRobot({ script, autoRunJobs: false });
            const job = await robot.createJob();
            const output = await job.getOutput('someOutput');
            assert.equal(output, undefined);
        });

        it('resolves output if it is produced', async () => {
            const robot = new LocalRobot({ script });
            const job = await robot.createJob();
            await job.waitForCompletion();
            const someOutput = await job.getOutput('someOutput');
            assert.deepEqual(someOutput, { foo: 123 });
        });
    });

});

function getScript(outputOverrides: any = {}) {
    return {
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
                        ],
                        ...outputOverrides,
                    }
                ]
            }
        ]
    };
}
