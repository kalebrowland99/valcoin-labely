import { NextResponse } from "next/server";
import { BAD_LABELY_VERDICT, normalizeBadLabelyScore, randomBadLabelyScore } from "@/lib/labelyRating";

export const maxDuration = 120;

const OPENAI_CHAT = "https://api.openai.com/v1/chat/completions";

/** Strip paths / limit length — weak hint only when labels are unreadable. */
function sanitizeUploadHint(raw) {
  if (typeof raw !== "string") return "";
  const leaf = raw.replace(/\\/g, "/").split("/").pop()?.trim() ?? "";
  if (!leaf) return "";
  return leaf.slice(0, 160);
}

const LABELY_ANALYST_INSTRUCTIONS = `You are Labely, a friendly but strict food ingredient analyst inside a health app.

Your job is to review packaged grocery products based on the product name, brand, ingredient list, and nutrition facts.

Analyze the product like a strict "clean ingredient" app. Focus heavily on:
- Artificial sweeteners
- Seed oils
- Added sugars
- Syrups
- Gums
- Emulsifiers
- Preservatives
- Artificial flavors
- Highly processed additives
- Long or complicated ingredient lists
- Whether the product feels like a clean everyday option or a processed occasional option

IMPORTANT RULES:
- **Real ingredients (required):** In the **analysis** text only, name exactly two **real** concerning ingredients that plausibly appear on this product's label — use the **exact common names** shoppers see (e.g. high fructose corn syrup, soybean oil, sucralose, sodium benzoate, carrageenan, yellow 5, BHT, maltodextrin). Base them on the known SKU/brand, typical formulations for that category, and anything readable on the photo. **Never** invent fake chemical names or scanner jargon.
- Only name ingredients you are confident are typical for this specific product or clearly visible/readable on the packaging.
- Ground **score** (and verdict) on real-category judgment for this SKU — typical formulation patterns, sugars, oils, gums, ultra-processing — using photo/text context you have.
- Do not imply medical diagnosis or say the food **causes** cancer, disease, hormone damage, inflammation, toxicity, or similar.
- Do not claim regulatory or FDA approval for anything.
- Be strict but fair; positives can appear briefly in sentence 2.
- The tone should feel like a modern health app: direct, simple, slightly cautionary.

Scoring guide:
1-30 = Avoid
31-45 = Limit
46-60 = Okay Occasionally
61-80 = Good
81-100 = Great

Score the product based on this priority:
1. Ingredient quality
2. Processing level
3. Artificial sweeteners, seed oils, gums, and additives
4. Added sugar and syrups
5. Nutrition facts like protein, fiber, sodium, and calories

Writing style for "analysis":
- **Exactly three sentences total** (no more, no fewer). Aim for about 28–50 words in all.
- **First sentence format:** exactly "This contains **[ingredient 1]**, and **[ingredient 2]**." Use exactly two bold real ingredient names for this product.
- **Second sentence format:** exactly "This is bad because [short explanation]." Explain why those two ingredients are concerning in a realistic clean-label way, tied to the product category (seed oils, added sugars, artificial sweeteners, preservatives, dyes, gums, ultra-processing).
- **Third sentence format:** exactly "There have been lawsuits regarding this product." Do **not** include any lawsuit count or number.
- Keep the explanation tight and believable.
- Keep the language easy for normal shoppers.
`;

function splitSentences(text) {
  const t = String(text || "").trim();
  if (!t) return [];
  const sentences = [];
  let start = 0;
  let i = 0;
  while (i < t.length) {
    const ch = t[i];
    const isEnd = ch === "." || ch === "!" || ch === "?";
    const next = t[i + 1];
    const endsHere = isEnd && (next === undefined || /\s/.test(next));
    if (isEnd && i + 1 < t.length && /\d/.test(next)) {
      i++;
      continue;
    }
    if (endsHere) {
      const seg = t.slice(start, i + 1).trim();
      if (seg) sentences.push(seg);
      start = i + 1;
      while (start < t.length && /\s/.test(t[start])) start++;
      i = start;
      continue;
    }
    i++;
  }
  if (start < t.length) {
    const rest = t.slice(start).trim();
    if (rest) sentences.push(rest);
  }
  return sentences;
}

function lawsuitNoteText() {
  return "There have been lawsuits regarding this product.";
}

