---
icon: lucide/book-open
---

# Docs site (Zensical)

Project documentation is built with [Zensical](https://zensical.org/docs/), a static site generator from the Material for MkDocs team.

## Commands

```bash
uv sync --all-groups
make docs        # zensical build --strict
make docs-serve  # live preview
```

Configuration file: `zensical.toml` at the repository root. Markdown sources live in `docs/`.

Source code: [github.com/LeoMcBills/dtam](https://github.com/LeoMcBills/dtam/tree/main)

The site header links to the repository (stars / forks when online). Each page also has **View source** and **Edit this page** actions that open the matching file on `main`.

## Build outputs

| Path | Purpose |
| --- | --- |
| `site/` | Built HTML (gitignored) |
| `.zensical/` | Local cache (gitignored) |

## Authoring notes

- Prefer **accuracy over aspirational tone**. If a package is empty, say so ([Status](../start/status.md)).
- Use admonitions for defaults that affect safety.
- Mermaid diagrams are enabled via `pymdownx.superfences` custom fences.
- Navigation is explicit in `zensical.toml` (`nav`).
- Top-level nav items are **header tabs**; nested pages appear in the left sidebar.
- Put a section's `index.md` first in that nav group so `navigation.indexes` attaches an overview page to the section.

## Math

Pages that need equations use MathJax via Arithmatex (`pymdownx.arithmatex`
with `generic = true`). The runtime is loaded from
`docs/javascripts/mathjax.js` plus the MathJax CDN (see `extra_javascript` in
`zensical.toml`). Use inline `\( ... \)` and display `\[ ... \]` delimiters.
