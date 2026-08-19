# Quick start

chiplog turns one operation into one log record. You mark the steps; it accumulates them, times
them, and flushes a single wide event when the operation settles.

## Install

```bash
npm install chiplog
```

Zero dependencies, ESM and CJS, Node 18+.

## Create an instance

`sink` is the only required option. chiplog ships no transport of its own — it builds a plain object
and hands it to the logger you already run.

```ts
import { createChiplog } from "chiplog";
import { logger } from "./logger";

export const chiplog = createChiplog({
  sink: (event) => logger[event.level](event, event.message),
});
```

`event.level` is `"info"` or `"error"`, derived from the outcome, so most loggers route correctly
with no mapping.

## Record a flow

```ts
await chiplog.run("checkout.submit", async (flow) => {
  flow.stage("received");

  const cart = await loadCart(userId);
  flow.stage("cart_loaded", { items: cart.items.length });

  await reserveInventory(cart);
  flow.stage("inventory_reserved");

  await charge(cart.total);
  flow.stage("charged");
});
```

One event reaches your sink when that function settles:

```json
{
  "message": "flow checkout.submit ok",
  "level": "info",
  "flow": "checkout.submit",
  "outcome": "ok",
  "correlationId": "3c148c65f9d8e74a3dcac0a993b605e5",
  "durationMs": 173,
  "stageCount": 4,
  "stages": [
    { "name": "received", "atMs": 1, "durationMs": 1 },
    { "name": "cart_loaded", "atMs": 16, "durationMs": 15, "meta": { "items": 3 } },
    { "name": "inventory_reserved", "atMs": 19, "durationMs": 3 },
    { "name": "charged", "atMs": 173, "durationMs": 154 }
  ]
}
```

`atMs` is time since the flow started; `durationMs` on a stage is time spent in the *previous* one.
Reading down the list tells you where the 173 ms went without any extra instrumentation.

> [!TIP]
> Name flows after the operation, not the transport: `checkout.submit`, `jobs.reindex`,
> `bullhorn.sync`. The framework adapters use `http.<METHOD> <route>` because for an HTTP entry point
> the route *is* the operation.

## Where to put flows

Not everywhere. A flow is worth it where an operation has several steps that can each fail, and where
"what happened to that one request" is a question you actually ask.

Good candidates: HTTP entry points, queue consumers, scheduled jobs, anything that calls a third
party, anything an LLM touches.

Poor candidates: pure functions, hot loops, getters. `stage()` is cheap, but an event per array
element is noise.

## Next

Stages can be recorded from anywhere in the call stack with nothing threaded through —
that is [the next page](/docs/stages/).
