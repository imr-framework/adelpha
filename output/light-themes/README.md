# Adelpha — The Light Collection

Five light theme design concepts, presented in a responsive, interactive engineering workspace. Open `index.html` directly in a browser, or serve this folder. All assets are local; no installation, external service, or build is needed.

| Theme | Direction | Accent | Panel radius |
| --- | --- | --- | --- |
| Porcelain | Cloud white, graphite, measured cobalt. Recommended signature. | #315CCC | 12px |
| Limestone | Warm mineral surfaces, bronze, architectural edges. | #855E34 | 6px |
| Glacier | Airy blue-white, petrol, precise technical structure. | #086B8A | 8px |
| Celadon | Botanical neutrals, forest green, generous rounding. | #366B50 | 16px |
| Iris | Pearl-lilac surfaces, amethyst, soft depth. | #7552AB | 14px |

## Design system

Geist for interface text; Geist Mono for data and hexadecimal values. The hierarchy uses understated headings, tabular numerical figures, thin structural dividers, tinted selections, and opaque accent buttons. Large surfaces stay light. Accent colors identify actions and selection; success, warning, and error retain consistent semantic colors across the collection. Status is also communicated with text.

`themes.css` is a reusable token source, scoped by `data-adelpha-theme`. Each theme defines canvas, surface, secondary surface, primary and secondary text, structure, accent, selection tint, 3D stage, model material, radius, and shadow. Shared tokens cover semantic statuses, focus, type, and foreground on accents.

```html
<link rel="stylesheet" href="themes.css">
<div data-adelpha-theme="porcelain">...</div>
```

These are design previews, not changes to the running Adelpha interface. Production adoption requires mapping existing `--bg`, `--panel`, `--text`, `--muted`, and `--m4-*` variables to these tokens and replacing hardcoded dark colors. Three.js materials, canvas plots, terminal themes, and scientific image display need explicit review; avoid applying global color inversion. Preserve medical image pixel values and quantitative colormaps.

## Preview behavior and validation

The five theme buttons update the entire workspace, sample controls, palette, and shareable URL fragment. Text input, auto-save checkbox, simulation-preview feedback, and reset are interactive. Workspace navigation and technical actions are visual specimens. All study values and geometry are illustrative.

Reviewed at desktop and 390px widths; the narrow layout stacks panels and removes secondary table columns. Verified all five selections and sample button feedback. Primary text on surfaces, secondary text on canvas, accent on surfaces, and white button text on accents meet at least 4.5:1 contrast in every palette. This is token-pair validation, not a full production accessibility audit. JavaScript syntax checked with Node.

Screenshots: `01-porcelain.jpg` through `05-iris.jpg`. Fonts and their license are included in `fonts/`.
