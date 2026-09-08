const ADELPHA_RELEASES = "https://api.github.com/repos/imr-framework/adelpha/releases/latest";

const ADELPHA_ICONS = {
  apple:
    '<svg viewBox="0 0 24 24"><rect width="18" height="16" x="3" y="4" rx="2.5"/><path d="M3 8.5h18"/><circle cx="7" cy="6.25" r="0.7"/><circle cx="9.5" cy="6.25" r="0.7"/><circle cx="12" cy="6.25" r="0.7"/></svg>',
  linux:
    '<svg viewBox="0 0 24 24"><path d="M16.5 9.4 7.5 4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.29 7 12 12l8.71-5"/><path d="M12 22V12"/></svg>',
  windows:
    '<svg viewBox="0 0 24 24"><rect width="8" height="8" x="3" y="3" rx="1"/><rect width="8" height="8" x="13" y="3" rx="1"/><rect width="8" height="8" x="3" y="13" rx="1"/><rect width="8" height="8" x="13" y="13" rx="1"/></svg>',
  phone:
    '<svg viewBox="0 0 24 24"><rect width="10" height="20" x="7" y="2" rx="2"/><path d="M11 18h2"/></svg>',
};

const ADELPHA_PLATFORMS = {
  "macos-arm64": {
    family: "mac",
    icon: "apple",
    title: "Adelpha for macOS",
    subtitle: "Optimized for Apple Silicon",
    cta: "Download for Apple Silicon",
    miniLabel: "macOS Apple Silicon",
    miniCompat: "M1 and later · macOS 12+",
    miniAction: "Download DMG",
    altKind: "macos-x64",
    altText: "Using an Intel Mac? Download the Intel version",
    soon: null,
  },
  "macos-x64": {
    family: "mac",
    icon: "apple",
    title: "Adelpha for macOS",
    subtitle: "For Intel-based Macs",
    cta: "Download for Intel",
    miniLabel: "macOS Intel",
    miniCompat: "Intel Macs · macOS 12+",
    miniAction: "Download DMG",
    altKind: "macos-arm64",
    altText: "Using Apple Silicon? Download that version",
    soon: null,
  },
  "linux-deb": {
    family: "linux",
    icon: "linux",
    title: "Adelpha for Linux",
    subtitle: "Ubuntu 22.04 or later",
    cta: "Download for Linux",
    miniLabel: "Linux",
    miniCompat: "Ubuntu 22.04+ · x64",
    miniAction: "Download DEB",
    soon: null,
  },
  "windows-x64": {
    family: "win",
    icon: "windows",
    title: "Adelpha for Windows",
    subtitle: "Windows 10 and 11",
    cta: "Download for Windows",
    miniLabel: "Windows",
    miniCompat: "Windows 10/11 · x64",
    miniAction: "Download EXE",
    soon: null,
  },
  mobile: {
    family: "mobile",
    icon: "phone",
    title: "Adelpha is a desktop app",
    subtitle: "Phones are not supported",
    cta: "",
    miniLabel: "Mobile",
    miniCompat: "Not supported",
    miniAction: "",
    soon: "Not available on phones",
  },
};

const ADELPHA_KNOWN_SUMS = {
  "Adelpha_0.5.0_amd64.deb":
    "e17f61ed4abfa15e5d247183e62bc3b475d7022cc4f0c525232d0c0b59163170",
  "Adelpha_0.5.2_aarch64.dmg":
    "b225a72238dff6b643c50c63b7bf3f9866f2753a254fdcd32de30a6c13af1434",
  "Adelpha_0.5.2_x86_64.dmg":
    "5fca9d41f6344b7ca22de1a1cc23194388c59bdc0b85d45d88ed74b94291b4b8",
  "Adelpha_0.5.2_x64-setup.exe":
    "46ac933141bd9858321f30ecaad9e4a8e15e2f00c9134718606d51011a1ff709",
  "Adelpha-windows-x86_64-setup.exe":
    "46ac933141bd9858321f30ecaad9e4a8e15e2f00c9134718606d51011a1ff709",
  "Adelpha_0.5.2_amd64.deb":
    "03f1c35dc6b428320e7e4ee5aeae8086d5076c7b6812a230bb174a99be88a9c7",
};

const ADELPHA_DL = "https://github.com/imr-framework/adelpha/releases/download";

