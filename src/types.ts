/** Arbitrary structured detail attached to a stage or promoted to the event. */
export type Meta = Record<string, unknown>;

/** One recorded step inside a flow. */
export interface StageRecord {
  /** Stage name, e.g. `payload_validated`. */
  name: string;
  /** Milliseconds from the start of the flow to this stage. */
  atMs: number;
  /** Milliseconds spent in the *previous* stage (0 for the first one). */
  durationMs: number;
  /** Sanitised detail passed to `stage()`. Absent when no detail was given. */
  meta?: Meta;
}

export type Outcome = "ok" | "failed";
export type Level = "info" | "error";

/** Serialised failure. `stack` is present only when `includeStack` allows it. */
export interface FlowError {
  name: string;
  message: string;
  stack?: string;
  cause?: string;
}

/**
 * The single record emitted per flow. Reserved keys are listed explicitly;
 * anything passed to `set()` is merged in flat alongside them, because the
 * point of a wide event is that every field is directly queryable.
 */
export interface FlowEvent {
  /** Human-scannable summary, e.g. `flow http.POST /webhooks failed at enqueue`. */
  message: string;
  level: Level;
  flow: string;
  outcome: Outcome;
  /** Shared by every flow belonging to the same logical operation. */
  correlationId: string;
  /** Unique to this flow. */
  flowId: string;
  /** Set when this flow ran inside another one. */
  parentFlowId?: string;
  /** W3C `traceparent` for this flow — pass it across service boundaries. */
  traceparent: string;
  startedAt: string;
  durationMs: number;
  stageCount: number;
  stages: StageRecord[];
  /** Number of stages discarded by the cap. Absent when nothing was dropped. */
  droppedStages?: number;
  failedStage?: string;
  error?: FlowError;
  /**
   * Names passed to `set()` that collided with a reserved key and were skipped.
   * Reported rather than silently dropped, so the mistake is visible in the log
   * it broke.
   */
  shadowedFields?: string[];
  /** Fields merged in from `set()`. */
  [field: string]: unknown;
}

/** Where finished events go. Bring your own logger; chiplog never writes output. */
export type Sink = (event: FlowEvent) => void;

/**
 * Called for every value before it reaches the event. Return the value to keep
 * it, a replacement to mask it, or `undefined` to drop the key entirely.
 */
export type Redactor = (
  key: string,
  value: unknown,
  path: readonly string[],
) => unknown;

/** Limits that keep one pathological flow from producing an unusable record. */
export interface ChiplogLimits {
  /** Total stages kept. Beyond this, the middle is dropped. Default 200. */
  maxStages?: number;
  /** Stages kept from the beginning when the cap trips. Default half of `maxStages`. */
  keepFirstStages?: number;
  /** Stages kept from the end when the cap trips. Default half of `maxStages`. */
  keepLastStages?: number;
  /** Strings longer than this are truncated with a `…(+N)` marker. Default 2048. */
  maxStringLength?: number;
  /** Keys kept per object. Default 64. */
  maxKeys?: number;
  /** Array items kept. Default 64. */
  maxArrayLength?: number;
  /** How deep to walk nested values. Default 6. */
  maxDepth?: number;
}

export interface ChiplogOptions extends ChiplogLimits {
  /** Required. Hand the finished event to your logger. */
  sink: Sink;
  /** Applied to every value that goes into the event. */
  redact?: Redactor;
  /**
   * Called when `sink` itself throws. The exception is never rethrown: flushing
   * happens in a `finally`, so letting it escape would replace whatever error
   * the caller was already handling with a logging bug.
   */
  onSinkError?: (error: unknown, event: FlowEvent) => void;
  /** Whether to attach `error.stack`. Default: true. */
  includeStack?: boolean | ((error: unknown) => boolean);
  /** Monotonic clock in ms. Override in tests. */
  now?: () => number;
  /** Wall clock, used only for `startedAt`. Override in tests. */
  wallClock?: () => Date;
  /** Random hex generator for ids. Override in tests. */
  randomHex?: (bytes: number) => string;
}

/** Handle given to the function passed to `run()`. */
export interface Flow {
  readonly correlationId: string;
  readonly flowId: string;
  /** Current label. */
  label(): string;
  /**
   * Renames the flow. For cases where the operation is only identifiable part
   * way through — a matched route, a parsed command, a resolved job type.
   */
  rename(label: string): void;
  /** Record a step. Cheap; safe to call in hot paths. */
  stage(name: string, meta?: Meta): void;
  /** Promote fields to the top level of the event. */
  set(fields: Meta): void;
  /**
   * Marks the flow failed without throwing.
   *
   * `run()` already does this for exceptions, and that is the normal path. This
   * exists for frameworks that catch a handler's exception themselves and turn
   * it into a response — the operation failed, but nothing propagates out for
   * `run()` to see.
   */
  fail(error: unknown, stage?: string): void;
  /** W3C `traceparent` to carry across a queue or an HTTP call. */
  traceparent(): string;
}

/** Seed values for a flow, usually recovered from an inbound request. */
export interface FlowSeed {
  correlationId?: string;
  traceparent?: string;
  fields?: Meta;
}
