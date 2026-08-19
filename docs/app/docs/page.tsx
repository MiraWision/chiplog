import type { Metadata } from "next";
import Link from "next/link";

import { DOC_PAGES } from "@/lib/docs";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  path: "/docs",
  type: "website",
  title: "Documentation",
  description:
    "How chiplog works: recording stages at any depth, failure attribution, correlation across services and queues, redaction and limits, framework adapters, and the full API.",
});

export default function DocsIndex() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-16">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-brand)]">
        Documentation
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        Everything chiplog does
      </h1>
      <p className="mt-4 max-w-2xl text-[var(--color-ink-2)] leading-relaxed">
        Seven pages, in reading order. The first one gets you an event; the rest are the decisions
        behind it.
      </p>

      <ol className="mt-10 grid gap-px overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-line)]">
        {DOC_PAGES.map((page, index) => (
          <li key={page.slug}>
            <Link
              href={`/docs/${page.slug}/`}
              className="group flex gap-4 bg-[var(--color-surface)] p-5 transition-colors hover:bg-[color-mix(in_oklab,var(--color-brand)_6%,var(--color-surface))]"
            >
              <span className="mt-0.5 font-mono text-sm text-[var(--color-muted)]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>
                <span className="block font-medium tracking-tight group-hover:text-[var(--color-brand)]">
                  {page.title}
                </span>
                <span className="mt-1 block text-sm text-[var(--color-ink-2)]">{page.blurb}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </main>
  );
}
