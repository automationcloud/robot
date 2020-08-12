import assert from 'assert';
import { LocalRobot } from '../../main';

describe('Basics', () => {

    describe('waitForCompletion', () => {
        it('resolves on success', async () => {
            const script = getScript([
                { type: 'Flow.success' }
            ]);
            const robot = new LocalRobot({ script });
            const job = await robot.createJob();
            await job.waitForCompletion();
        });

        it('rejects on fail', async () => {
            const script = getScript([
                {
                    type: 'Flow.fail',
                    errorCode: 'UhOhError'
                }
            ]);
            const robot = new LocalRobot({ script });
            const job = await robot.createJob();
            try {
                await job.waitForCompletion();
                throw new Error();
            } catch (err) {
                assert.equal(err.name, 'UhOhError');
            }
        });
    });

});

function getScript(actions: any[] = []) {
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
