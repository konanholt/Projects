// Convert scraped recipe JSON (from scrape-six-sisters.mjs) into a single
// idempotent SQL file, ready to apply against D1:
//
//     wrangler d1 execute <db-name> --remote --file=load.sql
//
// Usage: node build-load-sql.mjs recipes.json load.sql

import { readFileSync, writeFileSync } from "node:fs";

function sqlStr(value) {
  if (value === null || value === undefined) return "NULL";
  return "'" + String(value).replace(/'/g, "''") + "'";
}

const NUTRIENT_COLUMNS = {
  calories: "calories",
  carbohydrates: "carbohydrateContent",
  protein: "proteinContent",
  fat: "fatContent",
  saturated_fat: "saturatedFatContent",
  trans_fat: "transFatContent",
  cholesterol: "cholesterolContent",
  sodium: "sodiumContent",
  fiber: "fiberContent",
  sugar: "sugarContent",
  unsaturated_fat: "unsaturatedFatContent",
  serving_size: "servingSize",
};

function buildSql(recipes) {
  // D1 (Durable Objects storage) rejects explicit BEGIN/COMMIT in SQL --
  // each statement below is already atomic and idempotent on its own.
  const lines = [];

  for (const recipe of recipes) {
    const urlLit = sqlStr(recipe.url);

    lines.push(
      `INSERT INTO recipes (url, title, total_time_minutes, yields, image_url) ` +
        `VALUES (${urlLit}, ${sqlStr(recipe.title)}, ` +
        `${recipe.total_time_minutes ?? "NULL"}, ${sqlStr(recipe.yields)}, ${sqlStr(recipe.image)}) ` +
        `ON CONFLICT(url) DO UPDATE SET title=excluded.title, ` +
        `total_time_minutes=excluded.total_time_minutes, yields=excluded.yields, ` +
        `image_url=excluded.image_url;`
    );

    (recipe.ingredients || []).forEach((ingredient, i) => {
      const nameLit = sqlStr(ingredient);
      lines.push(`INSERT OR IGNORE INTO ingredients (name) VALUES (${nameLit});`);
      lines.push(
        `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, raw_text, sort_order) ` +
          `SELECT (SELECT id FROM recipes WHERE url=${urlLit}), ` +
          `(SELECT id FROM ingredients WHERE name=${nameLit}), ${nameLit}, ${i} ` +
          `WHERE NOT EXISTS (SELECT 1 FROM recipe_ingredients ri ` +
          `WHERE ri.recipe_id = (SELECT id FROM recipes WHERE url=${urlLit}) AND ri.sort_order = ${i});`
      );
    });

    const steps = (recipe.instructions || "").split("\n").filter((s) => s.trim());
    steps.forEach((step, i) => {
      lines.push(
        `INSERT INTO instructions (recipe_id, step_number, text) ` +
          `SELECT (SELECT id FROM recipes WHERE url=${urlLit}), ${i}, ${sqlStr(step.trim())} ` +
          `WHERE NOT EXISTS (SELECT 1 FROM instructions ins ` +
          `WHERE ins.recipe_id = (SELECT id FROM recipes WHERE url=${urlLit}) AND ins.step_number = ${i});`
      );
    });

    const nutrients = recipe.nutrients || {};
    if (Object.keys(nutrients).length > 0) {
      const cols = Object.keys(NUTRIENT_COLUMNS);
      const values = cols.map((c) => sqlStr(nutrients[NUTRIENT_COLUMNS[c]])).join(", ");
      const updates = cols.map((c) => `${c}=excluded.${c}`).join(", ");
      lines.push(
        `INSERT INTO nutrients (recipe_id, ${cols.join(", ")}) ` +
          `SELECT (SELECT id FROM recipes WHERE url=${urlLit}), ${values} ` +
          `ON CONFLICT(recipe_id) DO UPDATE SET ${updates};`
      );
    }
  }

  return lines.join("\n");
}

function main(inPath, outPath) {
  const recipes = JSON.parse(readFileSync(inPath, "utf-8"));
  writeFileSync(outPath, buildSql(recipes));
  console.log(`Wrote SQL for ${recipes.length} recipes to ${outPath}`);
}

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error("Usage: node build-load-sql.mjs recipes.json load.sql");
  process.exit(1);
}
main(inPath, outPath);
