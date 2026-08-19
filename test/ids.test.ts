import { describe, expect, it } from "vitest";

import { formatTraceparent, parseTraceparent } from "../src/index";
import { randomHex } from "../src/ids";

describe("randomHex", () => {
  it("returns lowercase hex of the requested byte length", () => {
    expect(randomHex(16)).toMatch(/^[0-9a-f]{32}$/);
    expect(randomHex(8)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("works where globalThis.crypto does not exist", () => {
    // Node 18 has no global `crypto`; it was unflagged in 19. Deleting it here
    // is the only way to exercise the node:crypto fallback on a modern runtime,
    // and CI would otherwise only catch this on the oldest matrix entry.
    const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    Reflect.deleteProperty(globalThis, "crypto");
    try {
      expect(globalThis.crypto).toBeUndefined();
      expect(randomHex(16)).toMatch(/^[0-9a-f]{32}$/);
    } finally {
      if (original) Object.defineProperty(globalThis, "crypto", original);
    }
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 200 }, () => randomHex(16)));
    expect(seen.size).toBe(200);
  });
});

describe("traceparent", () => {
  const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
  const spanId = "00f067aa0ba902b7";

  it("round-trips", () => {
    expect(parseTraceparent(formatTraceparent(traceId, spanId))).toEqual({ traceId, spanId });
  });

  it("marks the sampled flag", () => {
    expect(formatTraceparent(traceId, spanId, false)).toBe(`00-${traceId}-${spanId}-00`);
  });

  it.each([
    ["garbage", "garbage"],
    ["wrong version", `01-${traceId}-${spanId}-01`],
    ["all-zero trace id", `00-${"0".repeat(32)}-${spanId}-01`],
    ["all-zero span id", `00-${traceId}-${"0".repeat(16)}-01`],
    ["truncated", `00-${traceId}-01`],
    ["empty", ""],
  ])("rejects %s rather than adopting it", (_label, value) => {
    expect(parseTraceparent(value)).toBeNull();
  });

  it("rejects null and undefined", () => {
    expect(parseTraceparent(null)).toBeNull();
    expect(parseTraceparent(undefined)).toBeNull();
  });
});