/** Public catalog until GitHub latest is this version or newer. */
const ADELPHA_BUNDLED_RELEASE = {
  version: "0.5.2",
  published_at: "2026-08-31T20:53:09Z",
  assets: [
    {
      name: "Adelpha_0.5.2_aarch64.dmg",
      browser_download_url: `${ADELPHA_DL}/v0.5.2/Adelpha_0.5.2_aarch64.dmg`,
      size: 121644243,
    },
    {
      name: "Adelpha_0.5.2_x86_64.dmg",
      browser_download_url: `${ADELPHA_DL}/v0.5.2/Adelpha_0.5.2_x86_64.dmg`,
      size: 126734170,
    },
    {
      name: "Adelpha_0.5.2_x64-setup.exe",
      browser_download_url: `${ADELPHA_DL}/v0.5.2/Adelpha_0.5.2_x64-setup.exe`,
      size: 87223626,
    },
    {
      name: "Adelpha_0.5.2_amd64.deb",
      browser_download_url: `${ADELPHA_DL}/v0.5.2/Adelpha_0.5.2_amd64.deb`,
      size: 174831936,
    },
  ],
};

function adelphaVersionParts(version) {
  return String(version || "")
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((part) => parseInt(part, 10) || 0);
}

function adelphaCmpVersion(a, b) {
  const left = adelphaVersionParts(a);
  const right = adelphaVersionParts(b);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i += 1) {
    const delta = (left[i] || 0) - (right[i] || 0);
    if (delta) return delta;
  }
  return 0;
}

function adelphaAssetRank(name) {
  return /^Adelpha_\d/.test(name || "") ? 2 : 1;
}

function adelphaAssetsByKind(assets) {
  const byKind = {};
  for (const asset of assets || []) {
    const kind = adelphaClassifyAsset(asset.name);
    if (!kind) continue;
    const current = byKind[kind];
    if (!current || adelphaAssetRank(asset.name) > adelphaAssetRank(current.name)) {
      byKind[kind] = asset;
    }
  }
  return byKind;
}

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
  if (n.endsWith(".exe") || n.endsWith(".msi")) {
    return "windows-x64";
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

function adelphaFormatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function adelphaFormatReleased(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `Released ${date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })}`;
}

function adelphaTruncateSha(sha) {
  if (!sha || sha.length < 20) return sha || "";
  return `${sha.slice(0, 16)}…`;
}

let adelphaMobileForm = null;

async function adelphaDetectKind() {
  const ua = navigator.userAgent || "";
  const uaData = navigator.userAgentData;
  const plat = `${uaData?.platform || navigator.platform || ""}`;
  const isPhone =
    uaData?.mobile === true ||
    /iPhone|iPod/i.test(ua) ||
    (/Android/i.test(ua) && /Mobile/i.test(ua));
  const isTablet =
    /iPad/i.test(ua) ||
    (/Mac/i.test(plat) && navigator.maxTouchPoints > 1) ||
    (/Android/i.test(ua) && !/Mobile/i.test(ua));
  if (isPhone) {
    adelphaMobileForm = "phone";
    return "mobile";
  }
  if (isTablet) {
    adelphaMobileForm = "tablet";
    return "mobile";
  }
  adelphaMobileForm = null;

  const isMac = /macOS/i.test(plat) || /Mac/i.test(plat) || /Mac OS X/i.test(ua);
  const isWin = /Win/i.test(plat) || /Windows/i.test(ua);
  const isLinux =
    !/Android/i.test(ua) &&
    !/CrOS/i.test(ua) &&
    (/Linux/i.test(plat) || /Linux/i.test(ua) || /X11/i.test(plat));

  if (isMac) {
    try {
      if (uaData?.getHighEntropyValues) {
        const { architecture } = await uaData.getHighEntropyValues(["architecture"]);
        if (architecture === "x86") return "macos-x64";
        if (architecture === "arm") return "macos-arm64";
      }
    } catch {
      /* Fall through to WebGL / default. */
    }
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl");
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "";
      if (/Intel/i.test(renderer) && !/Apple/i.test(renderer)) return "macos-x64";
      if (/Apple M\d|Apple GPU|ARM|Mali/i.test(renderer)) return "macos-arm64";
    } catch {
      /* Ignore. */
    }
    return "macos-arm64";
  }
  if (isWin) return "windows-x64";
  if (isLinux) return "linux-deb";
  return null;
}

function adelphaPickFeatured(detected, byKind) {
  if (detected === "mobile") return "mobile";
  if (detected) return detected;
  const available = Object.keys(ADELPHA_PLATFORMS).filter((kind) => byKind[kind]);
  if (available.includes("linux-deb")) return "linux-deb";
  return available[0] || "linux-deb";
}

function adelphaRecommendLabel(kind) {
  if (kind === "mobile") {
    return adelphaMobileForm === "tablet" ? "This device" : "This phone";
  }
  if (kind === "macos-arm64" || kind === "macos-x64") return "Recommended for this Mac";
  if (kind === "windows-x64") return "Recommended for this PC";
  if (kind === "linux-deb") return "Recommended for this computer";
  return "";
}

