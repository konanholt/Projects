-- Maps each raw ingredient line to a canonical "essence" (e.g. every
-- variant of "1 lb lean ground beef (or turkey)" -> "ground beef"), so
-- cross-recipe ingredient queries work despite unparsed raw ingredient text.
--
-- One row per classified ingredient -- not every ingredient has an essence
-- yet, since this is populated incrementally, one essence cluster at a time.
CREATE TABLE IF NOT EXISTS ingredient_essential (
  id INTEGER PRIMARY KEY REFERENCES ingredients(id),
  name TEXT NOT NULL,
  ingredient_essence TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ingredient_essential_essence ON ingredient_essential(ingredient_essence);
