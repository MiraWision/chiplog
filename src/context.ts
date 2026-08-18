import { AsyncLocalStorage } from "node:async_hooks";

import type { FlowState } from "./flow";

/**
 * The one store every chiplog instance shares. Ambient `stage()` has to find the
 * flow it is inside without being handed anything, and a single module-level
 * store is what makes that work — the flow itself carries the configuration and
 * the sink, so multiple instances coexist without ambiguity.
 *
 * This is the only Node-specific import in the core. `AsyncLocalStorage` is
 * available on Node 18+, Bun and Deno, and on workers behind a compatibility
 * flag; it is isolated here so an edge build can swap it.
 */
export const flowStorage = new AsyncLocalStorage<FlowState>();
