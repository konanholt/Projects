"""
Personal-use recipe collector for sixsistersstuff.com.

Reads schema.org/Recipe JSON-LD (emitted by their WP Recipe Maker plugin)
via recipe-scrapers' wild mode. Rate-limited to avoid hammering the site.

Usage:
    python scrape_six_sisters.py urls.txt out.json
    (urls.txt = one recipe URL per line)
"""
import json
import sys
import time

from recipe_scrapers import scrape_html
from recipe_scrapers._exceptions import RecipeScrapersExceptions


def scrape_recipe(url: str) -> dict:
    scraper = scrape_html(None, org_url=url, online=True, wild_mode=True)
    return {
        "url": url,
        "title": scraper.title(),
        "total_time_minutes": scraper.total_time(),
        "yields": scraper.yields(),
        "ingredients": scraper.ingredients(),
        "instructions": scraper.instructions(),
        "nutrients": scraper.nutrients(),
        "image": scraper.image(),
    }


def main(urls_path: str, out_path: str, delay_seconds: float = 2.0):
    with open(urls_path) as f:
        urls = [line.strip() for line in f if line.strip()]

    recipes = []
    for i, url in enumerate(urls, 1):
        try:
            recipes.append(scrape_recipe(url))
            print(f"[{i}/{len(urls)}] ok: {url}")
        except RecipeScrapersExceptions as e:
            print(f"[{i}/{len(urls)}] skip ({e}): {url}")
        if i < len(urls):
            time.sleep(delay_seconds)

    with open(out_path, "w") as f:
        json.dump(recipes, f, indent=2)
    print(f"Saved {len(recipes)} recipes to {out_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
