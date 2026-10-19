---
title: Download Adelpha MRI
description: Download the Adelpha MRI desktop installer for macOS, Windows, or Linux from GitHub Releases.
icon: lucide/download
hide:
  - toc
---

<div class="adelpha-dl">
  <header class="adelpha-dl__hero">
    <h1 id="download-adelpha">Download Adelpha</h1>
    <p class="adelpha-dl__lede">The intelligent digital-twin platform for low-field MRI. For macOS, Windows, and Linux.</p>
    <p class="adelpha-dl__meta">
      <span>Version <span data-adelpha-version>0.5.7</span></span>
      <span data-adelpha-released>Released October 19, 2026</span>
      <span>Open source</span>
    </p>
  </header>

  <article class="adelpha-dl-card adelpha-dl-card--featured" data-adelpha-featured data-adelpha-kind="macos-arm64">
    <div class="adelpha-dl-card__icon" aria-hidden="true" data-adelpha-icon>
      <svg viewBox="0 0 24 24"><rect width="18" height="16" x="3" y="4" rx="2.5"/><path d="M3 8.5h18"/><circle cx="7" cy="6.25" r="0.7"/><circle cx="9.5" cy="6.25" r="0.7"/><circle cx="12" cy="6.25" r="0.7"/></svg>
    </div>
    <div class="adelpha-dl-card__body">
      <p class="adelpha-dl-card__rec" data-adelpha-rec hidden></p>
      <h2 data-adelpha-title>Adelpha for macOS</h2>
      <p class="adelpha-dl-card__sub" data-adelpha-sub>Optimized for Apple Silicon</p>
      <a class="adelpha-dl-card__cta" data-adelpha-href rel="noopener noreferrer" href="https://github.com/imr-framework/adelpha/releases/download/v0.5.7/Adelpha_0.5.7_aarch64.dmg">Download for Apple Silicon</a>
      <span class="adelpha-dl-card__wait" data-adelpha-wait hidden>In packaging</span>
      <p class="adelpha-dl-card__fine" data-adelpha-fine>Version 0.5.7 · 467 MB</p>
      <p class="adelpha-dl-card__alt" data-adelpha-alt hidden></p>
    </div>
  </article>

  <ul class="adelpha-dl__trust">
    <li>Open source</li>
    <li>Bundled runtime</li>
    <li>No Python, Node, or Rust to install</li>
  </ul>

  <section class="adelpha-dl__others" data-adelpha-others>
    <h2>Other platforms</h2>
    <div class="adelpha-dl__others-grid" data-adelpha-others-grid>
      <a class="adelpha-dl-mini" rel="noopener noreferrer" href="https://github.com/imr-framework/adelpha/releases/download/v0.5.7/Adelpha_0.5.7_x86_64.dmg">
        <span class="adelpha-dl-mini__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect width="18" height="16" x="3" y="4" rx="2.5"/><path d="M3 8.5h18"/><circle cx="7" cy="6.25" r="0.7"/><circle cx="9.5" cy="6.25" r="0.7"/><circle cx="12" cy="6.25" r="0.7"/></svg></span>
        <span class="adelpha-dl-mini__text"><strong>macOS Intel</strong><span>Intel Macs · macOS 12+</span></span>
        <em>Download DMG</em>
      </a>
      <a class="adelpha-dl-mini" rel="noopener noreferrer" href="https://github.com/imr-framework/adelpha/releases/download/v0.5.7/Adelpha_0.5.7_x64-setup.exe">
        <span class="adelpha-dl-mini__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect width="8" height="8" x="3" y="3" rx="1"/><rect width="8" height="8" x="13" y="3" rx="1"/><rect width="8" height="8" x="3" y="13" rx="1"/><rect width="8" height="8" x="13" y="13" rx="1"/></svg></span>
        <span class="adelpha-dl-mini__text"><strong>Windows</strong><span>Windows 10/11 · x64</span></span>
        <em>Download EXE</em>
      </a>
    </div>
  </section>

  <section class="adelpha-dl__soon" data-adelpha-soon>
    <h2>Coming soon</h2>
    <ul>
      <li data-adelpha-soon="linux-deb"><span>Linux</span><span>Ubuntu 22.04+ · x64 .deb</span></li>
    </ul>
  </section>

  <section class="adelpha-dl-verify" data-adelpha-verify>
    <h2>Verify download</h2>
    <ul>
      <li class="adelpha-dl-verify__row">
        <span>Filename</span>
        <code data-adelpha-file>Adelpha_0.5.7_aarch64.dmg</code>
        <button type="button" class="adelpha-copy" data-adelpha-copy="file">Copy</button>
      </li>
      <li class="adelpha-dl-verify__row">
        <span>SHA-256</span>
        <code data-adelpha-sha title="e85a3a5069b2611a4509613e2e81e38c83649cea78936a0f93bec70e652bfddc">e85a3a5069b2611a…</code>
        <button type="button" class="adelpha-copy" data-adelpha-copy="sha">Copy</button>
      </li>
    </ul>
    <p class="adelpha-dl-releases">Previous releases stay on <a href="https://github.com/imr-framework/adelpha/releases">GitHub Releases</a>. Source: <a href="https://github.com/imr-framework/adelpha">imr-framework/adelpha</a>.</p>
  </section>
</div>

## Before installation

[Getting started](index.md) · [System requirements](#system-requirements) · [Release notes](https://github.com/imr-framework/adelpha/releases/tag/v0.5.7)

Current public installers are **unsigned**. A macOS build will need **Right-click → Open** the first time. If that still fails, [clear the quarantine flag](#if-macos-blocks-the-dmg). Windows may show a SmartScreen warning. See [Signing](../packaging/signing.md).

## System requirements

| Platform | Requirement |
| --- | --- |
| macOS | macOS 12 or later. Separate Apple Silicon and Intel DMGs. |
| Linux | 64-bit `.deb` for Ubuntu 22.04-class distributions. Not published in v0.5.7. |
| Windows | Windows 10 or 11, 64-bit NSIS installer. |
| Packaged app | Python, Node, and Rust are not required. |

## After you download

1. Open the `.dmg` or run the `.exe`.
2. Launch **Adelpha**.
3. Wait until the terminal live dot is green.

## If macOS blocks the DMG

Public Mac builds are unsigned, so Gatekeeper may refuse the download. First try **Right-click → Open** on the `.dmg` or on **Adelpha** in Applications.

If macOS still says the app is damaged or cannot be opened, clear the quarantine flag in Terminal:

```bash
xattr -cr ~/Downloads/Adelpha_*.dmg
```

After you copy Adelpha into Applications:

```bash
xattr -cr /Applications/Adelpha.app
```

`-c` clears extended attributes; `-r` does it recursively. Do not disable Gatekeeper with `spctl`.
