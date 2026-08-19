import Link from "next/link";

import { NPM, REPO, SITE_NAME } from "@/lib/site";

function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--color-brand)" />
      {/* The reel the log line was wound on. */}
      <path d="M7.2 4.6h17.6a1.8 1.8 0 0 1 0 3.6h-1.4c-2.2 2.6-2.2 12.4 0 15h1.4a1.8 1.8 0 0 1 0 3.6H7.2a1.8 1.8 0 0 1 0-3.6h1.4c2.2-2.6 2.2-12.4 0-15H7.2a1.8 1.8 0 0 1 0-3.6z" fill="var(--color-brand-ink)" />
      <g stroke="var(--color-brand)" strokeWidth="1.9" strokeLinecap="round">
        <path d="M9.3 13.4h13.4M9.3 18.6h13.4" />
      </g>
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-canvas)_88%,transparent)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-5">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Mark />
          {SITE_NAME}
        </Link>
        <nav className="flex items-center gap-5 text-sm text-[var(--color-muted)]">
          <Link href="/docs/" className="hover:text-[var(--color-ink)]">
            Docs
          </Link>
          <a href={REPO} className="hover:text-[var(--color-ink)]">
            GitHub
          </a>
          <a href={NPM} className="hover:text-[var(--color-ink)]">
            npm
          </a>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-[var(--color-line)]">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-10 text-sm text-[var(--color-muted)] sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md">
          A <strong className="font-medium text-[var(--color-ink-2)]">chip log</strong> was a board
          on a knotted rope, thrown astern to record a ship&rsquo;s progress. Its readings went into
          the log book — which is where the word in your terminal comes from.
        </p>
        <p>
          MIT ·{" "}
          <a href={REPO} className="hover:text-[var(--color-ink)]">
            GitHub
          </a>{" "}
          ·{" "}
          <a href={NPM} className="hover:text-[var(--color-ink)]">
            npm
          </a>
        </p>
      </div>
    </footer>
  );
}
