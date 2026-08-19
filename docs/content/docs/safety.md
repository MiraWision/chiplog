# Redaction and limits

A wide event is a good trade with one sharp edge: it swaps "lose one line" for "lose the whole
operation". If a record grows past what your backend accepts, the backend drops it — and the flow
you most wanted to read is exactly the pathological one that got dropped.

So everything entering an event is bounded, and everything is filtered.

## Redaction

```ts
import { createChiplog, redactKeys } from "chiplog";

createChiplog({
  sink,
  redact: redactKeys(["email", "password", "cardNumber", "authorization", "token"]),
});
```

`redactKeys` matches case-insensitively at any depth. For anything conditional, pass your own
function — return the value to keep it, a replacement to mask it, or `undefined` to drop the key
entirely:

```ts
redact: (key, value, path) => {
  if (key === "resumeText") return `[${String(value).length} chars]`;
  if (path[0] === "headers" && key === "cookie") return undefined;
  return value;
};
```

It runs over `stage()` meta and `set()` fields alike, at every depth.

> [!CAUTION]
> Redaction is a hook, not a default. chiplog does not ship a built-in list of "sensitive" key names,
> because a list that looks complete is worse than no list — the shape of sensitive data is specific
> to your domain. Decide once, at instance creation, and it applies everywhere.

## Limits

| Option | Default | Effect |
|---|---|---|
| `maxStages` | 200 | Keeps the first and last halves; the rest are counted in `droppedStages` |
| `keepFirstStages` / `keepLastStages` | half of `maxStages` | Tune the retention split |
| `maxStringLength` | 2048 | Truncates with a `…(+N)` marker |
| `maxKeys` | 64 | Object width, with a `"…": "(+N keys)"` marker |
| `maxArrayLength` | 64 | Array length, with a `"…(+N items)"` entry |
| `maxDepth` | 6 | Deeper values become `"[depth limit]"` |

The stage cap applies **while accumulating**, not at flush: a retry loop calling `stage()` a hundred
thousand times keeps memory flat and still produces a readable record.

```json
{ "stageCount": 50000, "droppedStages": 49800, "stages": [ "…first 100…", "…last 100…" ] }
```

## Hostile values

Sanitising is not only about size. Values that would break or bloat serialisation are reduced to
labels:

| Input | In the event |
|---|---|
| circular reference | `"[circular]"` |
| `Buffer` / typed array | `"[Uint8Array(1024 bytes)]"` |
| `Error` | `{ "name": …, "message": … }` |
| `Date` | ISO string |
| `Map` / `Set` | object / array |
| `BigInt` | `"10n"` |
| `NaN`, `Infinity` | `"NaN"`, `"Infinity"` |
| function, symbol | dropped |

Nothing here throws. A bad value in a log call must never become an incident of its own.

## Sampling

Not built in. Everything needed to decide is on the event, so sample in your sink:

```ts
sink: (event) => {
  if (event.outcome === "failed" || Math.random() < 0.1) logger[event.level](event, event.message);
};
```

Keep every failure. Sample successes only once volume actually forces it — the successes are what
tell you what normal looks like.
