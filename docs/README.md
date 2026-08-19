# chiplog.dev

The documentation site: Next.js static export, deployed to GitHub Pages behind the `chiplog.dev`
CNAME. Content lives in `content/docs/*.md`; the page list and reading order are in `lib/docs.ts`.

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # static export into out/
npm run preview   # serve the export
npm run deploy    # gh-pages -d out --dotfiles
```

Syntax highlighting is Shiki at **build time**, both themes emitted per token and chosen by
`prefers-color-scheme`, so the export ships no client JavaScript for it and switching the system
theme needs no reload.

## Adding a page

1. Write `content/docs/<slug>.md`.
2. Add an entry to `DOC_PAGES` in `lib/docs.ts` — position in the array is the reading order and
   drives prev/next.

The route, sitemap entry, metadata, table of contents and navigation follow from that.

## Social card

`public/og-image.svg` is the source; `public/og-image.png` is the 1200×630 render that the metadata
points at. After editing the SVG, re-render it:

```bash
node -e "require('sharp')('public/og-image.svg',{density:200}).resize(1200,630).png().toFile('public/og-image.png')"
```