function adelphaBindCopyButtons(root) {
  (root || document).querySelectorAll("[data-adelpha-copy]").forEach((button) => {
    if (button.dataset.bound === "1") return;
    button.dataset.bound = "1";
    button.addEventListener("click", async () => {
      const key = button.getAttribute("data-adelpha-copy");
      const scope = button.closest("[data-adelpha-verify]") || document;
      const target = scope.querySelector(
        key === "file" ? "[data-adelpha-file]" : "[data-adelpha-sha]"
      );
      const text = (target?.getAttribute("title") || target?.textContent || "").trim();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
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

function adelphaFillFeatured(kind, asset, version, detected) {
  const card = document.querySelector("[data-adelpha-featured]");
  const spec = ADELPHA_PLATFORMS[kind];
  if (!card || !spec) return;

  card.dataset.adelphaKind = kind;
  card.classList.toggle("adelpha-dl-card--soon", !asset);
  const icon = card.querySelector("[data-adelpha-icon]");
  const rec = card.querySelector("[data-adelpha-rec]");
  const title = card.querySelector("[data-adelpha-title]");
  const sub = card.querySelector("[data-adelpha-sub]");
  const cta = card.querySelector("[data-adelpha-href]");
  const wait = card.querySelector("[data-adelpha-wait]");
  const fine = card.querySelector("[data-adelpha-fine]");

  if (icon) icon.innerHTML = ADELPHA_ICONS[spec.icon];
  if (title) title.textContent = spec.title;
  if (sub) {
    sub.textContent =
      kind === "mobile" && adelphaMobileForm === "tablet"
        ? "This device is not supported"
        : spec.subtitle;
  }
  if (rec) {
    const label = detected === kind ? adelphaRecommendLabel(kind) : "";
    rec.textContent = label;
    rec.hidden = !label;
  }

  if (asset && cta) {
    cta.hidden = false;
    cta.href = asset.browser_download_url;
    cta.textContent = spec.cta;
    if (wait) wait.hidden = true;
    const size = adelphaFormatBytes(asset.size);
    const bits = [`Version ${version || ADELPHA_BUNDLED_RELEASE.version}`];
    if (size) bits.push(size);
    if (fine) {
      fine.hidden = false;
      fine.textContent = bits.join(" · ");
    }
  } else {
    if (cta) {
      cta.hidden = true;
      cta.removeAttribute("href");
    }
    if (wait) {
      wait.hidden = false;
      wait.textContent =
        kind === "mobile" && adelphaMobileForm === "tablet"
          ? "Not available on this device"
          : spec.soon || "Coming soon";
    }
    if (fine) {
      fine.hidden = true;
      fine.textContent = "";
    }
  }
}

function adelphaSetVisitorNote(kind, byKind) {
  const alt = document.querySelector("[data-adelpha-alt]");
  const spec = ADELPHA_PLATFORMS[kind];
  if (!alt) return;
  alt.replaceChildren();
  alt.hidden = true;

  const sibling = spec?.altKind && byKind[spec.altKind];
  if (sibling) {
    const link = document.createElement("a");
    link.href = sibling.browser_download_url;
    link.rel = "noopener noreferrer";
    link.textContent = spec.altText;
    alt.append(link);
    alt.hidden = false;
    return;
  }

  if (byKind[kind]) return;
  if (kind === "mobile") {
    alt.hidden = false;
    alt.textContent = "Desktop installers are listed below.";
    return;
  }
  const linux = byKind["linux-deb"];
  if (!linux) return;
  alt.hidden = false;
  alt.append("Linux is available now. ");
  const link = document.createElement("a");
  link.href = linux.browser_download_url;
  link.rel = "noopener noreferrer";
  link.textContent = "Download the .deb";
  alt.append(link);
}

function adelphaRenderOthers(featured, byKind) {
  const section = document.querySelector("[data-adelpha-others]");
  const grid = document.querySelector("[data-adelpha-others-grid]");
  if (!section || !grid) return;
  grid.replaceChildren();
  const kinds = Object.keys(ADELPHA_PLATFORMS).filter(
    (kind) => kind !== featured && byKind[kind]
  );
  if (!kinds.length) {
    section.hidden = true;
    return;
  }
  kinds.forEach((kind) => {
    const spec = ADELPHA_PLATFORMS[kind];
    const asset = byKind[kind];
    const card = document.createElement("a");
    card.className = "adelpha-dl-mini";
    card.href = asset.browser_download_url;
    card.rel = "noopener noreferrer";
    const icon = document.createElement("span");
    icon.className = "adelpha-dl-mini__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = ADELPHA_ICONS[spec.icon];
    const text = document.createElement("span");
    text.className = "adelpha-dl-mini__text";
    const strong = document.createElement("strong");
    strong.textContent = spec.miniLabel;
    const compat = document.createElement("span");
    compat.textContent = spec.miniCompat;
    const action = document.createElement("em");
    action.textContent = spec.miniAction;
    text.append(strong, compat);
    card.append(icon, text, action);
    grid.append(card);
  });
  section.hidden = false;
}

function adelphaRenderSoon(byKind, featured) {
  const section = document.querySelector("[data-adelpha-soon]");
  if (!section) return;
  let visible = 0;
  section.querySelectorAll("[data-adelpha-soon]").forEach((row) => {
    const kind = row.getAttribute("data-adelpha-soon");
    const hide = Boolean(byKind[kind]) || kind === featured;
    row.hidden = hide;
    if (!hide) visible += 1;
  });
  section.hidden = visible === 0;
}

function adelphaFillVerify(asset, sums) {
  const file = document.querySelector("[data-adelpha-verify] [data-adelpha-file]");
  const sha = document.querySelector("[data-adelpha-verify] [data-adelpha-sha]");
  const shaCopy = document.querySelector("[data-adelpha-verify] [data-adelpha-copy='sha']");
  if (!asset) return;
  if (file) {
    file.textContent = asset.name;
    file.removeAttribute("title");
  }
  const digest = sums[asset.name] || ADELPHA_KNOWN_SUMS[asset.name];
  if (sha) {
    if (digest) {
      sha.setAttribute("title", digest);
      sha.textContent = adelphaTruncateSha(digest);
      if (shaCopy) shaCopy.hidden = false;
    } else {
      sha.removeAttribute("title");
      sha.textContent = "Not published for this file";
      if (shaCopy) shaCopy.hidden = true;
    }
  }
}

async function adelphaHydrateDownloads() {
  const featured = document.querySelector("[data-adelpha-featured]");
  if (!featured) {
    adelphaBindCopyButtons();
    return;
  }

  adelphaBindCopyButtons();

  let version = ADELPHA_BUNDLED_RELEASE.version;
  let publishedAt = ADELPHA_BUNDLED_RELEASE.published_at;
  let byKind = adelphaAssetsByKind(ADELPHA_BUNDLED_RELEASE.assets);
  const sums = { ...ADELPHA_KNOWN_SUMS };
  const detected = await adelphaDetectKind();

  try {
    const releaseRes = await fetch(ADELPHA_RELEASES);
    if (releaseRes.ok) {
      const release = await releaseRes.json();
      const apiVersion = (release.tag_name || "").replace(/^v/i, "");
      const assets = release.assets || [];
      if (apiVersion && adelphaCmpVersion(apiVersion, version) >= 0) {
        version = apiVersion;
        publishedAt = release.published_at || publishedAt;
        const apiKind = adelphaAssetsByKind(assets);
        byKind =
          adelphaCmpVersion(apiVersion, ADELPHA_BUNDLED_RELEASE.version) > 0
            ? apiKind
            : { ...byKind, ...apiKind };
      }
      await Promise.all(
        assets
          .filter((asset) => /^SHA256SUMS/i.test(asset.name))
          .map(async (asset) => {
            try {
              const res = await fetch(asset.browser_download_url);
              if (!res.ok) return;
              Object.assign(sums, adelphaParseSums(await res.text()));
            } catch {
              /* Checksums stay static. */
            }
          })
      );
    }
  } catch {
    /* Bundled catalog still applies. */
  }

  document.querySelectorAll("[data-adelpha-version]").forEach((el) => {
    if (version) el.textContent = version;
  });
  const released = adelphaFormatReleased(publishedAt);
  document.querySelectorAll("[data-adelpha-released]").forEach((el) => {
    if (released) el.textContent = released;
  });

  const featuredKind = adelphaPickFeatured(detected, byKind);
  const featuredAsset = byKind[featuredKind];
  adelphaFillFeatured(featuredKind, featuredAsset, version, detected);
  adelphaSetVisitorNote(featuredKind, byKind);
  adelphaFillVerify(featuredAsset || byKind["linux-deb"], sums);
  adelphaRenderOthers(featuredKind, byKind);
  adelphaRenderSoon(byKind, featuredKind);
  adelphaBindCopyButtons();
}

if (window.document$) {
  document$.subscribe(() => {
    void adelphaHydrateDownloads();
  });
} else {
  void adelphaHydrateDownloads();
}
