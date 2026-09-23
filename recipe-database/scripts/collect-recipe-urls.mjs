// Collect all recipe URLs from sixsistersstuff.com's Yoast SEO sitemaps.
//
// robots.txt publishes https://www.sixsistersstuff.com/sitemap_index.xml
// specifically for crawlers to discover content -- this just walks it.
//
// Usage: node collect-recipe-urls.mjs urls.txt

import { writeFileSync } from "node:fs";

const USER_AGENT = "Mozilla/5.0 (compatible; recipe-research/1.0)";
const SITEMAP_INDEX = "https://www.sixsistersstuff.com/sitemap_index.xml";

async function fetchXml(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  return res.text();
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

async function getRecipeSitemaps() {
  const xml = await fetchXml(SITEMAP_INDEX);
  return extractLocs(xml).filter((u) => u.includes("recipe-sitemap"));
}

async function getRecipeUrls(sitemapUrl) {
  const xml = await fetchXml(sitemapUrl);
  // Drop the /recipe/ landing page itself, keep only /recipe/<slug>/ pages.
  return extractLocs(xml).filter((u) => u.replace(/\/+$/, "").split("/").length > 4);
}

async function main(outPath, delayMs = 1000) {
  const sitemaps = await getRecipeSitemaps();
  console.log(`Found ${sitemaps.length} recipe sitemap(s)`);

  const allUrls = [];
  for (let i = 0; i < sitemaps.length; i++) {
    const urls = await getRecipeUrls(sitemaps[i]);
    console.log(`[${i + 1}/${sitemaps.length}] ${sitemaps[i]}: ${urls.length} recipes`);
    allUrls.push(...urls);
    if (i < sitemaps.length - 1) await new Promise((r) => setTimeout(r, delayMs));
  }

  writeFileSync(outPath, allUrls.join("\n") + "\n");
  console.log(`Saved ${allUrls.length} recipe URLs to ${outPath}`);
}

const outPath = process.argv[2];
if (!outPath) {
  console.error("Usage: node collect-recipe-urls.mjs urls.txt");
  process.exit(1);
}
main(outPath);
