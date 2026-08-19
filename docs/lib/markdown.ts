import fs from "node:fs";
import path from "node:path";

import { Marked } from "marked";

import { syncHighlighter } from "./highlight";

/**
 * Markdown → HTML at build time: Shiki-highlighted fences, anchored headings,
 * and callouts for the lines a reader must not skim past.
 *
 * The renderer is constructed per call rather than kept as module state:
 * `marked`'s hooks are synchronous, so the highlighter must be loaded (async)
 * before parsing begins. Loading is memoized inside `highlight.ts`, so the cost
 * is paid once for the whole build.
 */

/**
 * Callouts use GitHub's alert syntax — a blockquote whose first line is
 * `[!WARNING]`. Same spelling as GitHub means a docs file still reads correctly
 * in the repository, not only on the site.
 */
const CALLOUTS = {
  note: { label: "Note", tone: "brand" },
  tip: { label: "Tip", tone: "pass" },
  important: { label: "Important", tone: "brand" },
  warning: { label: "Warning", tone: "gap" },
  caution: { label: "Caution", tone: "fail" },
} as const;

type CalloutType = keyof typeof CALLOUTS;

const MARKER = /^<p>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n?/i;

export interface TocEntry {
  id: string;
  text: string;
  depth: 2 | 3;
}

export interface RenderedDoc {
  html: string;
  toc: TocEntry[];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

/** Reads a docs markdown file. Throws loudly — a missing file is a build bug. */
export function readDoc(slug: string): string {
  const file = path.join(process.cwd(), "content", "docs", `${slug}.md`);
  return fs.readFileSync(file, "utf8");
}

export async function renderMarkdown(source: string): Promise<RenderedDoc> {
  const highlight = await syncHighlighter();
  const toc: TocEntry[] = [];
  const used = new Set<string>();

  const marked = new Marked({
    gfm: true,
    renderer: {
      code({ text, lang }) {
        return `<div class="code-block">${highlight(text, lang)}</div>`;
      },
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const base = slugify(stripTags(text)) || `section-${toc.length + 1}`;
        let id = base;
        for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
        used.add(id);
        if (depth === 2 || depth === 3) {
          toc.push({ id, text: stripTags(text), depth });
        }
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-label="Link to this section">${text}</a></h${depth}>`;
      },
      blockquote({ tokens }) {
        const inner = this.parser.parse(tokens);
        const match = MARKER.exec(inner);
        if (!match) {
          return `<div class="callout callout-quote">${inner}</div>`;
        }
        const type = match[1]!.toLowerCase() as CalloutType;
        const { label, tone } = CALLOUTS[type];
        const body = inner.replace(MARKER, "<p>");
        return `<div class="callout callout-${tone}"><p class="callout-label">${label}</p>${body}</div>`;
      },
      link({ href, tokens }) {
        const text = this.parser.parseInline(tokens);
        const external = /^https?:\/\//.test(href) && !href.startsWith("https://chiplog.dev");
        const attrs = external ? ' target="_blank" rel="noreferrer noopener"' : "";
        return `<a href="${href}"${attrs}>${text}</a>`;
      },
      table({ header, rows }) {
        const head = header
          .map((cell) => `<th>${this.parser.parseInline(cell.tokens)}</th>`)
          .join("");
        const body = rows
          .map(
            (row) =>
              `<tr>${row
                .map((cell) => `<td>${this.parser.parseInline(cell.tokens)}</td>`)
                .join("")}</tr>`,
          )
          .join("");
        return `<div class="table-scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
      },
    },
  });

  return { html: await marked.parse(source), toc };
}
