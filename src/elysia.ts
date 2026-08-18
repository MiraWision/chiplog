import { Elysia } from "elysia";

import type { Chiplog } from "./chiplog";
import type { ActiveFlow, Meta } from "./types";

/** Minimal shape of the pieces of Elysia's context this adapter reads. */
interface RequestCtx {
  request: Request;
}
interface ErrorCtx extends RequestCtx {
  code: string;
  error: unknown;
}
interface ResponseCtx extends RequestCtx {
  route?: string | undefined;
  path?: string | undefined;
  set: { status?: number | string | undefined; headers: Record<string, string> };
}

/**
 * Outcomes Elysia reports through `onError` that are not failures of this
 * service: a route that does not exist, a body that did not validate, a cookie
 * that did not verify. They are already visible as the response status, and
 * counting them as failed flows drowns the signal that matters.
 */
const CLIENT_OUTCOMES = new Set([
  "NOT_FOUND",
  "VALIDATION",
  "PARSE",
  "INVALID_COOKIE_SIGNATURE",
]);

export interface ElysiaChiplogOptions {
  /**
   * Flow label, evaluated after the response so the matched route is known.
   * Defaults to `http.<METHOD> <route>` — the route pattern rather than the
   * concrete URL, so `/users/:id` groups instead of exploding into one label
   * per id. Unmatched requests get `http.<METHOD> (unmatched)` rather than the
   * path, so a scanner probing random URLs cannot mint unbounded labels.
   */
  label?: (ctx: ResponseCtx) => string;
  /** Extra fields to attach once the response is known. */
  fields?: (ctx: ResponseCtx) => Meta;
  /**
   * Decides whether an error reaching `onError` fails the flow. Return the
   * error to fail, `undefined` to let it pass as a normal outcome.
   */
  failed?: (ctx: ErrorCtx) => unknown;
  /**
   * Response header carrying the correlation id back to the caller.
   * Set to `null` to send nothing. Default `x-correlation-id`.
   */
  responseHeader?: string | null;
}

/**
 * Wraps every request in a flow.
 *
 * Elysia's lifecycle is a set of hooks, not a middleware that wraps `next()`,
 * so there is nothing to run the request inside. The flow is instead bound to
 * the request's async context in `onRequest` and flushed in `onAfterResponse`,
 * which fires on every path — success, thrown handler, and 404 alike. The
 * pairing lives here so application code never holds it.
 *
 * Inside any handler — and anywhere further down the call stack — `stage()` and
 * `set()` from `chiplog` attach to this flow with nothing threaded through.
 */
export function elysiaChiplog(
  chiplog: Chiplog,
  options: ElysiaChiplogOptions = {},
): Elysia {
  const {
    label = (ctx: ResponseCtx) =>
      `http.${ctx.request.method} ${ctx.route || "(unmatched)"}`,
    fields,
    failed = ({ code, error }: ErrorCtx) => (CLIENT_OUTCOMES.has(code) ? undefined : error),
    responseHeader = "x-correlation-id",
  } = options;

  // Keyed by the Request object, so an entry cannot outlive the request it
  // belongs to. Elysia has no per-request store to hang this on: `store` is
  // application-wide and shared by every request in flight.
  const inFlight = new WeakMap<Request, ActiveFlow>();

  return new Elysia({ name: "chiplog" })
    .onRequest((ctx) => {
      const { request, set } = ctx as unknown as RequestCtx & {
        set: { headers: Record<string, string> };
      };
      const seed = chiplog.seedFromHeaders((name) => request.headers.get(name));
      const flow = chiplog.begin(`http.${request.method}`, seed);
      flow.enter();
      flow.set({ method: request.method, path: new URL(request.url).pathname });
      if (responseHeader) set.headers[responseHeader] = flow.correlationId;
      inFlight.set(request, flow);
    })
    .onError((ctx) => {
      const typed = ctx as unknown as ErrorCtx;
      const flow = inFlight.get(typed.request);
      if (!flow) return;
      flow.set({ errorCode: typed.code });
      const error = failed(typed);
      if (error !== undefined && error !== null) flow.fail(error);
    })
    .onAfterResponse((ctx) => {
      const typed = ctx as unknown as ResponseCtx;
      const flow = inFlight.get(typed.request);
      if (!flow) return;
      inFlight.delete(typed.request);
      flow.rename(label(typed));
      flow.set({
        ...(typed.route ? { route: typed.route } : {}),
        status: typeof typed.set.status === "number" ? typed.set.status : undefined,
        ...(fields ? fields(typed) : {}),
      });
      flow.end();
    })
    // Hooks declared inside a plugin are local to it by default, and `.use()`
    // would keep them there. `onRequest` runs before routing and fires either
    // way, but `onError` and `onAfterResponse` would not — the flow would start
    // on every request and never flush: no events at all, and an entry held per
    // request. Promoting the plugin to global is what makes the pair complete.
    .as("global");
}
