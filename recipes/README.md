# Recipe Database

Personal recipe database sourced from sixsistersstuff.com (schema.org
`Recipe` JSON-LD embedded in each page by their WP Recipe Maker plugin —
the site publishes structured recipe data and doesn't block scraping in
`robots.txt`). Ingredient/blog text is copyrighted; this stores structured
recipe data for personal use, not a republished copy of their site.

All scripts are Node (`.mjs`), no dependencies — built-in `fetch`, reads
the JSON-LD directly.

## Schema

Normalized (3NF), SQLite dialect, compatible with Cloudflare D1. Applied
as sequential migrations in `migrations/`:

- `0001_init.sql`
  - `recipes` — one row per recipe
  - `ingredients` — distinct ingredient names as scraped, e.g.
    `"1 pound lean ground beef"` — **not** parsed into quantity/unit/item
    (see Limitations)
  - `recipe_ingredients` — join table, `raw_text` + `sort_order` per recipe
  - `instructions` — one row per step, ordered by `step_number`
  - `nutrients` — one row per recipe, values kept as scraped (e.g. `"273 kcal"`)
- `0002_ingredient_essential.sql`
  - `ingredient_essential` — maps a subset of `ingredients` rows to a
    canonical "essence" (e.g. every ground-beef variant → `"ground beef"`),
    so cross-recipe ingredient queries work despite the unparsed raw text
    above. Populated incrementally, one essence cluster at a time — see
    Classifying ingredients below.

## Workflow: scrape a site and load it into D1

1. Collect every recipe URL from the sitemap:
   ```
   node scripts/collect-recipe-urls.mjs urls.txt
   ```

2. Scrape each URL (rate-limited, 2s between requests) into a JSON array:
   ```
   node scripts/scrape-six-sisters.mjs urls.txt recipes.json
   ```

3. Convert the JSON into an idempotent SQL file (safe to re-run; upserts
   recipes/nutrients, skips existing ingredients/instructions):
   ```
   node scripts/build-load-sql.mjs recipes.json load.sql
   ```

4. Apply to D1 (palmjam.party) — create the database first if you haven't:
   ```
   wrangler d1 create recipes   # first time only
   wrangler d1 execute recipes --remote --file=migrations/0001_init.sql   # first time only
   wrangler d1 execute recipes --remote --file=migrations/0002_ingredient_essential.sql   # first time only
   wrangler d1 execute recipes --remote --file=load.sql
   ```

## Workflow: classify an ingredient essence

Adds/updates rows in `ingredient_essential` for one canonical ingredient
(e.g. "ground beef"), so recipes sharing that ingredient become queryable
despite inconsistent raw text.

1. Export the current distinct ingredient names from D1:
   ```
   wrangler d1 execute recipes --remote --command="SELECT DISTINCT name FROM ingredients ORDER BY name" --json > ingredient_names.json
   ```

2. Add a rule for the new essence to the `RULES` array in
   `scripts/classify-ingredient-essence.mjs` — each rule is an independent
   `{essence, include, exclude}` matcher tested against the ingredient
   line's text *before its first parenthesis*, so parenthetical
   alternates (`"... (or ground turkey)"`) don't cause misclassification.

3. Generate and apply the SQL:
   ```
   node scripts/classify-ingredient-essence.mjs ingredient_names.json essence.sql
   wrangler d1 execute recipes --remote --file=essence.sql
   ```

## Limitations

- `ingredient_essential` only covers ingredients that have been explicitly
  classified so far (currently just "ground beef") — most ingredients have
  no essence row yet.
- No dedup/versioning if a recipe's ingredients change between scrapes — the
  ingredient list is only appended to, not diffed.
