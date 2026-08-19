import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/JsonLd";
import { DOC_PAGES, docNeighbours, docPage } from "@/lib/docs";
import { readDoc, renderMarkdown } from "@/lib/markdown";
import { canonical, pageMetadata, SITE_NAME } from "@/lib/site";

interface Params {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return DOC_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const page = docPage(slug);
  if (!page) return {};
  return pageMetadata({
    path: `/docs/${page.slug}`,
    title: page.title,
    description: page.description,
  });
}

export default async function DocPage({ params }: Params) {
  const { slug } = await params;
  const page = docPage(slug);
  if (!page) notFound();

  const { html, toc } = await renderMarkdown(readDoc(page.slug));
  const { prev, next } = docNeighbours(page.slug);

  return (
    <main className="mx-auto max-w-5xl px-5 py-14">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: page.title,
          description: page.description,
          url: canonical(`/docs/${page.slug}`),
          isPartOf: { "@type": "WebSite", name: SITE_NAME, url: canonical("/") },
        }}
      />

      <div className="lg:grid lg:grid-cols-[1fr_13rem] lg:gap-12">
        <div className="min-w-0">
          <nav className="mb-6 text-sm text-[var(--color-muted)]">
            <Link href="/docs/" className="hover:text-[var(--color-ink)]">
              Docs
            </Link>
            <span className="px-2">/</span>
            <span className="text-[var(--color-ink-2)]">{page.label}</span>
          </nav>

          <article
            className="prose-site prose max-w-none prose-headings:tracking-tight prose-h1:text-3xl prose-h2:mt-12 prose-h2:text-xl prose-h3:text-base prose-pre:bg-transparent prose-pre:p-0"
            dangerouslySetInnerHTML={{ __html: html }}
          />

          <nav className="mt-16 grid gap-3 border-t border-[var(--color-line)] pt-6 sm:grid-cols-2">
            {prev ? (
              <Link
                href={`/docs/${prev.slug}/`}
                className="rounded-lg border border-[var(--color-line)] p-4 transition-colors hover:border-[var(--color-brand)]"
              >
                <span className="block text-xs text-[var(--color-muted)]">Previous</span>
                <span className="mt-0.5 block font-medium">{prev.label}</span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                href={`/docs/${next.slug}/`}
                className="rounded-lg border border-[var(--color-line)] p-4 text-right transition-colors hover:border-[var(--color-brand)]"
              >
                <span className="block text-xs text-[var(--color-muted)]">Next</span>
                <span className="mt-0.5 block font-medium">{next.label}</span>
              </Link>
            ) : null}
          </nav>
        </div>

        {toc.length > 1 ? (
          <aside className="hidden lg:block">
            <div className="sticky top-20">
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-muted)]">
                On this page
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {toc.map((entry) => (
                  <li key={entry.id} className={entry.depth === 3 ? "pl-3" : undefined}>
                    <a
                      href={`#${entry.id}`}
                      className="text-[var(--color-muted)] transition-colors hover:text-[var(--color-brand)]"
                    >
                      {entry.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        ) : null}
      </div>
    </main>
  );
}
