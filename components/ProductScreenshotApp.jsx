"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { getFontEmbedCSS, toPng } from "html-to-image";
import LabelySlide from "@/components/slides/LabelySlide";
import ThriftySlide from "@/components/slides/ThriftySlide";
import {
  fileToDisplayableDataUrl,
  isLikelyRasterImageFile,
  IMAGE_FILE_ACCEPT,
} from "@/lib/fileToDisplayableDataUrl";
import { waitForPreviewPaint } from "@/lib/waitForPreviewPaint";
import { clampLabelyScore, BAD_LABELY_SCORE, BAD_LABELY_VERDICT } from "@/lib/labelyRating";
import {
  pickValuableUSCoin,
  autoSoldListings,
  fallbackCoinPrices,
} from "@/lib/valuableUsCoins";

const PREVIEW_SCALE = 0.35; // 1080×1920 preview in the browser
const EXPORT_ROOT_ID = "product-screenshot-root";

function emptyLabelySlot() {
  return {
    imageUrl: null,
    itemName: "",
    labelyBrand: "",
    labelyScore: BAD_LABELY_SCORE,
    labelyVerdict: BAD_LABELY_VERDICT,
    labelyAnalysis: "",
    labelyAnalysisTitle: "Labely's Analysis",
    labelyLegalNote: "No lawsuits found.",
    spentPrice: "",
    soldPrice: "",
    date: "",
    matchItems: [
      { title: "", source: "eBay", price: "", inStock: false },
      { title: "", source: "Poshmark", price: "", inStock: false },
    ],
  };
}

function emptyValcoinSlot() {
  return {
    imageUrl: null,
    itemName: "",
    spentPrice: "",
    soldPrice: "",
    date: new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    matchItems: [
      { title: "", source: "eBay", price: "", inStock: false },
      { title: "", source: "Heritage Auctions", price: "", inStock: false },
    ],
  };
}

async function waitForImagesDecoded(root) {
  const imgs = Array.from(root?.querySelectorAll?.("img") || []);
  await Promise.all(
    imgs.map(
      (img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              img.addEventListener("load", resolve, { once: true });
              img.addEventListener("error", resolve, { once: true });
            })
    )
  );
}

