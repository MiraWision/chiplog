# chiplog

> One wide log event per operation, instead of scattered lines you have to reassemble.

[![npm version](https://img.shields.io/npm/v/chiplog.svg?color=4f46e5)](https://www.npmjs.com/package/chiplog)
[![license](https://img.shields.io/npm/l/chiplog.svg?color=4f46e5)](LICENSE)
[![bundle size](https://img.shields.io/bundlejs/size/chiplog?color=4f46e5)](https://bundlejs.com/?q=chiplog)
[![downloads](https://img.shields.io/npm/dm/chiplog?color=4f46e5)](https://www.npmjs.com/package/chiplog)

A **chip log** was a wooden board on a knotted rope, thrown off the stern to record a ship's progress.
The readings went into the *log book* — which is where the word in your terminal comes from. The
original log recorded one whole voyage, not disconnected moments. This one does the same for one
operation.

Zero dependencies. Bring your own logger.

### Contents

**Start** · [The problem](#the-problem) · [Install](#install) · [Quick start](#quick-start) · [No plumbing](#no-plumbing)

**The event** · [What lands in it](#what-lands-in-the-event) · [Failure attribution](#failure-attribution) · [Fields](#fields)

**Across boundaries** · [Correlation and traceparent](#correlation-and-traceparent) · [Nested flows](#nested-flows) · [Queues and jobs](#queues-and-jobs)

**Safety** · [Redaction](#redaction) · [Limits](#limits)

**Integration** · [Hono](#hono) · [Elysia](#elysia) · [Any framework](#any-framework) · [Sinks](#sinks)

**Reference** · [API](#api) · [Notes and limits](#notes-and-limits)

## The problem

Your logs are already structured. That is not the problem.

**Before** — two checkouts in flight, logged properly, one line per moment:

```jsonc
{"level":30,"time":"...","reqId":"a1","msg":"checkout received"}
{"level":30,"time":"...","reqId":"b2","msg":"checkout received"}
{"level":30,"time":"...","userId":"usr_221","items":3,"msg":"cart loaded"}
{"level":30,"time":"...","reqId":"b2","msg":"cart loaded"}
{"level":30,"time":"...","reqId":"a1","warehouse":"iad","msg":"inventory reserved"}
{"level":30,"time":"...","reqId":"b2","msg":"inventory reserved"}
{"level":30,"time":"...","provider":"stripe","amount":4200,"msg":"gateway request"}
{"level":50,"time":"...","err":"card_declined","msg":"charge failed"}
{"level":30,"time":"...","reqId":"b2","msg":"checkout completed"}
```

Every line is fine on its own. Together they are a puzzle: two operations interleaved, the
correlation id missing from the lines that came from deeper in the stack, no way to see how long
anything took, and the failure sitting eight lines away from the request that caused it. You cannot
grep your way to "what happened to that one checkout" — the answer is spread across the file, and
half of it is not tagged.

**After** — the same checkout, one record, real output from [`examples/checkout.ts`](examples/checkout.ts):

```json
{
  "message": "flow checkout.submit failed at gateway_request",
  "level": "error",
  "flow": "checkout.submit",
  "outcome": "failed",
  "correlationId": "3c148c65f9d8e74a3dcac0a993b605e5",
  "flowId": "560112cbcfb925df",
  "traceparent": "00-3c148c65f9d8e74a3dcac0a993b605e5-560112cbcfb925df-01",
  "startedAt": "2026-08-18T18:30:37.426Z",
  "durationMs": 173,
  "stageCount": 4,
  "stages": [
    { "name": "received", "atMs": 1, "durationMs": 1 },
    { "name": "cart_loaded", "atMs": 1, "durationMs": 0,
      "meta": { "userId": "usr_221", "items": 3, "email": "[redacted]" } },
    { "name": "inventory_reserved", "atMs": 19, "durationMs": 18,
      "meta": { "warehouse": "iad" } },
    { "name": "gateway_request", "atMs": 51, "durationMs": 32,
      "meta": { "provider": "stripe", "amount": 4200 } }
  ],
  "failedStage": "gateway_request",
  "error": { "name": "Error", "message": "card_declined: insufficient funds", "stack": "…" },
  "orgId": "org_7f3a",
  "userId": "usr_221"
}
```

One object. The whole attempt, in order, with timings, with the failing step named, with the
business identifiers attached. A person reads it top to bottom. A query filters on
`outcome:failed AND failedStage:gateway_request`. An agent gets enough to reproduce.

This is the **canonical log line** pattern (Stripe) — also called **wide events**. chiplog is the
part that was missing in Node: getting the stages recorded without threading a context object
through every function signature.

## Install

```bash
npm install chiplog
```

## Quick start

```ts
import { createChiplog } from "chiplog";

export const chiplog = createChiplog({
  sink: (event) => logger.info(event.message, event),
});

await chiplog.run("checkout.submit", async (flow) => {
  flow.stage("received");
  const cart = await loadCart();
  flow.stage("cart_loaded", { items: cart.items.length });
  await charge(cart.total);
  flow.stage("charged");
});
```

`sink` is the only required option, and chiplog ships no transport of its own — it builds a plain
object and hands it to the logger you already run. That is what makes adoption three lines instead
of a migration.

## No plumbing

The reason this pattern gets abandoned is not the idea, it is passing the context down. `stage()`
reads the flow in scope through `AsyncLocalStorage`, so it works at any depth with nothing passed in:

```ts
import { stage, set } from "chiplog";

// four files away from the route handler, no parameters added
async function chargeCard(amount: number) {
  stage("gateway_request", { provider: "stripe", amount });
  const result = await stripe.charges.create({ amount });
  set({ chargeId: result.id });      // promoted to the top level of the event
  return result;
}
```

Outside a flow both are silent no-ops. Logging must never be the thing that throws.

## What lands in the event

| Field | |
|---|---|
| `message` | `flow <label> ok` / `flow <label> failed at <stage>` |
| `level` | `info` or `error`, derived from the outcome |
| `flow`, `outcome` | label and `ok` / `failed` |
| `correlationId` | shared by every flow in the same logical operation |
| `flowId`, `parentFlowId` | this flow, and the one it ran inside |
| `traceparent` | W3C Trace Context for this flow |
| `startedAt`, `durationMs` | wall-clock start, monotonic duration |
| `stages` | `{ name, atMs, durationMs, meta? }` in order |
| `stageCount`, `droppedStages` | recorded total, and how many the cap discarded |
| `failedStage`, `error` | the step that was running, and `{ name, message, stack?, cause? }` |
| `shadowedFields` | `set()` keys that collided with a reserved name |
| *anything else* | whatever you passed to `set()`, flat |

## Failure attribution

`run()` is a wrapper rather than a `start()` / `end()` pair for one reason: **a flow that threw can
never report success.** The exception is caught, attributed to the stage that was running, and
rethrown unchanged.

```ts
await chiplog.run("checkout.submit", async (flow) => {
  flow.stage("charged");
  throw new Error("card declined");
});
// → outcome: "failed", failedStage: "charged", and the error still propagates
```

With a manual `flush()` in a `finally`, forgetting one `markFailed()` in one `catch` produces a log
that says `ok` about a request that 500'd — and you find out much later, from the log that lied.

If your framework catches the exception itself and turns it into a response, tell chiplog with
`flow.fail(error)`. The [Hono adapter](#hono) does exactly that.

## Fields

`set()` merges flat onto the event, because the point of a wide event is that every field is
directly queryable — `orgId:org_7f3a`, not `fields.orgId`. Reserved names are protected, and a
collision is reported in `shadowedFields` rather than silently winning or silently losing.

## Correlation and traceparent

chiplog does not invent a carrier format. What crosses a boundary is a standard **W3C
`traceparent`**, so it interoperates with OpenTelemetry and with proxies that already forward it.

```ts
const seed = chiplog.seedFromHeaders((name) => req.headers[name]);
await chiplog.run("http.POST /orders", handler, seed);
```

A valid inbound `traceparent` continues that trace; otherwise `x-correlation-id` or `x-request-id`
is adopted as the correlation id; otherwise a fresh one is generated.

## Nested flows

A `run()` inside a `run()` emits its own event, sharing the parent's `correlationId` and pointing at
it through `parentFlowId`. Sub-operations stay individually queryable while remaining joinable.

## Queues and jobs

Put the `traceparent` on the message, recover it on the other side:

```ts
await queue.publish({ ...payload, traceparent: traceparent() });

// worker
await chiplog.run("jobs.process", handler, { traceparent: message.traceparent });
```

Producer and consumer emit separate events joined by `correlationId`.

## Redaction

```ts
createChiplog({
  sink,
  redact: redactKeys(["email", "password", "cardNumber", "authorization"]),
});
```

`redactKeys` covers the common case. For anything conditional, pass your own function — return the
value to keep it, a replacement to mask it, or `undefined` to drop the key:

```ts
redact: (key, value, path) =>
  key === "resumeText" ? `[${String(value).length} chars]` : value;
```

It runs over everything on its way into the event, at every depth, for `stage()` meta and `set()`
fields alike.

## Limits

A wide event trades "lose one line" for "lose the whole operation" if it grows past what your log
backend accepts. So everything is bounded, with defaults:

| | |
|---|---|
| `maxStages` (200) | keeps the first and last halves, counts the rest in `droppedStages` |
| `maxStringLength` (2048) | truncates with a `…(+N)` marker |
| `maxKeys` (64), `maxArrayLength` (64) | width caps, with a marker for the remainder |
| `maxDepth` (6) | replaces deeper values with `"[depth limit]"` |

Cycles become `"[circular]"`, buffers become `"[Uint8Array(1024 bytes)]"`, functions and symbols are
dropped. The stage cap applies while accumulating, so a retry storm keeps memory flat.

## Hono

```ts
import { honoChiplog } from "chiplog/hono";

app.use("*", honoChiplog(chiplog));
```

Wraps every request in a flow, seeds it from inbound headers, labels it by matched route pattern
(`http.GET /users/:id`, not one label per id), attaches `method`, `path`, `route` and `status`,
returns the correlation id in `x-correlation-id`, and marks the flow failed when Hono caught a
handler exception.

## Elysia

```ts
import { elysiaChiplog } from "chiplog/elysia";

new Elysia().use(elysiaChiplog(chiplog)).get("/users/:id", handler);
```

Same event, same fields, plus `errorCode` from Elysia's error classification. A 404 or a failed
body validation is recorded as a normal outcome with its status, not as a failed flow — those are
answers, not incidents. Override with `failed`:

```ts
elysiaChiplog(chiplog, { failed: ({ code, error }) => (code === "VALIDATION" ? error : undefined) });
```

Elysia's lifecycle is a set of hooks rather than a middleware wrapping `next()`, so there is nothing
to run the request inside. The adapter binds the flow to the request's async context in `onRequest`
and flushes in `onAfterResponse`, which fires on every path — success, thrown handler and 404 alike.
The manual pairing lives in the adapter; your code still only calls `stage()`.

## Any framework

The core is framework-agnostic; an adapter is a few lines:

```ts
async function middleware(req, res, next) {
  const seed = chiplog.seedFromHeaders((name) => req.headers[name]);
  await chiplog.run(`http.${req.method}`, async (flow) => {
    res.setHeader("x-correlation-id", flow.correlationId);
    await new Promise((resolve) => { res.on("finish", resolve); next(); });
    flow.set({ status: res.statusCode });
  }, seed);
}
```

## Sinks

```ts
// pino
createChiplog({ sink: (e) => pino[e.level](e, e.message) });

// console, development
createChiplog({ sink: (e) => console.log(JSON.stringify(e, null, 2)) });

// route failures somewhere louder
createChiplog({
  sink: (e) => {
    logger[e.level](e, e.message);
    if (e.outcome === "failed") alerting.send(e);
  },
});
```

## API

```ts
createChiplog(options): Chiplog
  .run(label, fn, seed?)      // async; one event per call
  .runSync(label, fn, seed?)  // synchronous variant
  .wrap(label, fn)            // every call becomes a flow
  .seedFromHeaders(get)       // traceparent / x-correlation-id / x-request-id
  .begin(label, seed?)        // manual pairing for hook-based frameworks; you own end()

// ambient — operate on the flow in scope, no-ops outside one
stage(name, meta?)
set(fields)
currentFlow(), correlationId(), traceparent()

// helpers
redactKeys(keys, replacement?)
parseTraceparent(value), formatTraceparent(traceId, spanId, sampled?)
```

The `Flow` handle passed to `fn`: `stage()`, `set()`, `fail()`, `rename()`, `label()`,
`traceparent()`, `correlationId`, `flowId`. `begin()` returns an `ActiveFlow` — the same handle plus
`enter()` and `end()`.

## Notes and limits

- **Runtime.** `AsyncLocalStorage` is required: Node 18+, Bun and Deno support it; Cloudflare Workers
  need a compatibility flag. The `chiplog/elysia` adapter needs Node 20+, because Elysia itself
  reaches for the global `crypto` that Node 18 does not define.
- **Not a logger.** No levels, transports, formatting or file rotation. It produces one object and
  gives it to yours.
- **Not a replacement for tracing.** Distributed tracing answers "where did time go across twenty
  services". This answers "what happened inside this one operation" and costs one log line. They
  compose — `traceparent` is shared.
- **Parallel stages.** Stages from concurrent branches inside a single flow are recorded in
  completion order. That is faithful, but it means the sequence is not a causal chain; use nested
  flows when the branches matter separately.
- **Hook-based frameworks.** Where a request cannot be wrapped, `begin()` + `enter()` uses
  `AsyncLocalStorage.enterWith`, which mutates the current execution context rather than creating
  one. The store can therefore outlive the request in the caller's context. That is inert, not
  wrong: a flushed flow ignores everything, so a stray ambient call cannot append to a shipped event.
  `begin()` never adopts an ambient parent for the same reason.
- **Sampling** is not built in. Sample in your sink if volume needs it — everything required to
  decide is on the event.

## License

MIT © Yelysei Lukin
