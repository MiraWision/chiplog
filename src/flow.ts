import { formatTraceparent } from "./ids";
import { sanitize, type SanitizeLimits } from "./redact";
import { StageBuffer } from "./stages";
import type {
  Flow,
  FlowError,
  FlowEvent,
  FlowSeed,
  Meta,
  Outcome,
  Redactor,
  Sink,
  StageRecord,
} from "./types";

/** Options after defaults have been applied. */
export interface ResolvedOptions {
  sink: Sink;
  redact: Redactor | undefined;
  onSinkError: ((error: unknown, event: FlowEvent) => void) | undefined;
  includeStack: (error: unknown) => boolean;
  limits: SanitizeLimits;
  keepFirstStages: number;
  keepLastStages: number;
  now: () => number;
  wallClock: () => Date;
  randomHex: (bytes: number) => string;
}

/**
 * Keys the event owns. A field of the same name coming from `set()` is skipped
 * and reported in `shadowedFields` rather than silently winning or silently
 * losing — the original version of this pattern dropped such collisions without
 * a trace, which is how a log quietly stops meaning what you think it means.
 */
const RESERVED = new Set([
  "message",
  "level",
  "flow",
  "outcome",
  "correlationId",
  "flowId",
  "parentFlowId",
  "traceparent",
  "startedAt",
  "durationMs",
  "stageCount",
  "stages",
  "droppedStages",
  "failedStage",
  "error",
  "shadowedFields",
]);

function buildMessage(label: string, outcome: Outcome, failedStage?: string): string {
  if (outcome === "ok") return `flow ${label} ok`;
  return failedStage ? `flow ${label} failed at ${failedStage}` : `flow ${label} failed`;
}

function toFlowError(
  error: unknown,
  includeStack: boolean,
  maxStringLength: number,
): FlowError {
  const truncate = (value: string): string =>
    value.length <= maxStringLength
      ? value
      : `${value.slice(0, maxStringLength)}…(+${value.length - maxStringLength})`;

  if (error instanceof Error) {
    const cause = (error as { cause?: unknown }).cause;
    return {
      name: error.name,
      message: truncate(error.message),
      ...(includeStack && error.stack ? { stack: truncate(error.stack) } : {}),
      ...(cause !== undefined ? { cause: truncate(String(cause)) } : {}),
    };
  }
  return { name: "NonError", message: truncate(String(error)) };
}

/** Mutable state of one in-flight flow. Not part of the public API. */
export class FlowState {
  private label: string;
  readonly correlationId: string;
  readonly flowId: string;
  readonly parentFlowId: string | undefined;
  readonly traceId: string;
  readonly spanId: string;

  private readonly options: ResolvedOptions;
  private readonly buffer: StageBuffer;
  private readonly fields: Meta = {};
  private readonly shadowed: string[] = [];
  private readonly startMs: number;
  private readonly startedAt: string;

  private lastStageAtMs = 0;
  private failedStage: string | undefined;
  private failure: unknown;
  private hasFailed = false;
  private flushed = false;

  constructor(
    options: ResolvedOptions,
    label: string,
    seed: FlowSeed,
    parent: FlowState | undefined,
    ids: { traceId: string; spanId: string },
  ) {
    this.options = options;
    this.label = label;
    this.traceId = ids.traceId;
    this.spanId = ids.spanId;
    this.flowId = ids.spanId;
    this.parentFlowId = parent?.flowId;
    this.correlationId = seed.correlationId ?? parent?.correlationId ?? ids.traceId;
    this.buffer = new StageBuffer(options.keepFirstStages, options.keepLastStages);
    this.startMs = options.now();
    this.startedAt = options.wallClock().toISOString();
    if (seed.fields) this.set(seed.fields);
  }

  rename(label: string): void {
    if (!this.flushed) this.label = label;
  }

  currentLabel(): string {
    return this.label;
  }

  stage(name: string, meta?: Meta): void {
    if (this.flushed) return;
    const atMs = Math.round(this.options.now() - this.startMs);
    const clean =
      meta === undefined
        ? undefined
        : (sanitize(meta, this.options.limits, this.options.redact) as Meta | undefined);
    const record: StageRecord = {
      name,
      atMs,
      durationMs: atMs - this.lastStageAtMs,
      ...(clean && Object.keys(clean).length > 0 ? { meta: clean } : {}),
    };
    this.lastStageAtMs = atMs;
    this.buffer.push(record);
  }

  set(fields: Meta): void {
    if (this.flushed) return;
    for (const [key, value] of Object.entries(fields)) {
      if (RESERVED.has(key)) {
        if (!this.shadowed.includes(key)) this.shadowed.push(key);
        continue;
      }
      if (value === undefined) continue;
      this.fields[key] = value;
    }
  }

  /**
   * Records a failure and attributes it to the stage that was running. Called by
   * `run()` from its own catch, which is the whole reason a flow cannot report
   * `ok` for an operation that threw.
   */
  markFailed(error: unknown, stage?: string): void {
    if (this.flushed || this.hasFailed) return;
    this.hasFailed = true;
    this.failure = error;
    this.failedStage = stage ?? this.buffer.last;
  }

  /** One-shot. Later calls are ignored, so a stray `flush()` cannot duplicate. */
  flush(): void {
    if (this.flushed) return;
    this.flushed = true;

    const outcome: Outcome = this.hasFailed ? "failed" : "ok";
    const dropped = this.buffer.dropped;
    const event: FlowEvent = {
      message: buildMessage(this.label, outcome, this.failedStage),
      level: outcome === "failed" ? "error" : "info",
      flow: this.label,
      outcome,
      correlationId: this.correlationId,
      flowId: this.flowId,
      ...(this.parentFlowId ? { parentFlowId: this.parentFlowId } : {}),
      traceparent: this.traceparent(),
      startedAt: this.startedAt,
      durationMs: Math.round(this.options.now() - this.startMs),
      stageCount: this.buffer.count,
      stages: this.buffer.toArray(),
      ...(dropped > 0 ? { droppedStages: dropped } : {}),
      ...(this.failedStage ? { failedStage: this.failedStage } : {}),
      ...(this.hasFailed
        ? {
            error: toFlowError(
              this.failure,
              this.options.includeStack(this.failure),
              this.options.limits.maxStringLength,
            ),
          }
        : {}),
      ...(this.shadowed.length > 0 ? { shadowedFields: [...this.shadowed] } : {}),
    };

    const cleanFields = sanitize(this.fields, this.options.limits, this.options.redact) as Meta;
    for (const [key, value] of Object.entries(cleanFields)) {
      event[key] = value;
    }

    try {
      this.options.sink(event);
    } catch (sinkError) {
      // A throwing sink must not replace the error the caller is already
      // handling: flush() runs in a finally block, so rethrowing here would
      // swallow the real failure and report a logging bug instead.
      this.options.onSinkError?.(sinkError, event);
    }
  }

  traceparent(): string {
    return formatTraceparent(this.traceId, this.spanId);
  }

  /** The narrow object handed to user code. */
  handle(): Flow {
    return {
      correlationId: this.correlationId,
      flowId: this.flowId,
      label: () => this.label,
      rename: (label) => this.rename(label),
      stage: (name, meta) => this.stage(name, meta),
      set: (fields) => this.set(fields),
      fail: (error, stage) => this.markFailed(error, stage),
      traceparent: () => this.traceparent(),
    };
  }
}
