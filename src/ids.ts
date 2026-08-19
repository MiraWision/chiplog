/**
 * W3C Trace Context ids. chiplog does not invent a carrier format: the string
 * you move across a queue or an HTTP hop is a standard `traceparent`, so it
 * interoperates with OpenTelemetry and every proxy that already understands it.
 *
 * Uses the Web Crypto API.
 */
import { webcrypto } from "node:crypto";

const HEX = "0123456789abcdef";

/**
 * `globalThis.crypto` only became available unflagged in Node 19, and this
 * package supports 18 — so the global is preferred and `node:crypto` fills in
 * where it is missing. Resolved per call, not at module load, so a runtime that
 * installs the global later is still the one that gets used.
 */
function entropy(): Pick<Crypto, "getRandomValues"> {
  return globalThis.crypto ?? (webcrypto as unknown as Crypto);
}

/** Random lowercase hex string of `bytes` bytes (so `bytes * 2` characters). */
export function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  entropy().getRandomValues(buf);
  let out = "";
  for (const byte of buf) {
    out += HEX[byte >> 4]! + HEX[byte & 0x0f]!;
  }
  return out;
}

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const ZERO_TRACE = "0".repeat(32);
const ZERO_SPAN = "0".repeat(16);

export interface TraceIds {
  traceId: string;
  spanId: string;
}

/** Formats version-00 `traceparent`. `sampled` sets the single defined flag. */
export function formatTraceparent(
  traceId: string,
  spanId: string,
  sampled = true,
): string {
  return `00-${traceId}-${spanId}-${sampled ? "01" : "00"}`;
}

/**
 * Parses a `traceparent`. Returns null for anything malformed or all-zero, so a
 * broken upstream header starts a fresh trace instead of poisoning the field.
 */
export function parseTraceparent(value: string | null | undefined): TraceIds | null {
  if (!value) return null;
  const match = TRACEPARENT.exec(value.trim());
  if (!match) return null;
  const traceId = match[1]!;
  const spanId = match[2]!;
  if (traceId === ZERO_TRACE || spanId === ZERO_SPAN) return null;
  return { traceId, spanId };
}
