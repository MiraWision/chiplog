# Correlation and traceparent

## One id per operation

Every event carries a `correlationId`, shared by every flow belonging to the same logical operation,
and a `flowId` unique to that flow. Where an operation spans more than one flow — nested calls, a
queue hop — those two fields are what join them back together.

chiplog does not invent a carrier format. What crosses a boundary is a standard **W3C
`traceparent`**, so it interoperates with OpenTelemetry and with every proxy that already forwards
the header.

```
00-3c148c65f9d8e74a3dcac0a993b605e5-560112cbcfb925df-01
   └─ trace id (correlation)        └─ span id (this flow)
```

## Inbound

```ts
const seed = chiplog.seedFromHeaders((name) => req.headers[name]);
await chiplog.run("orders.create", handler, seed);
```

In priority order:

1. a valid `traceparent` — its trace id becomes the correlation id, and the trace continues;
2. `x-correlation-id`, then `x-request-id`;
3. otherwise a fresh id is generated.

A malformed or all-zero `traceparent` is ignored rather than adopted, so a broken upstream starts a
clean trace instead of poisoning the field for everything downstream.

> [!TIP]
> Return the id to the caller. Both adapters set `x-correlation-id` on the response, which means a
> user reporting "it failed at 14:32" can hand you the exact record.

## Outbound

```ts
import { traceparent } from "chiplog";

await fetch(url, { headers: { traceparent: traceparent()! } });
```

## Across a queue

The producer and the consumer are separate flows — the producer's event has already flushed by the
time the job runs. Carry the header on the message and they join by correlation id:

```ts
// producer
await queue.publish({ ...payload, traceparent: traceparent() });

// consumer
await chiplog.run("jobs.process", handler, { traceparent: message.traceparent });
```

Two events, one trace. Querying `correlationId:3c148c…` returns the whole operation, in order,
across processes.

## Nested flows

A `run()` inside a `run()` emits its own event:

```ts
await chiplog.run("import.batch", async () => {
  for (const row of rows) {
    await chiplog.run("import.row", handler);
  }
});
```

Each child shares the parent's `correlationId` and records `parentFlowId`. Sub-operations stay
individually queryable — you can ask which rows failed — while remaining joinable to the batch.

Use nesting when a sub-operation deserves its own timing and outcome. Use stages when it does not.

> [!NOTE]
> `begin()` — the manual primitive used by hook-based adapters — never adopts an ambient parent. It
> binds to the current execution context with `enterWith`, where a previous request can still be
> visible; inheriting would chain every request in a process onto the first one's correlation id.
