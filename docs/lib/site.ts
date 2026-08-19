export const SITE_URL = "https://chiplog.dev";
export const SITE_NAME = "chiplog";
export const SITE_TITLE = "chiplog — one wide log event per operation";
export const SITE_DESCRIPTION =
  "Canonical log lines for Node. Accumulate named stages through a whole operation and flush one record on the way out — no context threaded through call signatures, and a flow that threw can never report ok.";

export const REPO = "https://github.com/MiraWision/chiplog";
export const NPM = "https://www.npmjs.com/package/chiplog";

export const OG_IMAGE = `${SITE_URL}/og-image.png`;
export const OG_IMAGE_ALT =
  "chiplog — scattered log lines on the left, one wide event carrying the whole operation on the right";

/** Absolute canonical URL for a route path ("/", "/docs/quick-start/"). */
export function canonical(path: string): string {
  const p = path.endsWith("/") ? path : `${path}/`;
  return `${SITE_URL}${p}`;
}

/**
 * Per-page social metadata.
 *
 * The root layout's `openGraph` / `twitter` values are defaults, and Next only
 * replaces the keys a page actually sets — so a page declaring just `title` and
 * `description` would still share the home page's og:url. Every page therefore
 * restates them, which is what this returns.
 */
export function pageMetadata(options: {
  path: string;
  title: string;
  description: string;
  type?: "article" | "website";
}) {
  const url = canonical(options.path);
  // The layout's title template applies to <title> only; og:title is not
  // templated, so the suffix is added here to keep card and tab identical.
  const socialTitle = `${options.title} — ${SITE_NAME}`;
  return {
    title: options.title,
    description: options.description,
    alternates: { canonical: options.path },
    openGraph: {
      type: options.type ?? "article",
      siteName: SITE_NAME,
      url,
      title: socialTitle,
      description: options.description,
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: OG_IMAGE_ALT }],
    },
    twitter: {
      card: "summary_large_image" as const,
      title: socialTitle,
      description: options.description,
      images: [{ url: OG_IMAGE, alt: OG_IMAGE_ALT }],
    },
  };
}
