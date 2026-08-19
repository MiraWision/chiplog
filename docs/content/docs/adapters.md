# Framework adapters

An adapter wraps every request in a flow, seeds it from inbound headers, labels it by matched route,
and attaches the response status. From then on your handlers just call `stage()`.

## Hono

```ts
import { honoChiplog } from "chiplog/hono";

app.use("*", honoChiplog(chiplog));
```

```ts
app.get("/users/:id", async (c) => {
  stage("loaded", { id: c.req.param("id") });
  return c.json(await load(c.req.param("id")));
});
```

The flow is labelled `http.GET /users/:id` — the route pattern, not the concrete URL, so requests
group instead of producing one label per id. Fields: `method`, `path`, `route`, `status`.

Hono catches a handler's exception and converts it into a response, so nothing propagates out; the
adapter reads `c.error` and fails the flow with it.

### Options

```ts
honoChiplog(chiplog, {
  label: (c) => `http.${c.req.method} ${c.req.routePath}`,
  fields: (c) => ({ orgId: c.get("orgId") }),
  failed: (c) => c.error,
  responseHeader: "x-correlation-id",   // null to send nothing
});
```

## Elysia

```ts
import { elysiaChiplog } from "chiplog/elysia";

new Elysia().use(elysiaChiplog(chiplog)).get("/users/:id", handler);
```

Same event and fields, plus `errorCode` from Elysia's error classification.

A 404 or a failed body validation is recorded as a normal outcome carrying its status, **not** as a
failed flow — those are answers, not incidents. Override if you disagree:

```ts
elysiaChiplog(chiplog, {
  failed: ({ code, error }) => (code === "VALIDATION" ? error : undefined),
});
```

Unmatched requests are labelled `http.GET (unmatched)` rather than by path, so a scanner probing
random URLs cannot mint unbounded labels.

> [!NOTE]
> Elysia's lifecycle is a set of hooks rather than a middleware wrapping `next()`, so there is
> nothing to run the request inside. The adapter binds the flow to the request's async context in
> `onRequest` and flushes in `onAfterResponse`, which fires on every path. The manual pairing lives
> in the adapter; your code still only calls `stage()`.

## Writing your own

The core is framework-agnostic. If your framework has a wrapping middleware, use `run()`:

```ts
async function chiplogMiddleware(req, res, next) {
  const seed = chiplog.seedFromHeaders((name) => req.headers[name]);
  await chiplog.run(`http.${req.method}`, async (flow) => {
    res.setHeader("x-correlation-id", flow.correlationId);
    await new Promise((resolve) => {
      res.on("finish", resolve);
      next();
    });
    flow.set({ status: res.statusCode, route: req.route?.path });
    flow.rename(`http.${req.method} ${req.route?.path ?? "(unmatched)"}`);
  }, seed);
}
```

If it does not — hooks only, no `next()` to await around — use `begin()` and own the pairing:

```ts
onRequest((ctx) => {
  const flow = chiplog.begin(`http.${ctx.method}`, seed);
  flow.enter();          // binds to the current async context
  inFlight.set(ctx.request, flow);
});

onResponse((ctx) => {
  const flow = inFlight.get(ctx.request);
  flow?.set({ status: ctx.status });
  flow?.end();
});
```

Key the in-flight map on the `Request` object rather than an application-wide store, so an entry
cannot outlive the request it belongs to. And make sure the hook you flush from fires on *every*
path — success, thrown handler and unmatched route alike. If it does not, flows start and never
finish: no events at all, plus an entry retained per request.