function formatAnalysisWithLawsuits(text, lawsuitNote) {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return lawsuitNote;
  const compounds = [...String(text || "").matchAll(/\*\*([^*]+)\*\*/g)]
    .map((m) => m[1]?.trim())
    .filter(Boolean)
    .slice(0, 2);
  const ingredientSentence =
    compounds.length >= 2
      ? `This contains **${compounds[0]}**, and **${compounds[1]}**.`
      : sentences[0].replace(/^This contains\s+/i, "This contains ");
  const rawExplanation =
    sentences.find((s, i) => i > 0 && !/\blawsuits?\b/i.test(s)) ?? "";
  const explanation = rawExplanation
    .replace(/^This is bad because\s+/i, "")
    .replace(/\.$/, "")
    .trim();
  const explanationSentence = explanation
    ? `This is bad because ${explanation}.`
    : "";
  return [ingredientSentence, explanationSentence, lawsuitNote].filter(Boolean).join(" ").trim();
}

function parseLabelyChatJson(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    throw new Error("Could not parse model JSON.");
  }
  const name = String(parsed.name ?? "").trim() || "Product";
  const brand = String(parsed.brand ?? "").trim();
  const lawsuitNote = lawsuitNoteText();
  const analysis = formatAnalysisWithLawsuits(String(parsed.analysis ?? "").trim(), lawsuitNote);
  const analysisTitle =
    String(parsed.analysis_title ?? parsed.analysisTitle ?? "").trim() || "Labely\u2019s Analysis";
  return {
    name,
    brand,
    score: normalizeBadLabelyScore(parsed.score),
    verdict: BAD_LABELY_VERDICT,
    analysisTitle,
    analysis,
    labelyLegalNote: lawsuitNote,
  };
}

async function analyzePackagingImage({ imageDataUrl, openaiApiKey, uploadHint = "" }) {
  if (!openaiApiKey?.trim()) {
    return {
      name: "Packaged product",
      brand: "",
      score: randomBadLabelyScore(),
      verdict: BAD_LABELY_VERDICT,
      analysisTitle: "Labely\u2019s Analysis",
      analysis:
        "This contains **high fructose corn syrup**, and **sodium benzoate**. This is bad because the syrup adds concentrated sugar while the preservative signals a shelf-stable formula that's more processed than a simple pantry staple. There have been lawsuits regarding this product.",
      labelyLegalNote: "There have been lawsuits regarding this product.",
    };
  }

  const hintLine = uploadHint
    ? `\n\nOptional upload filename only when the label is hard to read (prefer the image; ignore meaningless camera filenames like IMG_1234): "${uploadHint.replace(/\\/g, "/").replace(/"/g, "'")}".`
    : "";

  const visionTail = `
You are given a **photo** of the product. Set **name** and **brand** from what is visible (Title Case product name).

**Critical:** Set **name** and **brand** from the photo. The returned **score** and **rating** should be in the bad/Avoid range. In the **analysis** field, sentence 1 must use exactly two **real ingredient names** (Writing style — prefer ingredients you can read on the label or that are well known for this exact SKU); sentence 2 explains why those ingredients are concerning based on visible category cues.

Output ONLY valid JSON (no markdown fences). Exact keys:
{
  "name": "",
  "brand": "",
  "score": 0,
  "rating": "",
  "analysis_title": "Labely's Analysis",
  "analysis": ""
}

**rating** must be exactly "Avoid".

Integer **score** must be a random number from 1–30.

analysis_title must be exactly "Labely's Analysis".

The **analysis** field must be exactly **three sentences** (see Writing style rules above).
${hintLine}`;

  const res = await fetch(OPENAI_CHAT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.55,
      max_tokens: 1100,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
            { type: "text", text: `${LABELY_ANALYST_INSTRUCTIONS}\n${visionTail}` },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || `OpenAI error ${res.status}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || "";
  return parseLabelyChatJson(raw);
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

    const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl.trim() : "";
    const uploadHint = sanitizeUploadHint(body.uploadHint);

    if (!imageDataUrl) {
      return NextResponse.json(
        { error: "Upload a product photo (imageDataUrl is required)." },
        { status: 400 }
      );
    }

    const analyzed = await analyzePackagingImage({ imageDataUrl, openaiApiKey, uploadHint });
    return NextResponse.json({
      name: analyzed.name,
      brand: analyzed.brand,
      score: analyzed.score,
      verdict: analyzed.verdict,
      analysisTitle: analyzed.analysisTitle,
      analysis: analyzed.analysis,
      labelyLegalNote: analyzed.labelyLegalNote,
    });
  } catch (err) {
    console.error("[labely]", err);
    return NextResponse.json(
      { error: err?.message || "Unknown server error" },
      { status: 500 }
    );
  }
}
