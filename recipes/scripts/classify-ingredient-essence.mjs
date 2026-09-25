// Classify raw ingredient names into an "essence" cluster and emit
// idempotent SQL to populate ingredient_essential.
//
// Input is the JSON `wrangler d1 execute ... --json` produces for:
//   SELECT DISTINCT name FROM ingredients ORDER BY name
//
// Usage: node classify-ingredient-essence.mjs ingredient_names.json essence.sql
//
// Each rule below matches against the "main clause" of a raw ingredient
// line -- everything before the first parenthesis -- since alternates
// ("or ground turkey") are almost always parenthesized, and matching only
// the main clause avoids misclassifying "ground turkey (or ground beef)"
// as ground beef.
//
// Add more essences by adding more rules; each is independent and only
// touches ingredients matching its own pattern.
const RULES = [
  {
    essence: "ground beef",
    include: (clause) => clause.includes("ground") && clause.includes("beef"),
    exclude: [
      "broth", "stock", "bouillon", "gravy", "consomme", "chuck", "stew",
      "sirloin", "round steak", "flank", "short rib", "brisket", "rump",
      "pot roast", "tenderloin", "bottom round", "top-round", "beefsteak",
      "hot dog", "jerky", "base", "roast", "deli",
    ],
  },
];

function mainClause(name) {
  return name.split("(")[0].toLowerCase();
}

function classify(name) {
  const clause = mainClause(name);
  for (const rule of RULES) {
    if (rule.include(clause) && !rule.exclude.some((x) => clause.includes(x))) {
      return rule.essence;
    }
  }
  return null;
}

function sqlStr(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

import { readFileSync, writeFileSync } from "node:fs";

function main(inPath, outPath) {
  const data = JSON.parse(readFileSync(inPath, "utf-8"));
  const names = data[0].results.map((r) => r.name);

  const lines = [];
  const counts = {};
  for (const name of names) {
    const essence = classify(name);
    if (!essence) continue;
    counts[essence] = (counts[essence] || 0) + 1;
    const nameLit = sqlStr(name);
    lines.push(
      `INSERT INTO ingredient_essential (id, name, ingredient_essence) ` +
        `SELECT id, name, ${sqlStr(essence)} FROM ingredients WHERE name = ${nameLit} ` +
        `ON CONFLICT(id) DO UPDATE SET ingredient_essence=excluded.ingredient_essence;`
    );
  }

  writeFileSync(outPath, lines.join("\n"));
  console.log(`Classified ${lines.length} of ${names.length} ingredient names:`);
  for (const [essence, n] of Object.entries(counts)) console.log(`  ${essence}: ${n}`);
  console.log(`Wrote SQL to ${outPath}`);
}

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error("Usage: node classify-ingredient-essence.mjs ingredient_names.json essence.sql");
  process.exit(1);
}
main(inPath, outPath);
