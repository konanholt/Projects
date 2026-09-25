# Recipe Database

Personal recipe database sourced from sixsistersstuff.com (schema.org
`Recipe` JSON-LD embedded in each page by their WP Recipe Maker plugin —
the site publishes structured recipe data and doesn't block scraping in
`robots.txt`). Ingredient/blog text is copyrighted; this stores structured
recipe data for personal use, not a republished copy of their site.

Two equivalent script sets are provided — use whichever runtime you have:
- `scripts/*.py` (Python, needs `pip install recipe-scrapers`)
- `scripts/*.mjs` (Node, no dependencies — built-in `fetch`, reads the
  JSON-LD directly)

## Schema

Normalized (3NF), SQLite dialect, compatible with Cloudflare D1:

- `recipes` — one row per recipe
- `ingredients` — deduplicated ingredient names (currently the raw scraped
  ingredient line, e.g. `"1 pound lean ground beef"` — not yet parsed into
  quantity/unit/item; see Limitations)
- `recipe_ingredients` — join table, `raw_text` + `sort_order` per recipe
- `instructions` — one row per step, ordered by `step_number`
- `nutrients` — one row per recipe, values kept as scraped (e.g. `"273 kcal"`)

See `migrations/0001_init.sql`.

## Workflow

1. Collect every recipe URL from the sitemap:
   ```
   python scripts/collect_recipe_urls.py urls.txt
   # or
   node scripts/collect-recipe-urls.mjs urls.txt
   ```

2. Scrape each URL (rate-limited, 2s between requests) into a JSON array:
   ```
   python scripts/scrape_six_sisters.py urls.txt recipes.json
   # or
   node scripts/scrape-six-sisters.mjs urls.txt recipes.json
   ```

3. Convert the JSON into an idempotent SQL file (safe to re-run; upserts
   recipes/nutrients, skips existing ingredients/instructions):
   ```
   python scripts/build_load_sql.py recipes.json load.sql
   # or
   node scripts/build-load-sql.mjs recipes.json load.sql
   ```

4. Apply to D1 (palmjam.party) — create the database first if you haven't:
   ```
   wrangler d1 create recipes   # first time only; add the output to wrangler.toml
   wrangler d1 execute recipes --remote --file=migrations/0001_init.sql   # first time only
   wrangler d1 execute recipes --remote --file=load.sql
   ```

## Limitations

- Ingredient names aren't parsed into quantity/unit/item — `ingredients.name`
  is currently the full raw line, so cross-recipe ingredient matching (e.g.
  "find all recipes with chicken") won't work well until that parsing is added.
- No dedup/versioning if a recipe's ingredients change between scrapes — the
  ingredient list is only appended to, not diffed.
