import { createChiplog } from "../src/index";
import type { ChiplogOptions, FlowEvent } from "../src/types";

/** Deterministic instance: ids counted up, clock advanced by hand. */
export function harness(overrides: Partial<ChiplogOptions> = {}) {
  const events: FlowEvent[] = [];
  let clock = 0;
  let counter = 0;
  const chiplog = createChiplog({
    sink: (event) => void events.push(event),
    now: () => clock,
    wallClock: () => new Date("2026-08-18T10:00:00.000Z"),
    randomHex: (bytes) => {
      counter += 1;
      return counter.toString(16).padStart(bytes * 2, "0");
    },
    ...overrides,
  });
  return {
    chiplog,
    events,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}
