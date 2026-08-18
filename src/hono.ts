import type { Context, MiddlewareHandler } from "hono";

import type { Chiplog } from "./chiplog";
import type { Meta } from "./types";

export interface HonoChiplogOptions {
  /**
   * Flow label, evaluated *after* the handler has run so the matched route is
   * known. Defaults to `http.<METHOD> <routePath>` — the route pattern rather
   * than the concrete URL, so `/users/:id` groups instead of exploding into one
   * label per id.
   */
  label?: (c: Context) => string;
  /** Extra fields to attach once the response is known. */
  fields?: (c: Context) => Meta;
  /**
   * Decides whether a finished request counts as a failed flow. Hono catches a
   * handler's exception and turns it into a response, so nothing propagates out
   * to `run()`; the error it caught is on `c.error`. Override to also fail on,
   * say, any 5xx.
   */
  failed?: (c: Context) => unknown;
  /**
   * Response header carrying the correlation id back to the caller.
   * Set to `null` to send nothing. Default `x-correlation-id`.
   */
  responseHeader?: string | null;
}

/**
 * Wraps every request in a flow, seeded from inbound `traceparent` /
 * `x-correlation-id` headers so a trace started upstream continues here.
 *
 * Inside any handler — and anywhere further down the call stack — `stage()` and
 * `set()` from `chiplog` attach to this flow with nothing threaded through.
 */
export function honoChiplog(
  chiplog: Chiplog,
  options: HonoChiplogOptions = {},
): MiddlewareHandler {
  const {
    label = (c: Context) => `http.${c.req.method} ${c.req.routePath}`,
    fields,
    failed = (c: Context) => c.error,
    responseHeader = "x-correlation-id",
  } = options;

  return async (c, next) => {
    const seed = chiplog.seedFromHeaders((name) => c.req.header(name));
    await chiplog.run(
      `http.${c.req.method}`,
      async (flow) => {
        if (responseHeader) c.header(responseHeader, flow.correlationId);
        flow.set({ method: c.req.method, path: c.req.path });
        try {
          await next();
        } finally {
          // Runs even if something escapes Hono's own handling, so the status
          // and route of a failed request land on the event beside the error.
          flow.rename(label(c));
          flow.set({
            route: c.req.routePath,
            status: c.res?.status,
            ...(fields ? fields(c) : {}),
          });
          const error = failed(c);
          if (error !== undefined && error !== null) flow.fail(error);
        }
      },
      seed,
    );
  };
}
