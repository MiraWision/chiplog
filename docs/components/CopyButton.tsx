"use client";

import { useState } from "react";

/**
 * Copies the given text. The label is the whole affordance — no icon font, no
 * tooltip library, and it degrades to an inert button if the clipboard API is
 * unavailable rather than throwing at the user.
 */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="copy-button"
      aria-label={`${label} to clipboard`}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
