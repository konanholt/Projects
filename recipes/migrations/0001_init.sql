-- Normalized (3NF) schema for recipe storage.
-- SQLite dialect, compatible with Cloudflare D1.

CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  total_time_minutes INTEGER,
  yields TEXT,
  image_url TEXT,
  source TEXT NOT NULL DEFAULT 'sixsistersstuff.com',
  scraped_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
  raw_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_ingredient ON recipe_ingredients(ingredient_id);

CREATE TABLE IF NOT EXISTS instructions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_instructions_recipe ON instructions(recipe_id);

-- One row per recipe. Values kept as scraped (e.g. "273 kcal", "35 g")
-- rather than split into separate numeric/unit columns.
CREATE TABLE IF NOT EXISTS nutrients (
  recipe_id INTEGER PRIMARY KEY REFERENCES recipes(id) ON DELETE CASCADE,
  calories TEXT,
  carbohydrates TEXT,
  protein TEXT,
  fat TEXT,
  saturated_fat TEXT,
  trans_fat TEXT,
  cholesterol TEXT,
  sodium TEXT,
  fiber TEXT,
  sugar TEXT,
  unsaturated_fat TEXT,
  serving_size TEXT
);
