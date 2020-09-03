import { AcMock } from '../ac-mock';
import assert from 'assert';

describe('Basics', () => {

    const mock = new AcMock();

    beforeEach(() => mock.start());
    afterEach(() => mock.stop());

    describe('waitForCompletion', () => {
        it('resolves on success', async () => {
            const robot = mock.createRobot();
            const job = await robot.createJob();
            mock.success();
            await job.waitForCompletion();
        });

        it('rejects on fail', async () => {
            const robot = mock.createRobot();
            const job = await robot.createJob();
            mock.fail({ category: 'server', code: 'UhOhError', message: 'Uh oh'});
            try {
                await job.waitForCompletion();
                throw new Error();
            } catch (err) {
                assert.equal(err.name, 'UhOhError');
            }
        });
    });

});
