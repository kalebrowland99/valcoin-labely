/**
 * Display src helper for product images (data URLs pass through).
 * Kept as `numistaDisplaySrc` because ThriftySlide / Valcoin still import that name.
 */
export function numistaDisplaySrc(url) {
  return String(url || "").trim();
}
