import Link from "next/link";

import { CodeBlock } from "@/components/CodeBlock";
import { CopyButton } from "@/components/CopyButton";
import { JsonLd } from "@/components/JsonLd";
import { DOC_PAGES } from "@/lib/docs";
import { NPM, REPO, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

const INSTALL = "npm install chiplog";

/**
 * Deliberately *good* logging: structured JSON, one line per moment, a request
 * id where the code had one to hand. Straw-manning the left panel with
 * `console.log` spam would make the comparison unpersuasive to exactly the
 * people it is aimed at — the problem is not that these lines are bad, it is
 * that two operations are interleaved and the failure sits eight lines from the
 * request that caused it.
 */
const BEFORE = `{"level":30,"reqId":"a1","msg":"checkout received"}
{"level":30,"reqId":"b2","msg":"checkout received"}
{"level":30,"userId":"usr_221","items":3,"msg":"cart loaded"}
{"level":30,"reqId":"b2","msg":"cart loaded"}
{"level":30,"reqId":"a1","warehouse":"iad","msg":"reserved"}
{"level":30,"reqId":"b2","msg":"inventory reserved"}
{"level":30,"provider":"stripe","amount":4200,"msg":"gateway"}
{"level":50,"err":"card_declined","msg":"charge failed"}
{"level":30,"reqId":"b2","msg":"checkout completed"}`;

/** Real output — `examples/checkout.ts` in the repository prints this. */
const AFTER = `{
  "message": "flow checkout.submit failed at gateway_request",
  "level": "error",
  "flow": "checkout.submit",
  "outcome": "failed",
  "correlationId": "3c148c65f9d8e74a3dcac0a993b605e5",
  "traceparent": "00-3c148c65…-560112cbcfb925df-01",
  "durationMs": 173,
  "stageCount": 4,
  "stages": [
    { "name": "received", "atMs": 1, "durationMs": 1 },
    { "name": "cart_loaded", "atMs": 1, "durationMs": 0,
      "meta": { "userId": "usr_221", "email": "[redacted]" } },
    { "name": "inventory_reserved", "atMs": 19, "durationMs": 18,
      "meta": { "warehouse": "iad" } },
    { "name": "gateway_request", "atMs": 51, "durationMs": 32,
      "meta": { "provider": "stripe", "amount": 4200 } }
  ],
  "failedStage": "gateway_request",
  "error": {
    "name": "Error", "message": "card_declined: insufficient funds"
  },
  "orgId": "org_7f3a",
  "userId": "usr_221"
}`;

const QUICK_START = `import { createChiplog } from "chiplog";

export const chiplog = createChiplog({
  sink: (event) => logger.info(event.message, event),
});

await chiplog.run("checkout.submit", async (flow) => {
  flow.stage("received");
  const cart = await loadCart();
  flow.stage("cart_loaded", { items: cart.items.length });
  await charge(cart.total);
  flow.stage("charged");
});`;

const AMBIENT = `import { stage, set } from "chiplog";

// four files below the route handler — no parameters added anywhere
async function chargeCard(amount: number) {
  stage("gateway_request", { provider: "stripe", amount });
  const result = await stripe.charges.create({ amount });
  set({ chargeId: result.id });
  return result;
}`;

const FAILURE = `await chiplog.run("checkout.submit", async (flow) => {
  flow.stage("charged");
  throw new Error("card declined");
});
// outcome: "failed", failedStage: "charged" — and the error still propagates`;

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-brand)]">
      {children}
    </p>
  );
}

function Section({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  lead?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto mt-24 max-w-5xl px-5">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      {lead ? (
        <p className="mt-3 max-w-2xl text-[var(--color-ink-2)] leading-relaxed">{lead}</p>
      ) : null}
      <div className="mt-8">{children}</div>
    </section>
  );
}

