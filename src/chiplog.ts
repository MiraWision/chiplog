import { flowStorage } from "./context";
import { FlowState, type ResolvedOptions } from "./flow";
import { parseTraceparent, randomHex as defaultRandomHex } from "./ids";
import type { ChiplogOptions, Flow, FlowSeed, Meta } from "./types";

/** Header names read when recovering a flow started upstream, in priority order. */
export const CORRELATION_HEADERS = ["x-correlation-id", "x-request-id"] as const;

export interface Chiplog {
  /**
   * Runs `fn` inside a new flow and emits exactly one event when it settles.
   *
   * The failure path is the reason this is a wrapper and not a `start()` /
   * `end()` pair: an exception is caught here, attributed to the stage that was
   * running, and rethrown unchanged. There is no way to forget to mark a flow
   * failed, and therefore no way for the log to claim success for an operation
   * that threw.
   */
  run<T>(label: string, fn: (flow: Flow) => Promise<T> | T, seed?: FlowSeed): Promise<T>;
  /** Synchronous variant, for flows with no awaits at all. */
  runSync<T>(label: string, fn: (flow: Flow) => T, seed?: FlowSeed): T;
  /** Wraps a function so every call becomes a flow. */
  wrap<A extends unknown[], R>(
    label: string,
    fn: (...args: A) => Promise<R> | R,
  ): (...args: A) => Promise<R>;
  /**
   * Builds a seed from inbound headers: a valid `traceparent` continues the
   * upstream trace, otherwise `x-correlation-id` / `x-request-id` is adopted as
   * the correlation id.
   */
  seedFromHeaders(get: (name: string) => string | null | undefined): FlowSeed;
}

function resolve(options: ChiplogOptions): ResolvedOptions {
  const maxStages = options.maxStages ?? 200;
  const half = Math.max(1, Math.floor(maxStages / 2));
  const includeStack = options.includeStack ?? true;
  return {
    sink: options.sink,
    redact: options.redact,
    onSinkError: options.onSinkError,
    includeStack:
      typeof includeStack === "function" ? includeStack : () => includeStack,
    limits: {
      maxStringLength: options.maxStringLength ?? 2048,
      maxKeys: options.maxKeys ?? 64,
      maxArrayLength: options.maxArrayLength ?? 64,
      maxDepth: options.maxDepth ?? 6,
    },
    keepFirstStages: options.keepFirstStages ?? half,
    keepLastStages: options.keepLastStages ?? half,
    now: options.now ?? (() => performance.now()),
    wallClock: options.wallClock ?? (() => new Date()),
    randomHex: options.randomHex ?? defaultRandomHex,
  };
}

/**
 * Creates a chiplog instance.
 *
 * `sink` is required and chiplog ships no transport of its own: it produces one
 * plain object per flow and hands it to the logger you already run. That keeps
 * the package at zero dependencies and makes adoption three lines rather than a
 * migration.
 */
export function createChiplog(options: ChiplogOptions): Chiplog {
  const resolved = resolve(options);

  function start(label: string, seed: FlowSeed): FlowState {
    const parent = flowStorage.getStore();
    const upstream = parseTraceparent(seed.traceparent);
    const traceId = upstream?.traceId ?? parent?.traceId ?? resolved.randomHex(16);
    const spanId = resolved.randomHex(8);
    return new FlowState(resolved, label, seed, parent, { traceId, spanId });
  }

  return {
    async run(label, fn, seed = {}) {
      const state = start(label, seed);
      return flowStorage.run(state, async () => {
        try {
          return await fn(state.handle());
        } catch (error) {
          state.markFailed(error);
          throw error;
        } finally {
          state.flush();
        }
      });
    },

    runSync(label, fn, seed = {}) {
      const state = start(label, seed);
      return flowStorage.run(state, () => {
        try {
          return fn(state.handle());
        } catch (error) {
          state.markFailed(error);
          throw error;
        } finally {
          state.flush();
        }
      });
    },

    wrap(label, fn) {
      return (...args) => this.run(label, () => fn(...args));
    },

    seedFromHeaders(get) {
      const traceparent = get("traceparent")?.trim();
      const seed: FlowSeed = {};
      if (traceparent) {
        seed.traceparent = traceparent;
        const parsed = parseTraceparent(traceparent);
        if (parsed) seed.correlationId = parsed.traceId;
      }
      if (!seed.correlationId) {
        for (const name of CORRELATION_HEADERS) {
          const value = get(name)?.trim();
          if (value) {
            seed.correlationId = value;
            break;
          }
        }
      }
      return seed;
    },
  };
}

/** The flow currently in scope, or `undefined` outside any flow. */
export function currentFlow(): Flow | undefined {
  return flowStorage.getStore()?.handle();
}

/**
 * Records a stage on the flow in scope, from anywhere in the call stack — no
 * context parameter to thread through service and repository signatures. That
 * plumbing is the actual cost of this pattern and the reason teams abandon it.
 *
 * A no-op outside a flow: logging must never be the thing that throws.
 */
export function stage(name: string, meta?: Meta): void {
  flowStorage.getStore()?.stage(name, meta);
}

/** Promotes fields onto the event of the flow in scope. No-op outside a flow. */
export function set(fields: Meta): void {
  flowStorage.getStore()?.set(fields);
}

/** Correlation id of the flow in scope, if any. */
export function correlationId(): string | undefined {
  return flowStorage.getStore()?.correlationId;
}

/** `traceparent` of the flow in scope — put it on outbound calls and jobs. */
export function traceparent(): string | undefined {
  return flowStorage.getStore()?.traceparent();
}
