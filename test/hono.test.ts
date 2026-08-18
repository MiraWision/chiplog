import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { honoChiplog } from "../src/hono";
import { stage } from "../src/index";
import { harness } from "./helpers";

describe("hono adapter", () => {
  it("wraps a request, labels it by route pattern and returns the correlation id", async () => {
    const { chiplog, events } = harness();
    const app = new Hono();
    app.use("*", honoChiplog(chiplog));
    app.get("/users/:id", (c) => {
      stage("loaded", { id: c.req.param("id") });
      return c.json({ ok: true });
    });

    const response = await app.request("/users/42");

    expect(response.status).toBe(200);
    expect(response.headers.get("x-correlation-id")).toBe(events[0]!.correlationId);

    const event = events[0]!;
    expect(event.flow).toBe("http.GET /users/:id");
    expect(event.outcome).toBe("ok");
    expect(event).toMatchObject({ method: "GET", path: "/users/42", route: "/users/:id", status: 200 });
    expect(event.stages[0]).toMatchObject({ name: "loaded", meta: { id: "42" } });
  });

  it("continues an inbound traceparent", async () => {
    const { chiplog, events } = harness();
    const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    const app = new Hono();
    app.use("*", honoChiplog(chiplog));
    app.get("/", (c) => c.text("ok"));

    await app.request("/", {
      headers: { traceparent: `00-${traceId}-00f067aa0ba902b7-01` },
    });

    expect(events[0]!.correlationId).toBe(traceId);
  });

  it("records a failed request with the stage it died on", async () => {
    const { chiplog, events } = harness();
    const app = new Hono();
    app.use("*", honoChiplog(chiplog));
    app.get("/boom", () => {
      stage("about_to_fail");
      throw new Error("handler exploded");
    });

    const response = await app.request("/boom");

    expect(response.status).toBe(500);
    const event = events[0]!;
    expect(event.outcome).toBe("failed");
    expect(event.failedStage).toBe("about_to_fail");
    expect(event.error?.message).toBe("handler exploded");
  });

  it("can be told not to send a response header", async () => {
    const { chiplog } = harness();
    const app = new Hono();
    app.use("*", honoChiplog(chiplog, { responseHeader: null }));
    app.get("/", (c) => c.text("ok"));
    const response = await app.request("/");
    expect(response.headers.get("x-correlation-id")).toBeNull();
  });
});
