import { NextResponse } from "next/server";
import { ratingLabelFromScore, hardenLabelyScore } from "@/lib/labelyRating";

export const maxDuration = 120;

const OPENAI_CHAT = "https://api.openai.com/v1/chat/completions";

function sanitizeUploadHint(raw) {
  if (typeof raw !== "string") return "";
  const leaf = raw.replace(/\\/g, "/").split("/").pop()?.trim() ?? "";
  if (!leaf) return "";
  return leaf.slice(0, 160);
}

function asStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v ?? "").trim())
      .filter(Boolean)
      .slice(0, 20);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/,|;|\n/)
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 20);
  }
  return [];
}

function asRankedFindings(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const name = String(row.name || row.ingredient || "").trim();
      if (!name) return null;
      const kind = String(row.kind || row.type || "additive").trim().toLowerCase();
      let severity = Number(row.severity ?? row.rank ?? row.score);
      if (!Number.isFinite(severity)) severity = 5;
      severity = Math.max(1, Math.min(10, Math.round(severity)));
      const why = String(row.why || row.reason || "").trim();
      return { name, kind, severity, why };
    })
    .filter(Boolean)
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 20);
}

async function openaiJson({ openaiApiKey, messages, temperature = 0, maxTokens = 1600 }) {
  const res = await fetch(OPENAI_CHAT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || `OpenAI error ${res.status}`);
  }
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || "";
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    throw new Error("Could not parse model JSON.");
  }
}

/** Step 1 — Identify brand + food type from the photo. */
async function identifyBrandAndFoodType({ imageDataUrl, openaiApiKey, uploadHint }) {
  const hintLine = uploadHint
    ? `\nFilename hint (weak; prefer the photo): "${uploadHint.replace(/"/g, "'")}"`
    : "";

  return openaiJson({
    openaiApiKey,
    temperature: 0,
    maxTokens: 500,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
          {
            type: "text",
            text: `Identify the brand and type of food from this packaged grocery photo.

Return ONLY JSON:
{
  "brand": "Exact brand name printed on the package (e.g. Lesser Evil)",
  "product_name": "Product / flavor line in Title Case",
  "food_type": "short food type e.g. popcorn, chips, soda, cereal, crackers, dressing, cookies",
  "category": "slightly broader category if useful e.g. salted snacks"
}
${hintLine}

Rules:
- brand: read what is printed — never invent a brand.
- food_type: the kind of food, not marketing fluff.
- Do NOT list ingredients yet.`,
          },
        ],
      },
    ],
  });
}

/**
 * Step 2 — ALWAYS look up the full published ingredients + additives/chemicals list
 * for this brand + food type / SKU.
 */
async function lookupFullIngredientAndAdditiveList({
  openaiApiKey,
  brand,
  productName,
  foodType,
  category,
}) {
  const query = [brand, productName, foodType || category].filter(Boolean).join(" ");

  return openaiJson({
    openaiApiKey,
    temperature: 0,
    maxTokens: 1400,
    messages: [
      {
        role: "system",
        content: `You look up COMPLETE published US retail ingredient lists for packaged foods.
You MUST include every ingredient AND every additive / chemical / preservative / emulsifier / color / sweetener that appears on the label — not a shortened “marketing” list.

Sources: brand sites, retailer labels, Open Food Facts–style data, EWG Food Scores, packing disclosures.
Be specific to THIS brand + this product/food type. Do not borrow another brand’s formula.
If you know Lesser Evil Himalayan Pink Salt popcorn, list only: organic popcorn, organic extra virgin coconut oil, Himalayan salt — not soybean oil.`,
      },
      {
        role: "user",
        content: `Look up the FULL ingredient / additive / chemical list for:
Query: "${query}"
Brand: ${brand || "(unknown)"}
Product: ${productName || "(unknown)"}
Food type: ${foodType || category || "(unknown)"}

Return ONLY JSON:
{
  "found": true,
  "confidence": 0.0,
  "ingredients_full": ["every ingredient in label order"],
  "additives_and_chemicals": ["every additive, preservative, color, emulsifier, sweetener, processing aid called out on the label — can overlap ingredients_full"],
  "ingredients_text": "single comma-separated string of the full label list"
}

Rules:
- Always attempt additives_and_chemicals. If the product has none (clean 3-ingredient snack), return [].
- ingredients_full should be complete when found=true.
- found=true only if confidence >= 0.75 for this exact brand/SKU family.
- Never invent TBHQ/soybean oil for a brand known to use coconut oil only.`,
      },
    ],
  });
}

/**
 * Step 3 — Walk the WHOLE list, extract unhealthy items, rank each 1–10.
 */
