# Stages and fields

## Stages from anywhere

The reason this pattern gets abandoned is not the idea, it is passing the context down. Threading a
`flowContext` parameter through every service, repository and helper is real work, it shows up in
every code review, and the first person in a hurry stops doing it.

chiplog uses `AsyncLocalStorage`, so the ambient `stage()` finds the flow in scope on its own:

```ts
import { stage, set } from "chiplog";

// four files below the route handler — no signatures changed anywhere
export async function chargeCard(amount: number) {
  stage("gateway_request", { provider: "stripe", amount });
  const result = await stripe.charges.create({ amount });
  set({ chargeId: result.id });
  return result;
}
```

It survives `await`, `Promise.all`, and any depth of call stack. Concurrent flows stay completely
separate — two requests in flight never see each other's stages.

Outside any flow, `stage()` and `set()` are silent no-ops. Logging must never be the thing that
throws, and a helper called from both a flow and a script should not need to know which.

> [!NOTE]
> The `Flow` handle passed to `run()` has the same methods. Use `flow.stage()` where you have the
> handle and the ambient `stage()` where you do not; they are the same flow.

## Naming stages

Stage names end up as values in a query, so keep them a closed set. `snake_case`, past tense, one
per meaningful step:

```ts
stage("payload_validated");
stage("inventory_reserved");
stage("gateway_request");
```

Avoid interpolating anything variable into a name — `stage(\`user_\${id}_loaded\`)` produces a
cardinality explosion in whatever you query with. Variable parts belong in `meta`:

```ts
stage("user_loaded", { userId: id });
```

## Stage detail

The second argument is free-form and sanitised on the way in — bounded in depth, width and string
length, with your redactor applied. See [Redaction and limits](/docs/safety/).

```ts
stage("db_query", { table: "orders", rows: result.length, ms: elapsed });
```

## Fields

`set()` promotes values to the top level of the event:

```ts
set({ orgId, userId, positionId });
```

They land flat — `orgId`, not `fields.orgId` — because the point of a wide event is that every field
is directly queryable. Call it whenever a value becomes known; the last write wins.

Reserved names (`flow`, `outcome`, `durationMs`, `stages`, …) are protected. A collision does not
silently win and does not silently vanish: the key is skipped and reported.

```ts
flow.set({ outcome: "hijacked", orgId: "org_7" });
// → outcome stays "ok", orgId is set, shadowedFields: ["outcome"]
```

## Renaming a flow

Sometimes the operation is only identifiable part way through — a matched route, a parsed command, a
resolved job type:

```ts
await chiplog.run("jobs.process", async (flow) => {
  const job = await claim();
  flow.rename(`jobs.${job.type}`);
});
```

The framework adapters use this: the label is settled after the response, when the matched route is
known.
