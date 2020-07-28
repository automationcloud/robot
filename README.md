# Automation Cloud Robot API

**Status: alpha (public APIs and interfaces are subject to change)**

Robot is a client library for running [Autopilot](https://github.com/automationcloud/autopilot) scripts.

Robot provides a unified interface [Job](#job) for running automations both locally and in the Cloud. This approach encapsulates the complexity of setting up the Automation Engine, establishing connectivity to Chrome and wiring the code with different script lifecycle events, whilst also making it easy to upgrade the from simple use cases to executing automations on scale in Automation Cloud.

## Usage

### Running locally

Local execution refers to a technique where the script is loaded (from file, database or other source) and executed on the same machine as your app.

```ts
import { LocalRobot } from '@automationcloud/robot-local';

const robot = new LocalRobot({
    script: '/path/to/my/script.json',
    chromePath: '/path/to/chromium/executable',
});

const job = await robot.createJob({
    input: {
        url: 'https://store-to-scrape.com',
        // ...
    }
});

const [products, deliveryOptions] = await job.waitForOutputs('products', 'deliveryOptions');
// ...
```

Local execution is facilitated by `@automationcloud/robot-local` package which should be installed separately.
In this example, `robot` instance creates automation jobs which are executed by its embedded [Autopilot Engine](https://github.com/automationcloud/autopilot). The Job is an interface to your automation, which can be switched transparently to a [cloud setup](#executing-scripts-in-automation-cloud) without amending your business logic.

### Chrome Setup

Local setup requires [Chromium](https://www.chromium.org/) executable to be available, so that the Robot can launch it with appropriate CLI flags (the most notable one is `--remote-debugging-port` which allows connecting to Chromium via Chrome DevTools Protocol).

**Note:** It is strongly recommended to avoid using your regular Chrome browser for performing automations. Doing so may cause data loss (Engine automatically cleans up browsing data to avoid polluted state) and may otherwise compromise your browsing data due to using unsafe CLI arguments. Additionally, your automation scripts will assume full control over browser lifecycle, which is simply not convenient.

Use following links to download Chromium snapshots for your operating system:

- [Mac](https://commondatastorage.googleapis.com/chromium-browser-snapshots/index.html?prefix=Mac/768968/)
- [Windows](https://commondatastorage.googleapis.com/chromium-browser-snapshots/index.html?prefix=Win_x64/768966/)
- [Linux](https://commondatastorage.googleapis.com/chromium-browser-snapshots/index.html?prefix=Linux_x64/768968/)

It is also possible to run Robot in a Docker image, all you need to do is to make sure that Node.js and Chromium are available.
We also maintain [our own image](https://github.com/automationcloud/chrome-image) which can be used either directly via `FROM automationcloud/chrome:84` or by adapting the [Dockerfile](https://github.com/automationcloud/chrome-image/blob/master/Dockerfile) to specific needs.

### Executing scripts in Automation Cloud

To run your automations in the Automation Cloud, all you have to do is to change `LocalRobot` to `CloudRobot`:

```ts
import { CloudRobot } from '@automationcloud/robot-cloud';

const robot = new CloudRobot({
    serviceId: 'uuid', /* Automation Cloud Service id where your script is published */
    auth: {            /* OAuth2 settings of your application */
        clientId: 'your-app-client-id',
        clientSecret: process.env.CLIENT_SECRET,
    }
});

const job = await robot.createJob(/*...*/) // The Job part does not change.
```

## Job

<!-- TODO document this better -->

### Creating the job

```ts
const job = await robot.createJob({
    category: 'test' | 'live', // optional, used to filter test jobs in dashboard
    inputs: {                  // optional, starts the job with pre-supplied inputs
        foo: { arbitrary: 'data' }
    },
});
```

### Waiting for completion

```ts
await job.waitForCompletion();
// The promise will resolve once the job reaches a `success` state
// (e.g. a `success` context is reached).
// The promise is rejected if the error occurs.
```

### Waiting for outputs

```ts
// The promise will resolve once all specified outputs are emitted by script
const [products, deliveryOptions] = await job.waitForOutputs('products', 'deliveryOptions');
```

### Deferred inputs

Inputs can be supplied further in the flow. For example, this can be useful for selecting an option after available options have been delivered via an output.

If the script reaches `Value.getInput` and the input wasn't supplied yet, it generates an "input request" which can be handled by your applicaiton logic:

```ts
job.onAwaitingInput('selectedDeliveryOption', async () => {
    // Callback is asynchronous, so you can fetch data from database,
    // send http requests or obtain job outputs.
    return { option: 3 };
});
```

Inputs can also be submitted individually:

```ts
await job.submitInput('selectedDeliveryOption', { option: 3 });
```
