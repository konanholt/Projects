"""
Collect all recipe URLs from sixsistersstuff.com's Yoast SEO sitemaps.

robots.txt publishes https://www.sixsistersstuff.com/sitemap_index.xml
specifically for crawlers to discover content -- this just walks it.

Usage:
    python collect_recipe_urls.py urls.txt
"""
import sys
import time
import urllib.request
from xml.etree import ElementTree

USER_AGENT = "Mozilla/5.0 (compatible; recipe-research/1.0)"
SITEMAP_INDEX = "https://www.sixsistersstuff.com/sitemap_index.xml"
NAMESPACE = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}


def fetch_xml(url: str) -> ElementTree.Element:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return ElementTree.fromstring(resp.read())


def get_recipe_sitemaps() -> list[str]:
    root = fetch_xml(SITEMAP_INDEX)
    return [
        loc.text
        for loc in root.findall("sm:sitemap/sm:loc", NAMESPACE)
        if "recipe-sitemap" in loc.text
    ]


def get_recipe_urls(sitemap_url: str) -> list[str]:
    root = fetch_xml(sitemap_url)
    urls = [loc.text for loc in root.findall("sm:url/sm:loc", NAMESPACE)]
    # Drop the /recipe/ landing page itself, keep only /recipe/<slug>/ pages.
    return [u for u in urls if u.rstrip("/").count("/") > 3]


def main(out_path: str, delay_seconds: float = 1.0):
    sitemaps = get_recipe_sitemaps()
    print(f"Found {len(sitemaps)} recipe sitemap(s)")

    all_urls: list[str] = []
    for i, sm in enumerate(sitemaps, 1):
        urls = get_recipe_urls(sm)
        print(f"[{i}/{len(sitemaps)}] {sm}: {len(urls)} recipes")
        all_urls.extend(urls)
        if i < len(sitemaps):
            time.sleep(delay_seconds)

    with open(out_path, "w") as f:
        f.write("\n".join(all_urls) + "\n")
    print(f"Saved {len(all_urls)} recipe URLs to {out_path}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1])
