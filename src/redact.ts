import type { Redactor } from "./types";

export interface SanitizeLimits {
  maxStringLength: number;
  maxKeys: number;
  maxArrayLength: number;
  maxDepth: number;
}

/**
 * Convenience redactor that masks an exact set of key names, compared
 * case-insensitively. Covers the common case; pass your own `Redactor` when the
 * decision depends on the value or on where in the object it sits.
 */
export function redactKeys(
  keys: Iterable<string>,
  replacement: unknown = "[redacted]",
): Redactor {
  const masked = new Set<string>();
  for (const key of keys) masked.add(key.toLowerCase());
  return (key, value) => (masked.has(key.toLowerCase()) ? replacement : value);
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…(+${value.length - max})`;
}

/**
 * Converts an arbitrary value into something safe to serialise: bounded in
 * depth, width and string length, free of cycles, with hostile types (buffers,
 * functions, symbols) reduced to a label rather than dumped.
 *
 * Anything a caller passes to `stage()` or `set()` goes through here, so a log
 * record cannot become the thing that breaks the log pipeline.
 */
export function sanitize(
  value: unknown,
  limits: SanitizeLimits,
  redactor?: Redactor,
  path: readonly string[] = [],
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): unknown {
  if (value === null || value === undefined) return value;

  switch (typeof value) {
    case "string":
      return truncate(value, limits.maxStringLength);
    case "number":
      return Number.isFinite(value) ? value : String(value);
    case "boolean":
      return value;
    case "bigint":
      return `${value}n`;
    case "function":
    case "symbol":
      return undefined;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
  }
  if (value instanceof Error) {
    return { name: value.name, message: truncate(value.message, limits.maxStringLength) };
  }
  if (value instanceof RegExp || value instanceof URL) {
    return truncate(String(value), limits.maxStringLength);
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    const size = value instanceof ArrayBuffer ? value.byteLength : value.byteLength;
    return `[${(value as object).constructor.name}(${size} bytes)]`;
  }

  const asObject = value as object;
  if (seen.has(asObject)) return "[circular]";
  if (depth >= limits.maxDepth) return "[depth limit]";
  seen.add(asObject);

  try {
    if (Array.isArray(value)) {
      const kept = value.slice(0, limits.maxArrayLength);
      const out = kept.map((item, index) =>
        sanitize(item, limits, redactor, [...path, String(index)], seen, depth + 1),
      );
      if (value.length > kept.length) out.push(`…(+${value.length - kept.length} items)`);
      return out;
    }

    if (value instanceof Set) {
      return sanitize([...value], limits, redactor, path, seen, depth);
    }
    if (value instanceof Map) {
      return sanitize(Object.fromEntries(value), limits, redactor, path, seen, depth);
    }

    const entries = Object.entries(value as Record<string, unknown>);
    const out: Record<string, unknown> = {};
    let written = 0;
    for (const [key, raw] of entries) {
      if (written >= limits.maxKeys) {
        out["…"] = `(+${entries.length - written} keys)`;
        break;
      }
      const nextPath = [...path, key];
      const decided = redactor ? redactor(key, raw, nextPath) : raw;
      if (decided === undefined) continue;
      const clean = sanitize(decided, limits, redactor, nextPath, seen, depth + 1);
      if (clean === undefined) continue;
      out[key] = clean;
      written += 1;
    }
    return out;
  } finally {
    seen.delete(asObject);
  }
}
