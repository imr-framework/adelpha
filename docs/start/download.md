---
icon: lucide/download
hide:
  - toc
---

<div class="adelpha-dl">
  <header class="adelpha-dl__hero">
    <h1 id="download-adelpha">Download Adelpha</h1>
    <p class="adelpha-dl__lede">The intelligent digital-twin platform for low-field MRI.<br>For macOS, Windows, and Linux.</p>
    <p class="adelpha-dl__meta">
      <span>Version <span data-adelpha-version>0.5.0</span></span>
      <span data-adelpha-released>Released August 29, 2026</span>
      <span>Open source</span>
    </p>
  </header>

  <article class="adelpha-dl-card adelpha-dl-card--featured" data-adelpha-featured data-adelpha-kind="linux-deb">
    <div class="adelpha-dl-card__icon" aria-hidden="true" data-adelpha-icon>
      <svg viewBox="0 0 24 24"><path d="M16.5 9.4 7.5 4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.29 7 12 12l8.71-5"/><path d="M12 22V12"/></svg>
    </div>
    <div class="adelpha-dl-card__body">
      <p class="adelpha-dl-card__rec" data-adelpha-rec hidden></p>
      <h2 data-adelpha-title>Adelpha for Linux</h2>
      <p class="adelpha-dl-card__sub" data-adelpha-sub>Ubuntu 22.04 or later</p>
      <a class="adelpha-dl-card__cta" data-adelpha-href rel="noopener noreferrer" href="https://github.com/imr-framework/adelpha/releases/download/v0.5.0/Adelpha_0.5.0_amd64.deb">Download for Linux</a>
      <span class="adelpha-dl-card__wait" data-adelpha-wait hidden>In packaging</span>
      <p class="adelpha-dl-card__fine" data-adelpha-fine>Version 0.5.0 · 156 MB</p>
      <p class="adelpha-dl-card__alt" data-adelpha-alt hidden></p>
    </div>
  </article>

  <ul class="adelpha-dl__trust">
    <li>Open source</li>
    <li>Bundled runtime</li>
    <li>No Python, Node, or Rust to install</li>
  </ul>

  <section class="adelpha-dl__others" data-adelpha-others hidden>
    <h2>Other platforms</h2>
    <div class="adelpha-dl__others-grid" data-adelpha-others-grid></div>
  </section>

  <section class="adelpha-dl__soon" data-adelpha-soon>
    <h2>Coming soon</h2>
    <ul>
      <li data-adelpha-soon="macos-arm64"><span>macOS Apple Silicon</span><span>In packaging</span></li>
      <li data-adelpha-soon="macos-x64"><span>macOS Intel</span><span>Planned</span></li>
      <li data-adelpha-soon="windows-x64"><span>Windows</span><span>In testing</span></li>
    </ul>
  </section>

  <section class="adelpha-dl-verify" data-adelpha-verify>
    <h2>Verify download</h2>
    <ul>
      <li class="adelpha-dl-verify__row">
        <span>Filename</span>
        <code data-adelpha-file>Adelpha_0.5.0_amd64.deb</code>
        <button type="button" class="adelpha-copy" data-adelpha-copy="file">Copy</button>
      </li>
      <li class="adelpha-dl-verify__row">
        <span>SHA-256</span>
        <code data-adelpha-sha title="e17f61ed4abfa15e5d247183e62bc3b475d7022cc4f0c525232d0c0b59163170">e17f61ed4abfa15e…</code>
        <button type="button" class="adelpha-copy" data-adelpha-copy="sha">Copy</button>
      </li>
    </ul>
    <p class="adelpha-dl-releases">Previous releases stay on <a href="https://github.com/imr-framework/adelpha/releases">GitHub Releases</a>. Source: <a href="https://github.com/imr-framework/adelpha">imr-framework/adelpha</a>.</p>
  </section>
</div>

## Before installation

[Getting started](index.md) · [System requirements](#system-requirements) · [Release notes](https://github.com/imr-framework/adelpha/releases/tag/v0.5.0)

Current public installers are **unsigned**. A macOS build will need **Right-click → Open** the first time. See [Signing](../packaging/signing.md).

## System requirements

| Platform | Requirement |
| --- | --- |
| macOS | macOS 12 or later. Separate Apple Silicon and Intel installers. |
| Linux | 64-bit `.deb` for Ubuntu 22.04-class distributions. |
| Windows | Windows 10 or 11, 64-bit. Not in this release. |
| Packaged app | Python, Node, and Rust are not required. |

## After you download

1. Open the `.dmg` or install the `.deb`.
2. Launch **Adelpha**.
3. Wait until the top bar reads **All systems operational**.
