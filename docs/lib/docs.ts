export interface DocPage {
  slug: string;
  title: string;
  /** Meta description (70–160 chars). */
  description: string;
  /** Short label for indexes and prev/next navigation. */
  label: string;
  /** One line under the label in the docs index. */
  blurb: string;
}

/** Order here is the reading order, and drives prev/next. */
export const DOC_PAGES: DocPage[] = [
  {
    slug: "quick-start",
    title: "Quick start",
    label: "Quick start",
    blurb: "Install, wire a sink, record your first flow.",
    description:
      "Install chiplog, point it at the logger you already run, and get one wide event per operation. Three lines of setup, zero dependencies.",
  },
  {
    slug: "stages",
    title: "Stages and fields",
    label: "Stages and fields",
    blurb: "Record steps at any depth. Promote fields to the top level.",
    description:
      "Record named stages from anywhere in the call stack with no context parameter, and promote business identifiers onto the event so every field is directly queryable.",
  },
  {
    slug: "failures",
    title: "Failures",
    label: "Failures",
    blurb: "Why run() is a wrapper, and how a flow gets attributed.",
    description:
      "chiplog attributes an exception to the stage that was running and rethrows it unchanged. A flow that threw cannot report success — the reason run() is a wrapper, not a start/end pair.",
  },
  {
    slug: "correlation",
    title: "Correlation and traceparent",
    label: "Correlation",
    blurb: "Across services, queues and nested flows.",
    description:
      "chiplog carries W3C Trace Context rather than a bespoke carrier, so a flow continues across HTTP hops and queue boundaries and interoperates with OpenTelemetry.",
  },
  {
    slug: "safety",
    title: "Redaction and limits",
    label: "Redaction and limits",
    blurb: "Keep PII out, and keep one bad flow from breaking the pipeline.",
    description:
      "A redaction hook runs over everything entering an event, and every dimension is bounded — stages, depth, width, string length — so a wide event cannot become the thing that breaks your log backend.",
  },
  {
    slug: "adapters",
    title: "Framework adapters",
    label: "Adapters",
    blurb: "Hono, Elysia, and writing your own in a few lines.",
    description:
      "Drop-in adapters for Hono and Elysia wrap every request in a flow, seed it from inbound headers and label it by matched route. Writing one for another framework takes a few lines.",
  },
  {
    slug: "api",
    title: "API reference",
    label: "API reference",
    blurb: "Every export, every option, the event shape.",
    description:
      "Complete reference for chiplog: createChiplog options, the Flow handle, ambient helpers, the emitted event shape, and the helpers for W3C trace context.",
  },
];

export function docPage(slug: string): DocPage | undefined {
  return DOC_PAGES.find((page) => page.slug === slug);
}

export function docNeighbours(slug: string): { prev?: DocPage; next?: DocPage } {
  const index = DOC_PAGES.findIndex((page) => page.slug === slug);
  if (index < 0) return {};
  return {
    ...(index > 0 ? { prev: DOC_PAGES[index - 1] } : {}),
    ...(index < DOC_PAGES.length - 1 ? { next: DOC_PAGES[index + 1] } : {}),
  };
}
