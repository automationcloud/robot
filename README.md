# Automation Cloud Robot API

**Status: alpha (public APIs and interfaces are subject to change)**

Robot is a client library for running [Autopilot](https://github.com/automationcloud/autopilot) scripts.

Principally, there are two different ways of running automations:

- [local](#running-locally) — the script is executed in the same process as your app; this approach requires Chromium browser running locally and is overall resource-intensive.

- [cloud](#running-in-cloud) — the script is published to [Automation Cloud](https://automationcloud.net) and is executed remotely by creating a Job; you app then receives notifications about state updates, emitted outputs, requested inputs, etc.

Robot provides a unified [Job](#job) interface for running automations both locally and in the cloud. This approach encapsulates the complexity of setting up the Automation Engine, establishing connectivity to Chrome and wiring the code with different script lifecycle events, and allows switching transparently from local to cloud setup without modifying much of the business logic.

![Choosing Robot API Diagram](https://raw.githubusercontent.com/automationcloud/robot/main/resources/diagram.png)

## Usage

### Running locally

Local execution refers to a technique where the script is loaded (from file, database or other source) and executed on the same machine as your app. Chromium web browser is required to run the jobs locally.

```ts
import { LocalRobot } from '@automationcloud/local-robot';

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

await job.waitForCompletion();
```

Local execution is facilitated by `@automationcloud/local-robot` package.
Under the hood, `robot` instance creates automation jobs which are executed by its embedded [Autopilot Engine](https://github.com/automationcloud/autopilot).

### Chrome Setup

Local setup requires [Chromium](https://www.chromium.org/) executable to be available, so that the Robot can launch it with appropriate CLI flags (the most notable one is `--remote-debugging-port` which allows connecting to Chromium via Chrome DevTools Protocol).

**Note:** It is strongly recommended to avoid using your regular Chrome browser for performing automations. Doing so may cause data loss (Engine automatically cleans up browsing data to avoid polluted state) and may otherwise compromise your browsing data due to using unsafe CLI arguments. Additionally, your automation scripts will assume full control over browser lifecycle, which is simply not convenient.

Use following links to download Chromium snapshots for your operating system:

- [Mac](https://commondatastorage.googleapis.com/chromium-browser-snapshots/index.html?prefix=Mac/768968/)
- [Windows](https://commondatastorage.googleapis.com/chromium-browser-snapshots/index.html?prefix=Win_x64/768966/)
- [Linux](https://commondatastorage.googleapis.com/chromium-browser-snapshots/index.html?prefix=Linux_x64/768968/)

It is also possible to run Robot in a Docker image, all you need to do is to make sure that Node.js and Chromium are available.
We also maintain [our own image](https://github.com/automationcloud/chrome-image) which can be used either directly via `FROM automationcloud/chrome:84` or by adapting the [Dockerfile](https://github.com/automationcloud/chrome-image/blob/master/Dockerfile) to specific needs.

### Running in Cloud

To run your automations in the Automation Cloud, all you have to do is to change `LocalRobot` to `CloudRobot`:

```ts
import { CloudRobot } from '@automationcloud/cloud-robot';

const robot = new CloudRobot({
    serviceId: 'uuid', // Automation Cloud Service id where your script is published
    auth: {            // OAuth2 settings of your application
        clientId: 'your-app-client-id',
        clientSecret: process.env.AC_CLIENT_SECRET,
    }
});

const job = await robot.createJob(/*...*/); // The Job part does not change.
```

## Job

Job is a high level abstraction that allows you to think about your automations in terms of inputs, outputs and state updates.

### Creating the job

```ts
const job = await robot.createJob({
    category: 'test' | 'live', // optional, used to filter test jobs in dashboard
    input: {                   // optional, starts the job with pre-supplied inputs
        foo: { arbitrary: 'data' }
    },
});
```

Job runs immediately after creation.

Note: it is not required to pre-supply all inputs that script expects. Whenever script uses an input that hasn't been provided, it will produce an `awaitingInput` event and will only continue once the requested input is submitted. See [deferred inputs](#deferred-inputs) for more information.

### Waiting for completion

The Robot API tracks job lifecycle events up to the point when the job is either finished successfully or failed with an error. `waitForCompletion` resolves or rejects when the tracking is over.

```ts
await job.waitForCompletion();
// The promise is resolved once the job reaches a `success` state
// (e.g. a `success` context is reached).
// The promise is rejected if the error occurs.
```

**Note**: always make sure to include `await job.waitForCompletion()` to prevent dangling promises or unhandled promise rejections.

### Waiting for outputs

Outputs provide a mechanism to receive the results that script produces. This can be the results of web page scraping, or collected options, or any other information retrieved by the script.

Robot API offers a convenient way of waiting for the outputs you expect from your script:

```ts
// The promise will resolve once all specified outputs are emitted by script
const [products, deliveryOptions] = await job.waitForOutputs('products', 'deliveryOptions');
```

In other scenarios it might be more practical to use event-based API to get notified when a particular output is emitted:

```ts
job.onOutput('myOutputKey', async () => {

});
```

### Deferred inputs

Inputs provide a mechanism of passing the information to the script.

Some inputs are known upfront so it makes sense to specify them when [the job is created](#creating-the-job).

Other inputs cannot be pre-supplied. For example, the website may ask its users to select a delivery option — in such case the script would first collect the available options and emit them as an output and subsequently request the selected option via an input.

```ts
job.onAwaitingInput('selectedDeliveryOption', async () => {
    // Callback is asynchronous, so you can fetch data from database,
    // send http requests or obtain job outputs.
    return { option: 3 };
});
```

A special `*` key can be used to subscribe to all requested inputs with a single handler:

```ts
job.onAwaitingInput('*', requestedInputKey => {
    // ...
});
```

If the handler doesn't return a value, the input is not submitted:

```ts
job.onAwaitingInput('selectedDeliveryOption', () => {
    // No return, so input submission does not occur
});
```

Inputs can also be submitted individually at any point in time whilst the job is still running:

```ts
await job.submitInput('selectedDeliveryOption', { option: 3 });
```

### Events

You can also subscribe to various job lifecycle events.

```ts
job.onSuccess(async () => { ... });
job.onFail(async err => { ...});
job.onOutput(outputKey, async outputData => { ... });
job.onAnyOutput(async (outputKey, outputData) => { ... });
job.onStateChanged(async newState => { ... });
```

To unsubscribe for event:

```ts
const unsubscribe = job.onSuccess(() => { ... });
// ...
unsubscribe();
```

Note 1: All callbacks are asynchronous. Exception thrown inside a callback will result in an unhandled rejection.

Note 2: It is advisable to not depend on the order of the events, because they can vary between different engine versions, between scripts and even within one script (i.e. depending on some script logic).

Note 3: As with all event-based APIs it is possible to miss the event if the subscription is done after the event has already emitted.

## License

See [LICENSE](LICENSE.md).
