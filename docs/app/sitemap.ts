import type { MetadataRoute } from "next";

import { DOC_PAGES } from "@/lib/docs";
import { canonical } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: canonical("/"), priority: 1 },
    { url: canonical("/docs"), priority: 0.8 },
    ...DOC_PAGES.map((page) => ({
      url: canonical(`/docs/${page.slug}`),
      priority: 0.6,
    })),
  ];
}
