"""
Convert scraped recipe JSON (from scrape_six_sisters.py) into a single
idempotent SQL file, ready to apply against D1:

    wrangler d1 execute <db-name> --remote --file=load.sql

Usage:
    python build_load_sql.py recipes.json load.sql
"""
import json
import sys


def sql_str(value) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def build_sql(recipes: list[dict]) -> str:
    lines = ["BEGIN TRANSACTION;"]

    for recipe in recipes:
        lines.append(
            "INSERT INTO recipes (url, title, total_time_minutes, yields, image_url) "
            f"VALUES ({sql_str(recipe['url'])}, {sql_str(recipe['title'])}, "
            f"{recipe['total_time_minutes'] if recipe['total_time_minutes'] is not None else 'NULL'}, "
            f"{sql_str(recipe['yields'])}, {sql_str(recipe.get('image'))}) "
            "ON CONFLICT(url) DO UPDATE SET title=excluded.title, "
            "total_time_minutes=excluded.total_time_minutes, yields=excluded.yields, "
            "image_url=excluded.image_url;"
        )

        for i, ingredient in enumerate(recipe["ingredients"]):
            lines.append(f"INSERT OR IGNORE INTO ingredients (name) VALUES ({sql_str(ingredient)});")
            lines.append(
                "INSERT INTO recipe_ingredients (recipe_id, ingredient_id, raw_text, sort_order) "
                f"SELECT (SELECT id FROM recipes WHERE url={sql_str(recipe['url'])}), "
                f"(SELECT id FROM ingredients WHERE name={sql_str(ingredient)}), "
                f"{sql_str(ingredient)}, {i} "
                "WHERE NOT EXISTS ("
                "SELECT 1 FROM recipe_ingredients ri "
                f"WHERE ri.recipe_id = (SELECT id FROM recipes WHERE url={sql_str(recipe['url'])}) "
                f"AND ri.sort_order = {i});"
            )

        instructions = recipe["instructions"].split("\n") if recipe.get("instructions") else []
        for i, step in enumerate(s for s in instructions if s.strip()):
            lines.append(
                "INSERT INTO instructions (recipe_id, step_number, text) "
                f"SELECT (SELECT id FROM recipes WHERE url={sql_str(recipe['url'])}), {i}, {sql_str(step.strip())} "
                "WHERE NOT EXISTS ("
                "SELECT 1 FROM instructions ins "
                f"WHERE ins.recipe_id = (SELECT id FROM recipes WHERE url={sql_str(recipe['url'])}) "
                f"AND ins.step_number = {i});"
            )

        nutrients = recipe.get("nutrients") or {}
        if nutrients:
            cols = [
                "calories", "carbohydrates", "protein", "fat", "saturated_fat",
                "trans_fat", "cholesterol", "sodium", "fiber", "sugar",
                "unsaturated_fat", "serving_size",
            ]
            field_map = {
                "calories": "calories", "carbohydrates": "carbohydrateContent",
                "protein": "proteinContent", "fat": "fatContent",
                "saturated_fat": "saturatedFatContent", "trans_fat": "transFatContent",
                "cholesterol": "cholesterolContent", "sodium": "sodiumContent",
                "fiber": "fiberContent", "sugar": "sugarContent",
                "unsaturated_fat": "unsaturatedFatContent", "serving_size": "servingSize",
            }
            values = ", ".join(sql_str(nutrients.get(field_map[c])) for c in cols)
            updates = ", ".join(f"{c}=excluded.{c}" for c in cols)
            lines.append(
                f"INSERT INTO nutrients (recipe_id, {', '.join(cols)}) "
                f"SELECT (SELECT id FROM recipes WHERE url={sql_str(recipe['url'])}), {values} "
                f"ON CONFLICT(recipe_id) DO UPDATE SET {updates};"
            )

    lines.append("COMMIT;")
    return "\n".join(lines)


def main(in_path: str, out_path: str):
    with open(in_path) as f:
        recipes = json.load(f)

    with open(out_path, "w") as f:
        f.write(build_sql(recipes))

    print(f"Wrote SQL for {len(recipes)} recipes to {out_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
