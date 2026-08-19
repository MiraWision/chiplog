# Failures

## Why run() is a wrapper

The obvious API for this pattern is a pair: start a context, add stages, flush it in a `finally`.
That API has one defect, and it is fatal.

```ts
// the shape chiplog deliberately does not have
const ctx = createFlow("checkout.submit");
try {
  ctx.addStage("charged");
  await charge();
} catch (err) {
  ctx.setFailed("charged", err);   // ← forget this once
  throw err;
} finally {
  ctx.flush();
}
```

`finally` runs when an exception is in flight, but it cannot see the exception. So a forgotten
`setFailed` in one `catch` produces a record that says `ok` about a request that returned a 500. You
do not find out from the bug. You find out from the log that lied about it.

`run()` closes that off structurally:

```ts
await chiplog.run("checkout.submit", async (flow) => {
  flow.stage("charged");
  throw new Error("card declined");
});
```

```json
{
  "message": "flow checkout.submit failed at charged",
  "level": "error",
  "outcome": "failed",
  "failedStage": "charged",
  "error": { "name": "Error", "message": "card declined", "stack": "…" }
}
```

The exception is caught, attributed to the stage that was running, and **rethrown unchanged**.
chiplog never swallows an error and never alters one. There is no way to forget, because there is
nothing to remember.

## Attribution

`failedStage` is the most recent stage recorded when the throw happened. That is why stages are
worth marking even when nothing consumes them individually: they are what turns "this flow failed"
into "this flow failed at the payment gateway call".

If no stage was recorded, `failedStage` is absent and the message is just
`flow <label> failed`.

Attribution survives the [stage cap](/docs/safety/) — the last stage name is tracked separately from
the retained list, so a flow that dropped 40 000 middle stages still names the one it died on.

## Non-Error throws

Anything can be thrown in JavaScript. A non-`Error` is recorded without pretending otherwise:

```json
{ "error": { "name": "NonError", "message": "plain string" } }
```

`error.cause` is included when present. `error.stack` is included by default; turn it off globally or
decide per error:

```ts
createChiplog({ sink, includeStack: (error) => !(error instanceof ExpectedError) });
```

## Failing without throwing

Some frameworks catch a handler's exception themselves and turn it into a response. The operation
failed, but nothing propagates out for `run()` to see. Tell chiplog:

```ts
flow.fail(error);
```

Both bundled adapters do exactly this — see [Adapters](/docs/adapters/).

## What counts as a failure

`fail()` is for a *failure of your service*. A 404, a rejected password, a validation error — those
are answers, and recording them as failed flows drowns the signal that the failed path exists for.
They are already visible as `status` on the event.

The Elysia adapter takes that position by default: routing and validation outcomes are `ok` with
their status attached. It is one option away if you disagree.

> [!WARNING]
> A throwing sink is caught and never rethrown. Flushing happens in a `finally`, so letting a
> logging failure escape would replace the error your caller is already handling. Pass `onSinkError`
> if you want to know about it.
