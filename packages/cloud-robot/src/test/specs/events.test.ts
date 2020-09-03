import { AcMock } from '../ac-mock';import assert from 'assert';
import { JobState } from '@automationcloud/robot';

describe('Events', () => {

    const mock = new AcMock();

    beforeEach(() => mock.start());
    afterEach(() => mock.stop());

    describe('onStateChanged', () => {
        describe('AWAITING_INPUT', () => {
            it('emits on awaiting input', async () => {
                let called = false;
                const robot = mock.createRobot();
                const job = await robot.createJob();
                mock.requestInput('value');
                job.onStateChanged(async state => {
                    if (state === JobState.AWAITING_INPUT) {
                        called = true;
                        await job.submitInput('value', { foo: 1 });
                        mock.success();
                    }
                });
                await job.waitForCompletion();
                assert.equal(called, true);
                const input = mock.inputs.find(_ => _.key === 'value');
                assert.deepEqual(input?.data, { foo: 1 });
            });
        });

        describe('SUCCESS', () => {
            it('emits on success', async () => {
                let called = false;
                const robot = mock.createRobot();
                const job = await robot.createJob();
                job.onStateChanged(async state => {
                    if (state === JobState.SUCCESS) {
                        called = true;
                    }
                });
                mock.success();
                await job.waitForCompletion();
                assert.equal(called, true);
            });
        });

        describe('FAIL', () => {
            it('emits on fail', async () => {
                let called = false;
                const robot = mock.createRobot();
                const job = await robot.createJob();
                job.onStateChanged(async state => {
                    if (state === JobState.FAIL) {
                        called = true;
                    }
                });
                mock.fail({ category: 'server', code: 'Boo', message: 'Boo me said' });
                await job.waitForCompletion().catch(() => { });
                assert.equal(called, true);
            });
        });

    });

    describe('onSuccess', () => {
        it('emits when job finishes successfully', async () => {
            let called = false;
            const robot = mock.createRobot();
            const job = await robot.createJob({ input: { value: '123' } });
            job.onSuccess(async () => {
                called = true;
            });
            mock.success();
            await job.waitForCompletion();
            assert.equal(called, true);
        });
    });

    describe('onFail', () => {
        it('emits when job fails', async () => {
            let error: any = null;
            const robot = mock.createRobot();
            const job = await robot.createJob();
            job.onFail(async err => {
                error = err;
            });
            mock.fail({ category: 'server', code: 'Boo', message: 'Boo me said' });
            await job.waitForCompletion().catch(() => { });
            assert.equal(error?.name, 'Boo');
        });
    });

});
