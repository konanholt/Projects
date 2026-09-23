# Recipe Database

Personal recipe database sourced from sixsistersstuff.com (schema.org
`Recipe` JSON-LD, read via [`recipe-scrapers`](https://github.com/hhursev/recipe-scrapers)'s
wild mode — the site publishes structured recipe data and doesn't block
scraping in `robots.txt`). Ingredient/blog text is copyrighted; this stores
structured recipe data for personal use, not a republished copy of their
site.

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

1. `python scripts/collect_recipe_urls.py urls.txt`
   Walks the site's sitemap index and writes every recipe URL to `urls.txt`.

2. `python scripts/scrape_six_sisters.py urls.txt recipes.json`
   Scrapes each URL (rate-limited, 2s between requests) into a JSON array.

3. `python scripts/build_load_sql.py recipes.json load.sql`
   Converts the JSON into an idempotent SQL file (safe to re-run; upserts
   recipes/nutrients, skips existing ingredients/instructions).

4. Apply to D1 (palmjam.party):
   ```
   wrangler d1 migrations apply <db-name> --remote   # first time only
   wrangler d1 execute <db-name> --remote --file=load.sql
   ```

Requires `pip install recipe-scrapers`.

## Limitations

- Ingredient names aren't parsed into quantity/unit/item — `ingredients.name`
  is currently the full raw line, so cross-recipe ingredient matching (e.g.
  "find all recipes with chicken") won't work well until that parsing is added.
- No dedup/versioning if a recipe's ingredients change between scrapes — the
  ingredient list is only appended to, not diffed.
