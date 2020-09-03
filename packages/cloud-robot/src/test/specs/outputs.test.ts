import { AcMock } from '../ac-mock';
import assert from 'assert';

describe('Outputs', () => {

    const mock = new AcMock();

    beforeEach(() => mock.start());
    afterEach(() => mock.stop());

    describe('waitForOutput', () => {
        context('output already produced', () => {
            it('resolves instantly', async () => {
                const robot = mock.createRobot();
                const job = await robot.createJob();
                mock.addOutput('someOutput', { foo: 123 });
                mock.success();
                await job.waitForCompletion();
                const [someOutput] = await job.waitForOutputs('someOutput');
                assert.deepEqual(someOutput, { foo: 123 });
            });
        });

        context('output produced later by script', () => {
            it('resolves', async () => {
                const robot = mock.createRobot();
                const job = await robot.createJob();
                setTimeout(() => {
                    mock.addOutput('someOutput', { foo: 123 });
                }, 100);
                const [someOutput] = await job.waitForOutputs('someOutput');
                assert.deepEqual(someOutput, { foo: 123 });
                mock.success();
                await job.waitForCompletion();
            });
        });

        context('job success, outputs not emitted', () => {
            it('rejects', async () => {
                const robot = mock.createRobot();
                const job = await robot.createJob();
                mock.success();
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
                const robot = mock.createRobot();
                const job = await robot.createJob();
                mock.fail({ category: 'server', code: 'Boo', message: 'Boo dude' });
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
            const robot = mock.createRobot();
            const job = await robot.createJob();
            const output = await job.getOutput('someOutput');
            assert.equal(output, undefined);
            mock.success();
            await job.waitForCompletion();
        });

        it('resolves output if it is produced', async () => {
            const robot = mock.createRobot();
            const job = await robot.createJob();
            mock.addOutput('someOutput', { foo: 123 });
            const someOutput = await job.getOutput('someOutput');
            assert.deepEqual(someOutput, { foo: 123 });
            mock.success();
            await job.waitForCompletion();
        });
    });

});
