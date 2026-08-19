import { highlight } from "@/lib/highlight";

import { CopyButton } from "./CopyButton";

/**
 * A highlighted code block. Highlighting happens at build time, so the only
 * JavaScript that reaches the browser is the copy button.
 */
export async function CodeBlock({
  code,
  lang,
  copy = true,
  caption,
}: {
  code: string;
  lang?: string;
  copy?: boolean;
  caption?: string;
}) {
  const html = await highlight(code, lang);
  return (
    <figure className="code-block">
      {caption ? <figcaption>{caption}</figcaption> : null}
      {copy ? <CopyButton text={code} /> : null}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </figure>
  );
}
