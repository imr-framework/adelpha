---
icon: lucide/book-open
---

# Docs site (Zensical)

Documentation is built with [Zensical](https://zensical.org/docs/), the same toolchain used by DTAM.

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
| `site/` | Build output (gitignored) |
| `.zensical/` | Local cache (gitignored) |

## Authoring

- Keep runbooks accurate: if Grafana owns port 3000, say so.
- Prefer admonitions for operator pitfalls (CORS, predicted vs measured).
- Mermaid is enabled via `pymdownx.superfences`.
- Navigation tabs are explicit in `zensical.toml` (`nav`).
- Math uses Arithmatex + MathJax (`docs/javascripts/mathjax.js`).