export default function Home() {
  return (
    <main>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareSourceCode",
          name: SITE_NAME,
          description: SITE_DESCRIPTION,
          url: SITE_URL,
          codeRepository: REPO,
          programmingLanguage: "TypeScript",
          license: "https://opensource.org/licenses/MIT",
          runtimePlatform: "Node.js",
        }}
      />

      {/* Hero */}
      <div className="relative overflow-hidden border-b border-[var(--color-line)]">
        <div className="rope-bg pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto max-w-5xl px-5 pb-16 pt-20 sm:pt-28">
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            One wide log event per operation, instead of scattered lines you have to reassemble.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[var(--color-ink-2)]">
            chiplog accumulates named stages through a whole operation — at any depth, with nothing
            threaded through your call signatures — and flushes a single record on the way out. Zero
            dependencies. Bring your own logger.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/docs/quick-start/"
              className="rounded-lg bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-[var(--color-brand-ink)] transition-opacity hover:opacity-90"
            >
              Quick start
            </Link>
            <div className="code-block relative">
              <code className="flex items-center gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2.5 font-mono text-sm">
                <span className="text-[var(--color-muted)]">$</span>
                {INSTALL}
              </code>
              <CopyButton text={INSTALL} />
            </div>
            <a
              href={REPO}
              className="text-sm text-[var(--color-muted)] underline-offset-4 hover:text-[var(--color-ink)] hover:underline"
            >
              GitHub
            </a>
            <a
              href={NPM}
              className="text-sm text-[var(--color-muted)] underline-offset-4 hover:text-[var(--color-ink)] hover:underline"
            >
              npm
            </a>
          </div>
        </div>
      </div>

      {/* The comparison — the whole argument in one screen. */}
      <Section
        eyebrow="The problem"
        title="Your logs are already structured. That is not the problem."
        lead={
          <>
            Every line below is fine on its own. Together they are a puzzle: two checkouts
            interleaved, the correlation id missing from the lines that came from deeper in the
            stack, no timings, and the failure eight lines from the request that caused it.
          </>
        }
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="panel">
            <div className="panel-head">
              <span className="panel-tag">Before</span>
              <span>nine lines, two operations, one of them failed</span>
            </div>
            <CodeBlock code={BEFORE} lang="json" copy={false} />
          </div>
          <div className="panel">
            <div className="panel-head">
              <span className="panel-tag" style={{ color: "var(--color-brand)" }}>
                After
              </span>
              <span>one record, the whole attempt</span>
            </div>
            <CodeBlock code={AFTER} lang="json" copy={false} />
          </div>
        </div>
        <p className="mt-6 max-w-3xl text-[var(--color-ink-2)] leading-relaxed">
          One object. The whole attempt, in order, with timings, with the failing step named and the
          business identifiers attached. A person reads it top to bottom. A query filters on{" "}
          <code className="font-mono text-sm">outcome:failed AND failedStage:gateway_request</code>.
          An agent gets enough to reproduce.
        </p>
      </Section>

      <Section
        eyebrow="Setup"
        title="Three lines, and the logger you already run"
        lead="chiplog ships no transport of its own. It builds a plain object and hands it to your sink — which is what makes adoption three lines rather than a migration."
      >
        <CodeBlock code={QUICK_START} lang="ts" />
      </Section>

      <Section
        eyebrow="The hard part"
        title="No context threaded through your signatures"
        lead="This pattern gets abandoned over plumbing, not over the idea. stage() finds the flow in scope through AsyncLocalStorage, so it works at any depth with nothing passed in — and is a silent no-op outside a flow, because logging must never be the thing that throws."
      >
        <CodeBlock code={AMBIENT} lang="ts" />
      </Section>

      <Section
        eyebrow="Correctness"
        title="A flow that threw cannot report ok"
        lead="run() is a wrapper rather than a start/end pair for one reason. The exception is caught, attributed to the stage that was running, and rethrown unchanged. With a manual flush in a finally, one forgotten markFailed() in one catch produces a log that says a 500 succeeded — and you find out from the log that lied."
      >
        <CodeBlock code={FAILURE} lang="ts" />
      </Section>

      <Section
        eyebrow="The rest"
        title="What else is in the box"
        lead="Everything below is on by default or one option away."
      >
        <div className="grid gap-px overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-2">
          {[
            {
              title: "W3C traceparent",
              body: "No bespoke carrier format. A flow continues across an HTTP hop or a queue and interoperates with OpenTelemetry.",
            },
            {
              title: "Bounded output",
              body: "Stage cap with first/last retention, plus depth, width and string limits. A retry storm cannot produce a record your backend drops.",
            },
            {
              title: "Redaction hook",
              body: "A function, not a key list — the shape of sensitive data is application-specific. Runs over everything on its way into the event.",
            },
            {
              title: "Nested flows",
              body: "A run() inside a run() emits its own event, sharing the correlation id and pointing at its parent.",
            },
            {
              title: "Hono and Elysia adapters",
              body: "Wrap every request, seed from inbound headers, label by matched route pattern. Writing one for another framework is a few lines.",
            },
            {
              title: "Loud about collisions",
              body: "A set() key that clashes with a reserved name is reported in shadowedFields, never silently dropped.",
            },
          ].map((item) => (
            <div key={item.title} className="bg-[var(--color-surface)] p-5">
              <h3 className="font-medium tracking-tight">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-ink-2)]">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Docs" title="Read next">
        <div className="grid gap-px overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-2">
          {DOC_PAGES.map((page) => (
            <Link
              key={page.slug}
              href={`/docs/${page.slug}/`}
              className="group bg-[var(--color-surface)] p-5 transition-colors hover:bg-[color-mix(in_oklab,var(--color-brand)_6%,var(--color-surface))]"
            >
              <h3 className="font-medium tracking-tight group-hover:text-[var(--color-brand)]">
                {page.label}
              </h3>
              <p className="mt-1.5 text-sm text-[var(--color-ink-2)]">{page.blurb}</p>
            </Link>
          ))}
        </div>
      </Section>
    </main>
  );
}
