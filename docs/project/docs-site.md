---
title: Adelpha MRI documentation site
description: Build, preview, and publish the Adelpha MRI documentation site with Zensical, including sitemap and Search Console notes for maintainers.
icon: lucide/book-open
robots: noindex, nofollow
search:
  exclude: true
---

# Docs site (Zensical)

Documentation is built with [Zensical](https://zensical.org/docs/).

## Commands

```bash
uv sync --group docs
make docs        # zensical build --strict
make docs-serve  # live preview (default http://127.0.0.1:8000)
```

| Path | Role |
| --- | --- |
| `zensical.toml` | Site config and navigation |
| `docs/` | Markdown sources |
| `docs/assets/adelpha-logo.svg` | Header logo (wide butterfly mark) |
| `docs/assets/adelpha-icon.svg` | Browser tab icon (circular Adelpha mark) |
| `docs/assets/favicon.png` | PNG fallback of the same circular mark |
| `site/` | Build output (gitignored) |
| `.zensical/` | Local cache (gitignored) |

## Authoring

- Keep runbooks accurate: if Grafana owns port 3000, say so.
- Write for operators first, then developers. Prefer short steps and tables.
- Prefer admonitions for operator pitfalls (CORS, predicted vs measured, camera permissions).
- Mermaid is enabled via `pymdownx.superfences`.
- Left-sidebar sections are explicit in `zensical.toml` (`nav`). There is no top tab bar. Workshop mentee pages live under **Learn**.
- Math uses Arithmatex + MathJax (`docs/javascripts/mathjax.js`).
- The [Download](../start/download.md) page is the product download UI. It recommends a platform in the browser and links to GitHub Release assets. Binaries are not stored in `docs/`.

## GitHub Pages

Published at **[imr-framework.github.io/adelpha](https://imr-framework.github.io/adelpha/)** on pushes to `main`.

### One-time repo setup

1. Open **Settings → Pages** on GitHub.
2. Under **Build and deployment**, set **Source** to **GitHub Actions** (not “Deploy from a branch”).
3. Merge or push `.github/workflows/docs.yml` to `main`.

The workflow installs Zensical, runs `zensical build --strict --clean`, and uploads the `site/` folder via the official Pages deploy action.

### Local vs production URL

`zensical.toml` sets `site_url` to the GitHub Pages URL so instant navigation and sitemap links resolve correctly in production. Local preview still works with `make docs-serve` (default `http://127.0.0.1:8000/`).

## Sitemap and search engines

Zensical emits `sitemap.xml` at the site root (`https://imr-framework.github.io/adelpha/sitemap.xml`). Only pages in `nav` are treated as published for discovery. Add operator-facing pages to `zensical.toml` instead of leaving them as unlinked Markdown.

**Robots:** crawlers honor the **origin** file `https://imr-framework.github.io/robots.txt`, not `/adelpha/robots.txt`. If you control the `imr-framework.github.io` repository, add:

```text
User-agent: *
Allow: /

Sitemap: https://imr-framework.github.io/adelpha/sitemap.xml
```

If changing the parent site is inconvenient, submit the sitemap in [Google Search Console](https://search.google.com/search-console). Do not rely on a project-level robots file.

**Google verification:** set `google_site_verification` in `[project.extra]` in `zensical.toml` to the Search Console HTML-tag `content` value. Leave it empty until you have a real token. The theme override (`overrides/main.html`) emits the meta tag only when that string is non-empty.

**noindex:** purely internal pages set `robots: noindex, nofollow` in front matter (this page). Public packaging pages stay in `nav` and are indexed.

### Manual deploy check

```bash
uv sync --group docs
make docs
# inspect ./site/ before pushing
```