async function extractAndRankUnhealthy({
  openaiApiKey,
  brand,
  productName,
  foodType,
  ingredientsFull,
  additivesAndChemicals,
  ingredientsText,
}) {
  const fullList = [
    ...asStringArray(ingredientsFull),
    ...asStringArray(additivesAndChemicals),
  ];
  const uniqueList = [...new Set(fullList.map((s) => s.trim()).filter(Boolean))];

  return openaiJson({
    openaiApiKey,
    temperature: 0,
    maxTokens: 1600,
    messages: [
      {
        role: "system",
        content: `You are a clean-label chemist. You are given a FULL ingredient + additives/chemicals list.
Go through EVERY item. Extract only the unhealthy / ultra-processed ones.
Rank each bad finding severity 1–10 (10 = worst: e.g. TBHQ, potassium bromate, BHA/BHT, artificial dyes, seed oils in junk food).
Coconut oil, olive oil, avocado oil, butter, salt, spices, whole foods are NOT unhealthy for this purpose.
Do not invent items that are not on the provided list.`,
      },
      {
        role: "user",
        content: `Brand: ${brand || "(unknown)"}
Product: ${productName || "(unknown)"}
Food type: ${foodType || "(unknown)"}

FULL INGREDIENTS LIST:
${uniqueList.length ? uniqueList.map((i, n) => `${n + 1}. ${i}`).join("\n") : "(empty)"}

ADDITIVES / CHEMICALS CALLED OUT:
${asStringArray(additivesAndChemicals).join(", ") || "(none listed separately)"}

LABEL TEXT:
${ingredientsText || "(none)"}

Go through the whole list. Extract unhealthy items and rank them.

Return ONLY JSON:
{
  "ranked_bad": [
    {
      "name": "soybean oil",
      "kind": "seed_oil",
      "severity": 7,
      "why": "industrial seed oil"
    }
  ],
  "seed_oils": ["soybean oil"],
  "additives": ["TBHQ"],
  "score": 28,
  "rating": "Avoid",
  "analysis_title": "Labely's Analysis",
  "analysis": "2-4 short sentences. Bold (**like this**) the worst ranked items. Base this on ranked_bad only.",
  "lawsuits_found": false,
  "lawsuit_summary": "No lawsuits found."
}

kind: one of seed_oil | preservative | color | sweetener | emulsifier | flavor_enhancer | additive | other
severity: 1 (mild concern) … 10 (severe)
seed_oils / additives: flat lists derived from ranked_bad (seed oils vs everything else)
If ranked_bad is empty → score 70–95 (Good/Great)
If any seed_oil → score ≤ 42
If seed_oil + harsh preservative/dye/sweetener → score ≤ 28
rating must match score bands.`,
      },
    ],
  });
}

function scoreFromRanked(ranked, seedOils, additives, modelScore) {
  const top = ranked[0]?.severity ?? 0;
  const harsh = ranked.some((r) => r.severity >= 8);
  const many = ranked.length >= 4;
  let score = hardenLabelyScore(modelScore, seedOils, additives);
  if (!ranked.length) {
    score = Math.max(score, 72);
  } else if (harsh || (seedOils.length && additives.length)) {
    score = Math.min(score, 28);
  } else if (top >= 7 || seedOils.length) {
    score = Math.min(score, 42);
  } else if (many || top >= 5) {
    score = Math.min(score, 55);
  }
  return score;
}

function buildAnalysisFromRanked(ranked, fallbackAnalysis) {
  if (!ranked.length) {
    return (
      String(fallbackAnalysis || "").trim() ||
      "No concerning additives or industrial seed oils stood out on the published ingredient list."
    );
  }
  const worst = ranked.slice(0, 3);
  const bolded = worst.map((r) => `**${r.name}**`).join(", ");
  const detail = worst
    .map((r) => `${r.name} (risk ${r.severity}/10${r.why ? `: ${r.why}` : ""})`)
    .join("; ");
  const base = String(fallbackAnalysis || "").trim();
  if (base && /\*\*/.test(base)) return base;
  return `Flagged from the full label scan: ${bolded}. Ranked concerns — ${detail}.`;
}

