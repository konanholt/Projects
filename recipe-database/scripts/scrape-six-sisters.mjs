// Scrape recipes from sixsistersstuff.com by reading their schema.org/Recipe
// JSON-LD directly (emitted by their WP Recipe Maker plugin for SEO).
//
// Usage: node scrape-six-sisters.mjs urls.txt out.json

import { readFileSync, writeFileSync } from "node:fs";

const USER_AGENT = "Mozilla/5.0 (compatible; recipe-research/1.0)";

function decodeEntities(str) {
  if (!str) return str;
  return str
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function isoDurationToMinutes(iso) {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return null;
  const hours = parseInt(m[1] || "0", 10);
  const minutes = parseInt(m[2] || "0", 10);
  return hours * 60 + minutes;
}

function findRecipeNode(jsonLdBlocks) {
  for (const block of jsonLdBlocks) {
    let parsed;
    try {
      parsed = JSON.parse(block);
    } catch {
      continue;
    }
    const items = Array.isArray(parsed) ? parsed : parsed["@graph"] || [parsed];
    for (const item of items) {
      const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
      if (types.includes("Recipe")) return item;
    }
  }
  return null;
}

async function scrapeRecipe(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  const html = await res.text();
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => m[1]
  );
  const recipe = findRecipeNode(blocks);
  if (!recipe) throw new Error("no Recipe JSON-LD found");

  const yields = Array.isArray(recipe.recipeYield) ? recipe.recipeYield.at(-1) : recipe.recipeYield;
  const image = Array.isArray(recipe.image) ? recipe.image[0] : recipe.image;
  const instructions = (recipe.recipeInstructions || [])
    .map((step) => (typeof step === "string" ? step : step.text))
    .map(decodeEntities)
    .join("\n");

  return {
    url,
    title: decodeEntities(recipe.name),
    total_time_minutes: isoDurationToMinutes(recipe.totalTime),
    yields: yields || null,
    ingredients: (recipe.recipeIngredient || []).map(decodeEntities),
    instructions,
    nutrients: recipe.nutrition
      ? Object.fromEntries(Object.entries(recipe.nutrition).filter(([k]) => k !== "@type"))
      : null,
    image: image || null,
  };
}

async function main(urlsPath, outPath, delayMs = 2000) {
  const urls = readFileSync(urlsPath, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const recipes = [];
  for (let i = 0; i < urls.length; i++) {
    try {
      recipes.push(await scrapeRecipe(urls[i]));
      console.log(`[${i + 1}/${urls.length}] ok: ${urls[i]}`);
    } catch (e) {
      console.log(`[${i + 1}/${urls.length}] skip (${e.message}): ${urls[i]}`);
    }
    if (i < urls.length - 1) await new Promise((r) => setTimeout(r, delayMs));
  }

  writeFileSync(outPath, JSON.stringify(recipes, null, 2));
  console.log(`Saved ${recipes.length} recipes to ${outPath}`);
}

const [urlsPath, outPath] = process.argv.slice(2);
if (!urlsPath || !outPath) {
  console.error("Usage: node scrape-six-sisters.mjs urls.txt out.json");
  process.exit(1);
}
main(urlsPath, outPath);
