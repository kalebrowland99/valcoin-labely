import { NextResponse } from "next/server";

const OPENAI_CHAT = "https://api.openai.com/v1/chat/completions";

/** Turn noisy titles / filenames into short collector-friendly US coin names. */
async function simplifyCoinTitleWithOpenAI({ rawTitle, openaiApiKey }) {
  if (!openaiApiKey?.trim()) {
    return { error: "OpenAI API key is not configured on the server.", status: 500 };
  }
  const raw = String(rawTitle ?? "").trim();
  if (!raw) return { error: "Empty title.", status: 400 };

  const res = await fetch(OPENAI_CHAT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `You clean up coin photo titles into short US coin names for a collector app.

Raw title (from filename / catalog):
${raw}

Return ONLY JSON (no markdown):
{"title": "1909-S VDB Lincoln Cent"}

Rules:
- 3–8 words, Title Case, United States coins only
- Include year and mint mark when present or inferable
- Include denomination and series (e.g. Morgan Dollar, Buffalo Nickel, Washington Quarter)
- If the raw title is only numbers or gibberish, infer a plausible US collector coin — never return only digits
- Never return "Unknown"
- Drop: obverse/reverse, photographer, museum IDs, file extensions
- If the raw title is already clear, shorten it slightly but keep the same coin`,
        },
      ],
      temperature: 0.4,
      max_tokens: 60,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { error: data?.error?.message || `OpenAI error ${res.status}`, status: res.status };
  }

  const data = await res.json();
  const out = data.choices?.[0]?.message?.content?.trim() || "";
  try {
    const parsed = JSON.parse(out.replace(/```json|```/g, "").trim());
    const title = String(parsed.title ?? "").trim().replace(/^["']|["']$/g, "");
    if (!title || /^\d+$/.test(title)) {
      return { error: "Invalid simplified title.", status: 502 };
    }
    return { title };
  } catch {
    return { error: "Could not parse simplified coin title.", status: 502 };
  }
}

async function coinPricesWithOpenAI({ coinName, openaiApiKey }) {
  if (!openaiApiKey?.trim()) {
    return { error: "OpenAI API key is not configured on the server.", status: 500 };
  }
  const res = await fetch(OPENAI_CHAT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `You estimate realistic US coin prices for collectors.\n\nCoin: ${coinName}\n\nReturn ONLY JSON (no markdown, no explanation) in this shape:\n{"buy": 120, "sell": 180}\n\nRules:\n- buy = what someone might realistically pay at a show/online to acquire it (USD integer)\n- sell = realistic resale / market value to a collector (USD integer)\n- sell must be >= buy\n- Be conservative unless the coin is truly famous\n- If uncertain, return reasonable mid-market estimates rather than refusing.`,
        },
      ],
      temperature: 0.6,
      max_tokens: 80,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { error: data?.error?.message || `OpenAI error ${res.status}`, status: res.status };
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || "";
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    const buy = Math.round(Number(parsed.buy));
    const sell = Math.round(Number(parsed.sell));
    if (!Number.isFinite(buy) || !Number.isFinite(sell) || buy <= 0 || sell <= 0) {
      return { error: "Invalid coin price response.", status: 502 };
    }
    return { buy: String(buy), sell: String(Math.max(sell, buy)) };
  } catch {
    return { error: "Could not parse OpenAI coin price response.", status: 502 };
  }
}

/** Identify a coin from an uploaded photo. */
async function identifyCoinFromImage({ imageUrl, openaiApiKey }) {
  if (!openaiApiKey?.trim()) {
    return { error: "OpenAI API key is not configured on the server.", status: 500 };
  }
  if (!imageUrl) return { error: "imageUrl required.", status: 400 };

  const res = await fetch(OPENAI_CHAT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
            {
              type: "text",
              text: `Identify this US coin from the photo for a collector app.

Return ONLY JSON (no markdown):
{"title": "1909-S VDB Lincoln Cent"}

Rules:
- 3–8 words, Title Case
- Prefer year + mint mark + series when readable
- If uncertain, give the best guess of a real US coin that matches denomination/design
- Never return "Unknown" or only digits`,
            },
          ],
        },
      ],
      temperature: 0.3,
      max_tokens: 60,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { error: data?.error?.message || `OpenAI error ${res.status}`, status: res.status };
  }

  const data = await res.json();
  const out = data.choices?.[0]?.message?.content?.trim() || "";
  try {
    const parsed = JSON.parse(out.replace(/```json|```/g, "").trim());
    const title = String(parsed.title ?? "").trim().replace(/^["']|["']$/g, "");
    if (!title || /^\d+$/.test(title)) {
      return { error: "Invalid coin identification.", status: 502 };
    }
    return { title };
  } catch {
    return { error: "Could not parse coin identification.", status: 502 };
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { action = "", imageUrl, text } = body;
    const openaiApiKey = process.env.OPENAI_API_KEY?.trim() || "";

    if (action === "coinIdentify") {
      const result = await identifyCoinFromImage({ imageUrl, openaiApiKey });
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
      }
      return NextResponse.json({ title: result.title });
    }

    if (action === "coinTitle") {
      const result = await simplifyCoinTitleWithOpenAI({
        rawTitle: String(text ?? "").trim(),
        openaiApiKey,
      });
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
      }
      return NextResponse.json({ title: result.title });
    }

    if (action === "coinPrices") {
      const result = await coinPricesWithOpenAI({
        coinName: String(text ?? "").trim(),
        openaiApiKey,
      });
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
      }
      return NextResponse.json({ buy: result.buy, sell: result.sell });
    }

    return NextResponse.json(
      { error: "Unknown action. Use coinIdentify, coinTitle, or coinPrices." },
      { status: 400 }
    );
  } catch (err) {
    console.error("[generate-image]", err);
    return NextResponse.json({ error: err.message || "Unknown server error" }, { status: 500 });
  }
}
