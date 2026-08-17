/** Public URL for the magnet mesh, or undefined if unset / invalid. */
export function readMagnetCadUrl(): string | undefined {
  const raw = import.meta.env.VITE_MAGNET_CAD_URL?.trim();
  if (!raw) return undefined;
  // Vite only serves static meshes from `public/` (use `/name.stl`) or full http(s) URLs — not macOS/Linux file paths.
  if (raw.startsWith("/Users") || raw.startsWith("/home/") || /^[A-Za-z]:[\\/]/.test(raw)) {
    console.warn(
      "[twin] VITE_MAGNET_CAD_URL must be a URL path (e.g. /MRI_base.stl) with the file in the public/ folder, not a filesystem path.",
    );
    return undefined;
  }
  return raw;
}
