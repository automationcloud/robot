import { AcMock } from '../ac-mock';
import assert from 'assert';

describe('Inputs', () => {

    const mock = new AcMock();

    beforeEach(() => mock.start());
    afterEach(() => mock.stop());

    context('input pre-supplied', () => {
        it('resolves input immediately', async () => {
            const robot = mock.createRobot();
            const job = await robot.createJob({
                input: {
                    value: { foo: 1 }
                }
            });
            mock.success();
            await job.waitForCompletion();
            const input = mock.inputs.find(_ => _.key === 'value');
            assert.ok(input);
            assert.equal(input.data.foo, 1);
        });
    });

    context('input requested, but not provided', () => {
        it('rejects after input timeout', async () => {
            const robot = mock.createRobot();
            const job = await robot.createJob();
            mock.requestInput('value');
            try {
                await job.waitForCompletion();
            } catch (err) {
                assert.equal(err.name, 'InputTimeout');
                assert.equal(err.details.key, 'value');
            }
        });
    });

    context.skip('input requested and provided', () => {
        it('resolves input', async () => {
            const robot = mock.createRobot();
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

    describe.skip('submitInput', () => {
        it('adds input', async () => {
            const robot = mock.createRobot();
            const job = await robot.createJob();
            job.submitInput('value', { baz: 222 });
            const [echo] = await job.waitForOutputs('echo');
            assert.deepEqual(echo, { baz: 222 });
        });
    });

});
