/** Labely score 0–100 and rating labels. */

export function clampLabelyScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Clean-label bands:
 * 0–30 Avoid (red) · 31–45 Limit (orange) · 46–60 Okay Occasionally (amber)
 * 61–80 Good (sage) · 81–100 Great (green)
 */
export function ratingLabelFromScore(score) {
  const s = clampLabelyScore(score);
  if (s <= 30) return "Avoid";
  if (s <= 45) return "Limit";
  if (s <= 60) return "Okay Occasionally";
  if (s <= 80) return "Good";
  return "Great";
}

/** UI text + score-dot colors — must match rating bands. */
export function scoreAccent(score) {
  const s = clampLabelyScore(score);
  if (s <= 30) return { text: "#B23A2D", dot: "#E54D42" }; // Avoid — red
  if (s <= 45) return { text: "#C45C1A", dot: "#FF6B35" }; // Limit — orange
  if (s <= 60) return { text: "#A67C00", dot: "#E6A800" }; // Okay — amber
  if (s <= 80) return { text: "#3D6B2E", dot: "#6BAE4F" }; // Good — sage
  return { text: "#1F7A3F", dot: "#34C759" }; // Great — green
}

/**
 * Harden model scores so flags match the headline score/color.
 * Seed oils + synthetic preservatives should never read as "Good".
 * True clean/whole-food labels (no seed oils, no concerning additives) stay in Good+.
 */
export function hardenLabelyScore(rawScore, seedOils = [], additives = []) {
  let score = clampLabelyScore(rawScore);
  const oils = (Array.isArray(seedOils) ? seedOils : [])
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  const adds = (Array.isArray(additives) ? additives : [])
    .map((s) => String(s || "").trim())
    .filter(Boolean);

  const harshAdditive = adds.some((a) =>
    /tbhq|bha|bht|sodium nitrite|sodium nitrate|potassium bromate|azodicarbonamide|propyl\s*gallate|red\s*40|yellow\s*5|yellow\s*6|blue\s*1|aspartame|sucralose|acesulfame|saccharin|high\s*fructose|hfcs|carrageenan|polysorbate|sodium\s*benzoate|sodium\s*sulfite|sulfite|brominated/i.test(
      a
    )
  );

  if (oils.length > 0 && (harshAdditive || adds.length >= 2)) {
    // Ultra-processed + seed oils (e.g. graham crackers with soybean oil + TBHQ)
    score = Math.min(score, 28);
  } else if (oils.length > 0 && adds.length > 0) {
    score = Math.min(score, 38);
  } else if (oils.length > 0) {
    score = Math.min(score, 42);
  } else if (harshAdditive) {
    score = Math.min(score, 40);
  } else if (adds.length > 0) {
    score = Math.min(score, 55);
  } else {
    // No seed oils / concerning additives → whole-food / clean territory
    if (score < 68) score = Math.max(score, 72);
  }

  return clampLabelyScore(score);
}

/**
 * Keep only flags that are grounded in the ingredient text (or empty lists if
 * we have no list and must not invent). Prevents soybean-oil/TBHQ hallucinations
 * when the real SKU uses coconut oil / no additives.
 */
const FLAG_ALIASES = {
  tbhq: ["tbhq", "tert-butylhydroquinone", "tertiary butylhydroquinone", "butylhydroquinone"],
  bha: ["bha", "butylated hydroxyanisole"],
  bht: ["bht", "butylated hydroxytoluene"],
  "red 40": ["red 40", "red40", "allura red", "fd&c red"],
  "yellow 5": ["yellow 5", "yellow5", "tartrazine"],
  "yellow 6": ["yellow 6", "yellow6", "sunset yellow"],
  "blue 1": ["blue 1", "blue1", "brilliant blue"],
  msg: ["msg", "monosodium glutamate"],
  "high fructose corn syrup": ["high fructose corn syrup", "hfcs"],
  "brominated vegetable oil": ["brominated vegetable oil", "bvo"],
  "azodicarbonamide": ["azodicarbonamide", "ada"],
  edta: ["edta", "calcium disodium edta", "disodium edta"],
  "soybean oil": ["soybean oil", "soya oil", "soy oil"],
  "canola oil": ["canola oil", "rapeseed oil"],
  "vegetable oil": ["vegetable oil", "vegetable oils"],
};

export function filterFlagsToIngredients(seedOils, additives, ingredientsText, { allowUngrounded = false } = {}) {
  const text = String(ingredientsText || "").toLowerCase();
  const hasText = text.replace(/\(no ingredients[^)]*\)/i, "").trim().length > 12;

  const matchesText = (item) => {
    const needle = item.toLowerCase().trim();
    if (!needle) return false;
    if (text.includes(needle)) return true;
    const aliases = FLAG_ALIASES[needle];
    if (aliases?.some((a) => text.includes(a))) return true;
    const tokens = needle.split(/[\s,/]+/).filter((t) => t.length > 2);
    if (!tokens.length) return false;
    return tokens.every((t) => text.includes(t));
  };

  const keep = (items) => {
    const list = (Array.isArray(items) ? items : [])
      .map((s) => String(s || "").trim())
      .filter(Boolean);
    if (!hasText) {
      return allowUngrounded ? list.slice(0, 12) : [];
    }
    return list.filter(matchesText);
  };

  return {
    seedOils: keep(seedOils).slice(0, 12),
    additives: keep(additives).slice(0, 12),
  };
}

/** @deprecated keep import-safe defaults for empty state */
export const BAD_LABELY_SCORE = 0;
export const BAD_LABELY_VERDICT = "—";
export const MIN_BAD_LABELY_SCORE = 0;
export const MAX_BAD_LABELY_SCORE = 100;

export function normalizeLabelyScore(score) {
  return clampLabelyScore(score);
}

export function randomBadLabelyScore() {
  return 50;
}

export function normalizeBadLabelyScore(score) {
  return clampLabelyScore(score);
}
