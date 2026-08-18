import { describe, expect, it } from "vitest";

import { harness } from "./helpers";

describe("stage cap", () => {
  it("keeps the first and last stages and counts what it dropped", async () => {
    const { chiplog, events } = harness({ keepFirstStages: 2, keepLastStages: 3 });

    await chiplog.run("retry.storm", (flow) => {
      for (let i = 0; i < 50; i += 1) flow.stage(`s${i}`);
    });

    const event = events[0]!;
    expect(event.stageCount).toBe(50);
    expect(event.droppedStages).toBe(45);
    expect(event.stages.map((s) => s.name)).toEqual(["s0", "s1", "s47", "s48", "s49"]);
  });

  it("reports no drop marker when it stays under the cap", async () => {
    const { chiplog, events } = harness({ keepFirstStages: 5, keepLastStages: 5 });
    await chiplog.run("x", (flow) => {
      flow.stage("a");
      flow.stage("b");
    });
    expect(events[0]!.droppedStages).toBeUndefined();
    expect(events[0]!.stages).toHaveLength(2);
  });

  it("still attributes a failure to a stage that the cap discarded", async () => {
    const { chiplog, events } = harness({ keepFirstStages: 1, keepLastStages: 1 });
    await expect(
      chiplog.run("x", (flow) => {
        flow.stage("first");
        flow.stage("middle");
        flow.stage("last_seen");
        throw new Error("boom");
      }),
    ).rejects.toThrow();
    expect(events[0]!.failedStage).toBe("last_seen");
  });
});
