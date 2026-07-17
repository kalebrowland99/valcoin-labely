/**
 * Look up a packaged product's REAL published ingredient list
 * (Open Food Facts first, then careful brand/name variants).
 */

const OFF_SEARCH = "https://world.openfoodfacts.org/cgi/search.pl";
const OFF_PRODUCT = "https://world.openfoodfacts.org/api/v2/product";

const USER_AGENT =
  "LabelyProductScreenshots/1.0 (github.com/kalebrowland99/valcoin-labely; local-dev)";

function cleanIngredientsText(raw) {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickBestProduct(products, { name, brand }) {
  const list = Array.isArray(products) ? products : [];
  if (!list.length) return null;
  const n = norm(name);
  const b = norm(brand);
  const nameTokens = n.split(" ").filter((t) => t.length > 2 && !["the", "and", "with", "original"].includes(t));

  const scored = list.map((p) => {
    const pn = norm(p.product_name || p.product_name_en);
    const pb = norm(p.brands);
    let score = 0;
    const brandHit = Boolean(
      b && (pb.includes(b) || b.split(" ").some((tok) => tok.length > 3 && pb.includes(tok)))
    );
    if (b && !brandHit) return { p, score: -1 };
    if (brandHit) score += 8;
    if (n && pn.includes(n.slice(0, Math.min(22, n.length)))) score += 5;
    const tokenHits = nameTokens.filter((t) => pn.includes(t)).length;
    score += Math.min(6, tokenHits * 2);
    if (cleanIngredientsText(p.ingredients_text_en || p.ingredients_text)) score += 3;
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 8) return null;
  return best.p;
}

function productToLookup(p, source) {
  if (!p) return null;
  const ingredients = cleanIngredientsText(
    p.ingredients_text_en || p.ingredients_text || ""
  );
  if (!ingredients) return null;
  return {
    source,
    code: String(p.code || p._id || "").trim() || null,
    productName: String(p.product_name || p.product_name_en || "").trim() || null,
    brands: String(p.brands || "").trim() || null,
    ingredients,
  };
}

async function offSearch(params) {
  const url = new URL(OFF_SEARCH);
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", String(params.pageSize || 12));
  for (const [k, v] of Object.entries(params.extra || {})) {
    url.searchParams.set(k, v);
  }
  if (params.searchTerms) url.searchParams.set("search_terms", params.searchTerms);
  if (params.searchSimple) url.searchParams.set("search_simple", "1");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.products) ? data.products : [];
}

/** Search by barcode when vision reads one. */
export async function lookupOpenFoodFactsByBarcode(barcode) {
  const code = String(barcode || "").replace(/\D/g, "");
  if (code.length < 8) return null;
  try {
    const res = await fetch(`${OFF_PRODUCT}/${encodeURIComponent(code)}.json`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.status !== 1 || !data?.product) return null;
    return productToLookup(data.product, "openfoodfacts-barcode");
  } catch (err) {
    console.warn("[off] barcode lookup failed", err?.message || err);
    return null;
  }
}

function queryVariants(name, brand) {
  const n = String(name || "").trim();
  const b = String(brand || "").trim();
  const shortName = n
    .replace(/\bthe original\b/i, "")
    .replace(/\borganic\b/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const variants = [
    [b, n].filter(Boolean).join(" "),
    [b, shortName].filter(Boolean).join(" "),
    shortName,
    n,
  ];
  // Unique non-empty
  const seen = new Set();
  return variants.filter((q) => {
    const k = q.toLowerCase();
    if (!q || q.length < 3 || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Search by brand + product name (multiple OFF strategies). */
export async function lookupOpenFoodFactsByName({ name, brand }) {
  try {
    const collected = [];

    for (const q of queryVariants(name, brand)) {
      const products = await offSearch({
        searchTerms: q,
        searchSimple: true,
        pageSize: 12,
      });
      collected.push(...products);
    }

    // Brand facet search — tighter match when brand is known
    if (brand) {
      const facetProducts = await offSearch({
        searchTerms: String(name || "")
          .replace(/\bthe original\b/i, "")
          .trim() || brand,
        pageSize: 15,
        extra: {
          tagtype_0: "brands",
          tag_contains_0: "contains",
          tag_0: brand,
        },
      });
      collected.push(...facetProducts);
    }

    // Dedupe by code
    const byCode = new Map();
    for (const p of collected) {
      const code = String(p?.code || p?._id || "");
      if (!code || byCode.has(code)) continue;
      byCode.set(code, p);
    }

    const best = pickBestProduct([...byCode.values()], { name, brand });
    return productToLookup(best, "openfoodfacts-search");
  } catch (err) {
    console.warn("[off] name search failed", err?.message || err);
    return null;
  }
}

/**
 * Ask the model for the published label ingredients ONLY when databases miss.
 * Must return empty if not highly confident (prevents soybean-oil hallucinations).
 */
export async function lookupIngredientsViaModel({
  openaiApiKey,
  name,
  brand,
  category,
  openaiJson,
}) {
  if (!openaiApiKey || typeof openaiJson !== "function") return null;
  try {
    const data = await openaiJson({
      openaiApiKey,
      temperature: 0,
      maxTokens: 500,
      messages: [
        {
          role: "system",
          content: `You look up REAL published US retail ingredient lists for packaged foods.
Return ingredients ONLY when you are highly confident of the exact current label for this SKU.
If unsure, ambiguous, or might confuse with a similar product, return found=false.
Never invent seed oils or preservatives.`,
        },
        {
          role: "user",
          content: `Brand: ${brand || "(unknown)"}
Product: ${name || "(unknown)"}
Category: ${category || "unknown"}

Return ONLY JSON:
{
  "found": true,
  "confidence": 0.0,
  "ingredients": "comma-separated ingredients exactly as on the package, English"
}

Rules:
- found=true only if confidence >= 0.85 AND you know this exact SKU's label.
- Example correct: Lesser Evil Himalayan Pink Salt → "Organic Non-GMO Popcorn, Organic Extra Virgin Coconut Oil, Himalayan Salt"
- Do NOT return a different popcorn brand's ingredients.
- If found=false, ingredients must be "".`,
        },
      ],
    });

    const found = data?.found === true;
    const confidence = Number(data?.confidence);
    const ingredients = cleanIngredientsText(data?.ingredients);
    if (!found || !(confidence >= 0.85) || ingredients.length < 8) return null;
    return {
      source: "label-knowledge",
      code: null,
      productName: name,
      brands: brand,
      ingredients,
    };
  } catch (err) {
    console.warn("[ingredients-model] lookup failed", err?.message || err);
    return null;
  }
}

export async function resolvePublishedIngredients({
  name,
  brand,
  barcode,
  category,
  openaiApiKey,
  openaiJson,
}) {
  if (barcode) {
    const byCode = await lookupOpenFoodFactsByBarcode(barcode);
    if (byCode) return byCode;
  }

  const byName = await lookupOpenFoodFactsByName({ name, brand });
  if (byName) return byName;

  // Last resort: high-confidence known SKU labels only
  return lookupIngredientsViaModel({
    openaiApiKey,
    name,
    brand,
    category,
    openaiJson,
  });
}
