---
icon: lucide/download
---

# Download

Installers live on [GitHub Releases](https://github.com/imr-framework/adelpha/releases), not in this documentation repository. This page is the download interface. Version <span data-adelpha-version>0.5.0</span>.

<p>
  <a class="adelpha-download-cta adelpha-download-cta--quiet" href="https://github.com/imr-framework/adelpha/releases/latest">All GitHub Release assets</a>
</p>

!!! warning "Unsigned builds"
    CI publishes **unsigned** installers unless Apple Developer ID secrets are configured. On macOS, an unsigned DMG needs **Right-click → Open** the first time. See [Signing](../packaging/signing.md).

## Choose an installer

Pick the architecture that matches the computer. Apple Silicon and Intel Macs are different packages. macOS `.dmg` files appear here once a GitHub Release includes them.

<div class="adelpha-downloads">
<div class="adelpha-download" data-adelpha-download="macos-arm64">
  <span class="adelpha-download__icon" aria-hidden="true">
    <svg viewBox="0 0 24 24"><rect width="18" height="12" x="3" y="4" rx="2"/><path d="M2 20h20"/><path d="M8 20v-4"/><path d="M16 20v-4"/></svg>
  </span>
  <div class="adelpha-download__meta">
    <strong>macOS Apple Silicon</strong>
    <span>ARM64 · M1, M2, M3, M4 and later · macOS 12 or later</span>
    <code class="adelpha-download__file" data-adelpha-file>Adelpha_*_aarch64.dmg</code>
  </div>
  <a class="adelpha-download__btn" data-adelpha-href rel="noopener noreferrer" href="https://github.com/imr-framework/adelpha/releases">View releases</a>
  <p class="adelpha-download__status" data-adelpha-status>Not on the current GitHub Release yet. The button opens the releases page.</p>
  <p class="adelpha-download__hash" hidden>
    SHA-256
    <code data-adelpha-sha></code>
    <button type="button" class="adelpha-copy" data-adelpha-copy hidden>Copy</button>
  </p>
</div>
<div class="adelpha-download" data-adelpha-download="macos-x64">
  <span class="adelpha-download__icon" aria-hidden="true">
    <svg viewBox="0 0 24 24"><rect width="18" height="12" x="3" y="4" rx="2"/><path d="M2 20h20"/><path d="M8 20v-4"/><path d="M16 20v-4"/></svg>
  </span>
  <div class="adelpha-download__meta">
    <strong>macOS Intel</strong>
    <span>x86_64 · Intel-based Macs · macOS 12 or later</span>
    <code class="adelpha-download__file" data-adelpha-file>Adelpha_*_x64.dmg</code>
  </div>
  <a class="adelpha-download__btn" data-adelpha-href rel="noopener noreferrer" href="https://github.com/imr-framework/adelpha/releases">View releases</a>
  <p class="adelpha-download__status" data-adelpha-status>Not on the current GitHub Release yet. The button opens the releases page.</p>
  <p class="adelpha-download__hash" hidden>
    SHA-256
    <code data-adelpha-sha></code>
    <button type="button" class="adelpha-copy" data-adelpha-copy hidden>Copy</button>
  </p>
</div>
<div class="adelpha-download" data-adelpha-download="linux-deb">
  <span class="adelpha-download__icon" aria-hidden="true">
    <svg viewBox="0 0 24 24"><path d="M16.5 9.4 7.5 4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.29 7 12 12l8.71-5"/><path d="M12 22V12"/></svg>
  </span>
  <div class="adelpha-download__meta">
    <strong>Linux</strong>
    <span>amd64 · .deb · Ubuntu 22.04 and similar</span>
    <code class="adelpha-download__file" data-adelpha-file>Adelpha_0.5.0_amd64.deb</code>
  </div>
  <a class="adelpha-download__btn" data-adelpha-href rel="noopener noreferrer" href="https://github.com/imr-framework/adelpha/releases/download/v0.5.0/Adelpha_0.5.0_amd64.deb">Download .deb</a>
  <p class="adelpha-download__status" data-adelpha-status>From GitHub Release v0.5.0.</p>
  <p class="adelpha-download__hash">
    SHA-256
    <code data-adelpha-sha>e17f61ed4abfa15e5d247183e62bc3b475d7022cc4f0c525232d0c0b59163170</code>
    <button type="button" class="adelpha-copy" data-adelpha-copy>Copy</button>
  </p>
</div>
</div>

| Platform | Installer | Recommended for |
| --- | --- | --- |
| macOS Apple Silicon | `.dmg` ARM64 | M1, M2, M3, M4 and later |
| macOS Intel | `.dmg` x86_64 | Intel-based Macs |
| Linux | `.deb` amd64 | Ubuntu 22.04-class distributions |

Windows and AppImage packages are not listed here.

## System requirements

| Platform | Requirement |
| --- | --- |
| macOS | macOS 12 or later. Separate Apple Silicon and Intel installers. |
| Linux | 64-bit `.deb` for Ubuntu 22.04-class distributions. |
| Packaged app | Python, Node, and Rust are not required to run a release build. |

## After you download

1. Open the `.dmg` or install the `.deb`.
2. Launch **Adelpha**. On an unsigned Mac build, use **Right-click → Open** the first time.
3. Wait until the top bar reads **All systems operational**.

Full steps: [Getting started](index.md). How installers are produced: [Desktop packaging](../packaging/index.md).
