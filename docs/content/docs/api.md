# API reference

## createChiplog(options)

```ts
import { createChiplog } from "chiplog";

const chiplog = createChiplog({ sink: (event) => logger[event.level](event, event.message) });
```

| Option | Type | Default | |
|---|---|---|---|
| `sink` | `(event: FlowEvent) => void` | — | **Required.** Where finished events go |
| `redact` | `(key, value, path) => unknown` | — | Runs over every value entering an event |
| `onSinkError` | `(error, event) => void` | — | Called if `sink` throws; never rethrown |
| `includeStack` | `boolean \| (error) => boolean` | `true` | Whether to attach `error.stack` |
| `maxStages` | `number` | `200` | Total stages kept |
| `keepFirstStages` / `keepLastStages` | `number` | half of `maxStages` | Retention split |
| `maxStringLength` | `number` | `2048` | String truncation |
| `maxKeys` / `maxArrayLength` | `number` | `64` | Width caps |
| `maxDepth` | `number` | `6` | Nesting cap |
| `now` / `wallClock` / `randomHex` | functions | real | Overrides, mainly for tests |

## Instance methods

### run(label, fn, seed?)

Runs `fn` inside a new flow and emits one event when it settles. An exception is attributed to the
stage that was running and rethrown unchanged. Returns whatever `fn` returns.

```ts
const order = await chiplog.run("orders.create", async (flow) => {
  flow.stage("validated");
  return create();
});
```

### runSync(label, fn, seed?)

Synchronous variant, for flows with no awaits.

### wrap(label, fn)

Wraps a function so every call becomes a flow.

```ts
const charge = chiplog.wrap("billing.charge", async (amount: number) => { … });
```

### begin(label, seed?)

Starts an `ActiveFlow` the caller must finish with `end()`. For frameworks whose lifecycle is a set
of hooks rather than a wrapping middleware. Always starts a root flow — it never adopts an ambient
parent. Prefer `run()`.

### seedFromHeaders(get)

Builds a `FlowSeed` from inbound headers: `traceparent`, then `x-correlation-id`, then
`x-request-id`.

## Ambient helpers

Operate on the flow in scope. All are silent no-ops outside one.

```ts
import { stage, set, currentFlow, correlationId, traceparent } from "chiplog";

stage("db_query", { table: "orders" });
set({ orgId });
correlationId();   // string | undefined
traceparent();     // string | undefined
currentFlow();     // Flow | undefined
```

## The Flow handle

| | |
|---|---|
| `stage(name, meta?)` | Record a step |
| `set(fields)` | Promote fields to the top level |
| `fail(error, stage?)` | Mark failed without throwing |
| `rename(label)` | Change the flow label |
| `label()` | Current label |
| `traceparent()` | W3C header value for this flow |
| `correlationId`, `flowId` | Identifiers |

`ActiveFlow` (returned by `begin()`) adds `enter()` and `end()`.

## FlowEvent

```ts
{
  message: string;            // "flow checkout.submit failed at charged"
  level: "info" | "error";
  flow: string;
  outcome: "ok" | "failed";
  correlationId: string;
  flowId: string;
  parentFlowId?: string;
  traceparent: string;
  startedAt: string;          // ISO
  durationMs: number;
  stageCount: number;         // including stages the cap dropped
  stages: { name: string; atMs: number; durationMs: number; meta?: object }[];
  droppedStages?: number;
  failedStage?: string;
  error?: { name: string; message: string; stack?: string; cause?: string };
  shadowedFields?: string[];
  [field: string]: unknown;   // everything passed to set()
}
```

## Helpers

```ts
import { redactKeys, parseTraceparent, formatTraceparent } from "chiplog";

redactKeys(["email", "token"], "[redacted]");
parseTraceparent(header);            // { traceId, spanId } | null
formatTraceparent(traceId, spanId);  // "00-…-…-01"
```

`parseTraceparent` returns `null` for malformed or all-zero values.

## Entry points

| Import | |
|---|---|
| `chiplog` | Core. Zero dependencies |
| `chiplog/hono` | Hono middleware. `hono` is an optional peer |
| `chiplog/elysia` | Elysia plugin. `elysia` is an optional peer |

## Runtime support

`AsyncLocalStorage` is required — Node 18+, Bun and Deno support it; Cloudflare Workers need a
compatibility flag. It is the only runtime-specific import and is isolated in one module.
