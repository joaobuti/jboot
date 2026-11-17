import { casePath, pages } from "../content/site-data.mjs";

export function GET({ site }: { site: URL }) {
  const urls = Object.entries(pages)
    .flatMap(([locale, page]) => [page.path, ...page.cases.items.map((item) => casePath(locale, item.id))])
    .map((path) => `<url><loc>${new URL(path, site)}</loc></url>`)
    .join("");

  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
