#!/usr/bin/env python3
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

SOURCE = "https://www.unipop.lu/"
OUT = Path(__file__).resolve().parents[1] / "actualites.json"

def clean(s):
    return re.sub(r"\s+", " ", (s or "")).strip()

def attr_image(node):
    if not node:
        return ""
    for key in ("src", "data-src", "data-lazy-src", "data-original"):
        value = node.get(key)
        if value and not str(value).startswith("data:"):
            return urljoin(SOURCE, value)
    srcset = node.get("srcset") or node.get("data-srcset")
    if srcset:
        candidate = srcset.split(",")[-1].strip().split(" ")[0]
        if candidate:
            return urljoin(SOURCE, candidate)
    return ""

def parse_posts(html):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")

    selectors = [
        'div#actualites.post',
        'div#actualites.section-content-post',
        '[id="actualites"][class*="post"]',
        'section#actualites .post',
    ]
    nodes = []
    seen = set()
    for selector in selectors:
        for n in soup.select(selector):
            marker = id(n)
            if marker not in seen:
                seen.add(marker)
                nodes.append(n)

    posts = []
    fingerprints = set()
    for node in nodes:
        body = node.select_one(".post-content-body") or node
        body_text = clean(body.get_text(" ", strip=True))
        if not body_text:
            continue

        # Prefer the Facebook/original-post link already published by UniPop.
        links = node.select("a[href]")
        post_url = ""
        for a in links:
            href = a.get("href", "")
            if "facebook.com" in href.lower():
                post_url = urljoin(SOURCE, href)
                break
        if not post_url:
            for a in links:
                href = a.get("href", "")
                if href and not href.startswith("#"):
                    post_url = urljoin(SOURCE, href)
                    break
        if not post_url:
            post_url = SOURCE

        date_node = node.select_one(".post-header-title-date span, .post-header-title-date")
        relative_date = clean(date_node.get_text(" ", strip=True)) if date_node else ""

        # Only use media from the post body so the small UniPop avatar/logo is not selected.
        image = ""
        for img in body.select("img"):
            image = attr_image(img)
            if image:
                break
        if not image:
            for media in body.select("[style*='background-image']"):
                style = media.get("style", "")
                m = re.search(r'background-image\s*:\s*url\([\'"]?([^\'")]+)', style, re.I)
                if m:
                    image = urljoin(SOURCE, m.group(1))
                    break

        # Create a compact card title from the post itself; keep the original body as excerpt.
        title_text = body_text
        title_text = re.sub(r"^(?:🇫🇷|🇬🇧|🇱🇺|📷|📸|☀️|🌞|#\w+\s*)+", "", title_text).strip()
        first_sentence = re.split(r"(?<=[.!?])\s+", title_text, maxsplit=1)[0]
        title = first_sentence[:115].strip(" -–—")
        if len(first_sentence) > 115:
            title = title.rsplit(" ", 1)[0] + "…"
        if not title:
            title = "Actualité UniPop"

        excerpt = body_text[:320]
        if len(body_text) > 320:
            excerpt = excerpt.rsplit(" ", 1)[0] + "…"

        fp = (title, excerpt, image, post_url)
        if fp in fingerprints:
            continue
        fingerprints.add(fp)
        posts.append({
            "title": title,
            "excerpt": excerpt,
            "image": image,
            "url": post_url,
            "relativeDate": relative_date,
        })

    return posts[:8]

def fetch_requests():
    import requests
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/140 Safari/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.7",
    }
    r = requests.get(SOURCE, headers=headers, timeout=35)
    if r.status_code != 200:
        raise RuntimeError(f"HTTP {r.status_code}")
    return r.text

def fetch_browser():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            viewport={"width": 1440, "height": 1600},
            locale="fr-FR",
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/140 Safari/537.36",
        )
        page.goto(SOURCE, wait_until="domcontentloaded", timeout=90000)
        try:
            page.wait_for_selector('[id="actualites"]', timeout=30000)
        except Exception:
            pass
        page.wait_for_timeout(4500)
        html = page.content()
        browser.close()
        return html

def load_old():
    if not OUT.exists():
        return {"updatedAt": None, "source": SOURCE, "posts": []}
    try:
        return json.loads(OUT.read_text(encoding="utf-8"))
    except Exception:
        return {"updatedAt": None, "source": SOURCE, "posts": []}

def comparable(posts):
    # Relative "il y a X heures" changes even when the actual post did not.
    # Ignore that label to avoid one Git commit every hour.
    return [
        {k: v for k, v in p.items() if k != "relativeDate"}
        for p in posts
    ]

def main():
    posts = []
    errors = []

    try:
        posts = parse_posts(fetch_requests())
    except Exception as e:
        errors.append(f"requests: {e}")

    if not posts:
        try:
            posts = parse_posts(fetch_browser())
        except Exception as e:
            errors.append(f"browser: {e}")

    old = load_old()
    if not posts:
        print("No news extracted; keeping the last known actualites.json.", file=sys.stderr)
        for e in errors:
            print(e, file=sys.stderr)
        return 0 if old.get("posts") else 1

    if comparable(posts) == comparable(old.get("posts", [])):
        print("Actualités unchanged.")
        return 0

    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": SOURCE,
        "posts": posts,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {OUT.name}: {len(posts)} posts")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
