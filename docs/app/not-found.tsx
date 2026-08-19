import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-24">
      <p className="font-mono text-sm text-[var(--color-brand)]">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">No such page</h1>
      <p className="mt-3 text-[var(--color-ink-2)]">
        That route was never recorded.{" "}
        <Link href="/docs/" className="underline underline-offset-4">
          Read the docs
        </Link>{" "}
        instead.
      </p>
    </main>
  );
}