function buildResult(identity, listLookup, audit) {
  const ranked = asRankedFindings(audit?.ranked_bad);
  const seedOils = asStringArray(
    audit?.seed_oils?.length
      ? audit.seed_oils
      : ranked.filter((r) => r.kind === "seed_oil").map((r) => r.name)
  );
  const additives = asStringArray(
    audit?.additives?.length
      ? audit.additives
      : ranked.filter((r) => r.kind !== "seed_oil").map((r) => r.name)
  );

  const score = scoreFromRanked(ranked, seedOils, additives, audit?.score);
  const rating = ratingLabelFromScore(score);
  const lawsuitsFound = audit?.lawsuits_found === true;
  const lawsuitSummary = lawsuitsFound
    ? String(audit?.lawsuit_summary ?? "").trim() ||
      "Lawsuits found related to this product."
    : "No lawsuits found.";

  let analysisText = buildAnalysisFromRanked(ranked, audit?.analysis);
  if (lawsuitsFound && !/\blawsuit/i.test(analysisText)) {
    analysisText = `${analysisText} ${lawsuitSummary}`.trim();
  }

  const ingredientsText =
    String(listLookup?.ingredients_text || "").trim() ||
    asStringArray(listLookup?.ingredients_full).join(", ");

  return {
    name:
      String(identity?.product_name || identity?.name || "Product").trim() ||
      "Product",
    brand: String(identity?.brand ?? "").trim(),
    foodType: String(identity?.food_type || identity?.category || "").trim(),
    score,
    verdict: rating,
    analysisTitle:
      String(audit?.analysis_title ?? "").trim() || "Labely\u2019s Analysis",
    analysis: analysisText,
    labelyLegalNote: lawsuitSummary,
    lawsuitsFound,
    seedOils,
    additives,
    rankedBad: ranked,
    ingredientsSummary: ingredientsText,
    ingredientsFull: asStringArray(listLookup?.ingredients_full),
    additivesAndChemicals: asStringArray(listLookup?.additives_and_chemicals),
    confidence: Number(listLookup?.confidence) || 0,
    researchSource: "brand-food-full-list-audit",
  };
}

/**
 * ONLY pipeline:
 * 1) Identify brand + food type from photo
 * 2) Look up FULL ingredients + additives/chemicals list
 * 3) Walk whole list → extract unhealthy → rank each → score
 */
async function analyzePackagingImage({ imageDataUrl, openaiApiKey, uploadHint = "" }) {
  if (!openaiApiKey?.trim()) {
    throw new Error("OPENAI_API_KEY is not set in .env.local");
  }

  const identity = await identifyBrandAndFoodType({
    imageDataUrl,
    openaiApiKey,
    uploadHint,
  });

  const brand = String(identity?.brand ?? "").trim();
  const productName = String(identity?.product_name ?? identity?.name ?? "").trim();
  const foodType = String(identity?.food_type ?? "").trim();
  const category = String(identity?.category ?? "").trim();

  if (!brand && !productName) {
    throw new Error("Could not identify a brand or product from this photo.");
  }

  const listLookup = await lookupFullIngredientAndAdditiveList({
    openaiApiKey,
    brand,
    productName,
    foodType,
    category,
  });

  const audit = await extractAndRankUnhealthy({
    openaiApiKey,
    brand,
    productName,
    foodType: foodType || category,
    ingredientsFull: listLookup?.ingredients_full,
    additivesAndChemicals: listLookup?.additives_and_chemicals,
    ingredientsText: listLookup?.ingredients_text,
  });

  return buildResult(
    { brand, product_name: productName || "Product", food_type: foodType, category },
    listLookup,
    audit
  );
}

export async function POST(req) {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY?.trim() || "";
    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const imageDataUrl =
      typeof body.imageDataUrl === "string" ? body.imageDataUrl.trim() : "";
    const uploadHint = sanitizeUploadHint(body.uploadHint);

    if (!imageDataUrl) {
      return NextResponse.json(
        { error: "Upload a product photo (imageDataUrl is required)." },
        { status: 400 }
      );
    }

    const analyzed = await analyzePackagingImage({
      imageDataUrl,
      openaiApiKey,
      uploadHint,
    });

    return NextResponse.json({
      name: analyzed.name,
      brand: analyzed.brand,
      foodType: analyzed.foodType,
      score: analyzed.score,
      verdict: analyzed.verdict,
      analysisTitle: analyzed.analysisTitle,
      analysis: analyzed.analysis,
      labelyLegalNote: analyzed.labelyLegalNote,
      lawsuitsFound: analyzed.lawsuitsFound,
      seedOils: analyzed.seedOils,
      additives: analyzed.additives,
      rankedBad: analyzed.rankedBad,
      ingredientsSummary: analyzed.ingredientsSummary,
      ingredientsFull: analyzed.ingredientsFull,
      additivesAndChemicals: analyzed.additivesAndChemicals,
      confidence: analyzed.confidence,
      ingredientsSource: analyzed.researchSource,
    });
  } catch (err) {
    console.error("[labely]", err);
    return NextResponse.json(
      { error: err?.message || "Unknown server error" },
      { status: 500 }
    );
  }
}
