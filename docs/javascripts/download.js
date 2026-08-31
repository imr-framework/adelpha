const ADELPHA_RELEASES = "https://api.github.com/repos/imr-framework/adelpha/releases/latest";

function adelphaClassifyAsset(name) {
  const n = name.toLowerCase();
  if (n.endsWith(".dmg") && (n.includes("aarch64") || n.includes("arm64"))) {
    return "macos-arm64";
  }
  if (n.endsWith(".dmg") && (n.includes("x86_64") || n.includes("_x64"))) {
    return "macos-x64";
  }
  if (
    n.endsWith(".deb") &&
    (n.includes("amd64") || n.includes("x86_64") || n.includes("_x64"))
  ) {
    return "linux-deb";
  }
  return null;
}

function adelphaParseSums(text) {
  const map = {};
  for (const line of text.split("\n")) {
    const match = line.trim().match(/^([a-f0-9]{64})\s+\*?(\S+)/i);
    if (match) map[match[2]] = match[1];
  }
  return map;
}

function adelphaBindCopyButtons() {
  document.querySelectorAll("[data-adelpha-copy]").forEach((button) => {
    if (button.dataset.bound === "1") return;
    button.dataset.bound = "1";
    button.addEventListener("click", async () => {
      const sha = button.parentElement?.querySelector("[data-adelpha-sha]");
      if (!sha?.textContent) return;
      try {
        await navigator.clipboard.writeText(sha.textContent.trim());
        button.textContent = "Copied";
        window.setTimeout(() => {
          button.textContent = "Copy";
        }, 1600);
      } catch {
        button.textContent = "Copy failed";
      }
    });
  });
}

function adelphaSetHash(card, digest) {
  const hashRow = card.querySelector(".adelpha-download__hash");
  const sha = card.querySelector("[data-adelpha-sha]");
  const copy = card.querySelector("[data-adelpha-copy]");
  if (!hashRow || !sha || !copy) return;
  if (!digest) {
    hashRow.hidden = true;
    copy.hidden = true;
    sha.textContent = "";
    return;
  }
  sha.textContent = digest;
  hashRow.hidden = false;
  copy.hidden = false;
}

async function adelphaHydrateDownloads() {
  const cards = document.querySelectorAll("[data-adelpha-download]");
  if (!cards.length) {
    adelphaBindCopyButtons();
    return;
  }

  try {
    const releaseRes = await fetch(ADELPHA_RELEASES);
    if (!releaseRes.ok) return;
    const release = await releaseRes.json();
    const assets = release.assets || [];
    const tag = release.tag_name || "";
    const version = tag.replace(/^v/i, "");
    const sums = {};

    document.querySelectorAll("[data-adelpha-version]").forEach((el) => {
      if (version) el.textContent = version;
    });

    await Promise.all(
      assets
        .filter((asset) => /^SHA256SUMS/i.test(asset.name))
        .map(async (asset) => {
          const res = await fetch(asset.browser_download_url);
          if (!res.ok) return;
          Object.assign(sums, adelphaParseSums(await res.text()));
        })
    );

    const byKind = {};
    for (const asset of assets) {
      const kind = adelphaClassifyAsset(asset.name);
      if (kind && !byKind[kind]) byKind[kind] = asset;
    }

    cards.forEach((card) => {
      const kind = card.getAttribute("data-adelpha-download");
      const asset = byKind[kind];
      const link = card.querySelector("[data-adelpha-href]");
      const file = card.querySelector("[data-adelpha-file]");
      const status = card.querySelector("[data-adelpha-status]");
      if (!asset) return;

      const previousName = file?.textContent?.trim();
      if (file) file.textContent = asset.name;
      if (link) {
        link.href = asset.browser_download_url;
        link.textContent = kind === "linux-deb" ? "Download .deb" : "Download DMG";
      }
      if (status) {
        status.textContent = `From GitHub Release ${tag}.`.trim();
      }
      const digest = sums[asset.name];
      if (digest) {
        adelphaSetHash(card, digest);
      } else if (asset.name !== previousName) {
        adelphaSetHash(card, "");
      }
    });
  } catch {
    /* Keep the static markup if GitHub is unreachable. */
  } finally {
    adelphaBindCopyButtons();
  }
}

if (window.document$) {
  document$.subscribe(() => {
    void adelphaHydrateDownloads();
  });
} else {
  void adelphaHydrateDownloads();
}