async function simplifyCoinTitle(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  try {
    const res = await fetch("/api/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "coinTitle", text }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const title = String(data?.title ?? "").trim();
    return title && !/^\d+$/.test(title) ? title : null;
  } catch {
    return null;
  }
}

async function coinPrices(coinName) {
  const name = String(coinName ?? "").trim();
  if (!name) return null;
  try {
    const res = await fetch("/api/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "coinPrices", text: name }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.buy || !data?.sell) return null;
    return { spentPrice: String(data.buy), soldPrice: String(data.sell) };
  } catch {
    return null;
  }
}

/** Turn a file name into a rough coin title hint when possible. */
function titleHintFromFileName(name) {
  const base = String(name || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!base || /^img[_\s-]?\d+/i.test(base) || /^DSC/i.test(base) || /^\d+$/.test(base)) {
    return "";
  }
  return base.slice(0, 120);
}

export default function ProductScreenshotApp() {
  const [brand, setBrand] = useState("labely"); // "labely" | "valcoin"
  const [slot, setSlot] = useState(emptyLabelySlot);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const config = useMemo(
    () => ({
      appId: brand,
      outputFormat: brand === "labely" ? "labelyOnly" : "appOnly",
      jitterSeed: 1,
    }),
    [brand]
  );

  const switchBrand = useCallback((next) => {
    setBrand(next);
    setSlot(next === "labely" ? emptyLabelySlot() : emptyValcoinSlot());
    setError("");
    setStatus("");
  }, []);

  const analyzeLabely = useCallback(async (imageDataUrl, uploadHint) => {
    const res = await fetch("/api/labely", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageDataUrl,
        ...(uploadHint ? { uploadHint } : {}),
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || "Labely analysis failed");
    setSlot({
      ...emptyLabelySlot(),
      imageUrl: imageDataUrl,
      itemName: json.name || "Product",
      labelyBrand: json.brand || "",
      labelyScore: clampLabelyScore(json.score ?? BAD_LABELY_SCORE),
      labelyVerdict: BAD_LABELY_VERDICT,
      labelyAnalysis: json.analysis || "",
      labelyAnalysisTitle: json.analysisTitle || "Labely's Analysis",
      labelyLegalNote: json.labelyLegalNote?.trim() || "No lawsuits found.",
    });
  }, []);

  const analyzeValcoin = useCallback(async (imageDataUrl, fileName) => {
    setStatus("Identifying coin…");
    let title = "";
    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "coinIdentify", imageUrl: imageDataUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        title = String(data?.title ?? "").trim();
      }
    } catch {
      /* fall through */
    }
    if (!title) {
      const hint = titleHintFromFileName(fileName) || pickValuableUSCoin();
      title = (await simplifyCoinTitle(hint)) ?? hint;
    }
    title = title.trim() || pickValuableUSCoin();
    setStatus("Estimating listing prices…");
    const prices = (await coinPrices(title)) ?? fallbackCoinPrices();
    setSlot({
      ...emptyValcoinSlot(),
      imageUrl: imageDataUrl,
      itemName: title,
      spentPrice: prices.spentPrice,
      soldPrice: prices.soldPrice,
      matchItems: autoSoldListings(title, prices.soldPrice),
    });
  }, []);

  const onPickFile = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!isLikelyRasterImageFile(file)) {
        setError("Please choose a JPEG, PNG, WEBP, or HEIC photo.");
        return;
      }
      setBusy(true);
      setError("");
      setStatus("Reading photo…");
      try {
        const dataUrl = await fileToDisplayableDataUrl(file);
        if (brand === "labely") {
          setStatus("Analyzing packaging…");
          await analyzeLabely(dataUrl, file.name);
        } else {
          await analyzeValcoin(dataUrl, file.name);
        }
        setStatus("Ready — download your screenshot.");
      } catch (err) {
        console.error("[product-screenshot]", err);
        setError(err?.message || "Could not process this photo.");
        setStatus("");
      } finally {
        setBusy(false);
      }
    },
    [analyzeLabely, analyzeValcoin, brand]
  );

  const downloadPng = useCallback(async () => {
    if (!slot.imageUrl) {
      setError("Upload a photo first.");
      return;
    }
    setExporting(true);
    setError("");
    setStatus("Capturing screenshot…");
    try {
      const el = document.getElementById(EXPORT_ROOT_ID);
      if (!el) throw new Error("Preview not ready");
      await waitForPreviewPaint({ rootId: EXPORT_ROOT_ID });
      await waitForImagesDecoded(el);
      if (document.fonts?.ready) await document.fonts.ready;
      const fontEmbedCSS = await getFontEmbedCSS(el);
      const dataUrl = await toPng(el, {
        backgroundColor: brand === "labely" ? "#F4F0E6" : "#ffffff",
        pixelRatio: 1 / PREVIEW_SCALE,
        cacheBust: false,
        includeQueryParams: false,
        ...(fontEmbedCSS ? { fontEmbedCSS } : {}),
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${brand}-screenshot-${Date.now()}.png`;
      a.click();
      setStatus("Downloaded.");
    } catch (err) {
      console.error("[product-screenshot] export failed", err);
      setError(err?.message || "Screenshot export failed.");
      setStatus("");
    } finally {
      setExporting(false);
    }
  }, [brand, slot.imageUrl]);

  const hasResult = Boolean(slot.imageUrl && (slot.itemName || slot.labelyAnalysis));

  return (
    <div className="min-h-screen bg-[#f6f4ef] text-[#1a1a1a]">
      <header className="border-b border-black/8 bg-[#faf8f4]/
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8a7a68]">
              Product screenshots
            </p>
            <h1 className="text-[22px] font-semibold tracking-tight">
              Labely & Valcoin
            </h1>
          </div>
          <div className="inline-flex rounded-full border border-black/10 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => switchBrand("labely")}
              className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition ${
                brand === "labely"
                  ? "bg-[#2F5A41] text-[#F6F2E9]"
                  : "text-[#5c5c5c] hover:bg-black/4"
              }`}
            >
              Labely
            </button>
            <button
              type="button"
              onClick={() => switchBrand("valcoin")}
              className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition ${
                brand === "valcoin"
                  ? "bg-[#7B4F2E] text-[#F6F2E9]"
                  : "text-[#5c5c5c] hover:bg-black/4"
              }`}
            >
              Valcoin
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <section className="rounded-2xl border border-black/8 bg-white p-6 shadow-[0_10px_40px_rgba(60,40,20,0.06)]">
          <h2 className="text-[18px] font-semibold tracking-tight">
            {brand === "labely" ? "Upload a food or drink pack shot" : "Upload a coin photo"}
          </h2>
          <p className="mt-2 max-w-prose text-[14px] leading-relaxed text-[#5c5c5c]">
            {brand === "labely"
              ? "We read the packaging, fill a Labely product card, and you download a 1080×1920 PNG screenshot."
              : "We fill a Valcoin product card (title, prices, sold listings) and you download a 1080×1920 PNG screenshot."}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy || exporting}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-full bg-[#1a1a1a] px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Working…" : "Choose photo"}
            </button>
            <button
              type="button"
              disabled={!hasResult || busy || exporting}
              onClick={() => void downloadPng()}
              className="rounded-full border border-black/15 bg-white px-5 py-2.5 text-[14px] font-semibold text-[#1a1a1a] disabled:opacity-40"
            >
              {exporting ? "Exporting…" : "Download screenshot"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={IMAGE_FILE_ACCEPT}
              className="hidden"
              onChange={(e) => void onPickFile(e)}
            />
          </div>

          {status ? (
            <p className="mt-4 text-[13px] font-medium text-[#2F5A41]">{status}</p>
          ) : null}
          {error ? (
            <p className="mt-4 text-[13px] font-medium text-[#b23a2d]">{error}</p>
          ) : null}

          <p className="mt-6 text-[12px] leading-relaxed text-[#8e8e93]">
            Requires <code className="rounded bg-black/5 px-1">OPENAI_API_KEY</code> in{" "}
            <code className="rounded bg-black/5 px-1">.env.local</code>.
          </p>
        </section>

        <section className="justify-self-center">
          <div
            className="overflow-hidden rounded-[28px] border border-black/10 bg-black shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
            style={{
              width: Math.round(1080 * PREVIEW_SCALE),
              height: Math.round(1920 * PREVIEW_SCALE),
            }}
          >
            <div
              id={EXPORT_ROOT_ID}
              style={{
                width: 1080,
                height: 1920,
                transform: `scale(${PREVIEW_SCALE})`,
                transformOrigin: "top left",
              }}
            >
              {brand === "labely" ? (
                <LabelySlide slot={slot} S={1} config={config} itemIndex={0} />
              ) : (
                <ThriftySlide slot={slot} S={1} config={config} />
              )}
            </div>
          </div>
          <p className="mt-3 text-center text-[12px] text-[#8e8e93]">
            Preview · export is full 1080×1920
          </p>
        </section>
      </main>
    </div>
  );
}
