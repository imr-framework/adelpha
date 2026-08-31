---
icon: lucide/book-open
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
- Left-sidebar sections are explicit in `zensical.toml` (`nav`). There is no top tab bar.
- Math uses Arithmatex + MathJax (`docs/javascripts/mathjax.js`).

## GitHub Pages

Published at **[imr-framework.github.io/adelpha](https://imr-framework.github.io/adelpha/)** on pushes to `main`.

### One-time repo setup

1. Open **Settings → Pages** on GitHub.
2. Under **Build and deployment**, set **Source** to **GitHub Actions** (not “Deploy from a branch”).
3. Merge or push `.github/workflows/docs.yml` to `main`.

The workflow installs Zensical, runs `zensical build --strict --clean`, and uploads the `site/` folder via the official Pages deploy action.

### Local vs production URL

`zensical.toml` sets `site_url` to the GitHub Pages URL so instant navigation and sitemap links resolve correctly in production. Local preview still works with `make docs-serve` (default `http://127.0.0.1:8000/`).

### Manual deploy check

```bash
uv sync --group docs
make docs
# inspect ./site/ before pushing
```
