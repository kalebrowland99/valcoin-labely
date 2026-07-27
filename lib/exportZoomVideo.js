import {
  scheduleScoreStinger,
  scheduleScanSfx,
  scheduleCantProveIt,
  scheduleVineBoom,
  isGoodLabelyScore,
} from "@/lib/scoreSounds";
import { drawScanTourFrame } from "@/lib/labelyScanExport";

const W = 1080;
const H = 1920;
const FPS = 30;
const DURATION_SEC = 5;
const SCAN_SEC = 1.05;
const REVEAL_SEC = 0.4;
const BOOM_SEC = 1.5; // bad only — last 1.5s of video
const DOG_MEME_URLS = [
  "/memes/side-eye-dog.png",
  "/memes/walter-dog.png",
  "/memes/bliss-dog.png",
  "/memes/hoodie-dog.png",
];

function pickDogMemeUrl() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return DOG_MEME_URLS[buf[0] % DOG_MEME_URLS.length];
  }
  return DOG_MEME_URLS[Math.floor(Math.random() * DOG_MEME_URLS.length)];
}
const START_SCALE = 1;
const END_SCALE = 1.12;
const BLINK_HZ = 2.4;

/** Important callout regions in 1080×1920 frame space. */
const HIGHLIGHTS = {
  labely: { cx: 520, cy: 490, r: 135 },
  valcoin: { cx: 540, cy: 1020, r: 155 },
};

function highlightForBrand(brand) {
  return HIGHLIGHTS[brand] || HIGHLIGHTS.labely;
}

function zoomProgress(t) {
  return Math.min(1, Math.max(0, t));
}

function drawBlinkCircle(ctx, { cx, cy, r, scale, sx, sy, timeSec }) {
  const screenX = (cx - sx) * scale;
  const screenY = (cy - sy) * scale;
  const screenR = r * scale;
  const pulse = 0.5 + 0.5 * Math.sin(timeSec * Math.PI * 2 * BLINK_HZ);
  if (pulse <= 0.28) return;

  const alpha = 0.55 + 0.45 * pulse;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "#FF1F1F";
  ctx.lineWidth = Math.max(8, 11 * scale);
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(255, 40, 40, 0.55)";
  ctx.shadowBlur = 14 * scale;
  ctx.beginPath();
  ctx.arc(screenX, screenY, screenR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Dog meme overlaid on the lower half of the (already-drawn) result frame. */
function drawDogLowerHalf(ctx, dogImg) {
  if (!dogImg?.width) return;

  // Crop a thin baked-in black frame off the meme assets
  const insetX = Math.max(2, Math.round(dogImg.width * 0.018));
  const insetY = Math.max(2, Math.round(dogImg.height * 0.018));
  const srcW = dogImg.width - insetX * 2;
  const srcH = dogImg.height - insetY * 2;
  if (srcW < 8 || srcH < 8) return;

  const maxW = W * 0.88;
  const maxH = H * 0.42;
  const scale = Math.min(maxW / srcW, maxH / srcH);
  const dogW = Math.round(srcW * scale);
  const dogH = Math.round(srcH * scale);
  const dogX = Math.round((W - dogW) / 2);
  const dogY = Math.round(H * 0.55 + (H * 0.42 - dogH) / 2);

  ctx.drawImage(dogImg, insetX, insetY, srcW, srcH, dogX, dogY, dogW, dogH);
}

function pickMimeType() {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1.4d002a,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "";
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const s = String(src || "").trim();
    if (!s) {
      reject(new Error("Missing image"));
      return;
    }
    const img = new Image();
    if (!s.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = s;
  });
}

async function loadImageOptional(src) {
  try {
    return await loadImage(src);
  } catch {
    return null;
  }
}

/** @type {import("@ffmpeg/ffmpeg").FFmpeg | null} */
let ffmpegInstance = null;
/** @type {Promise<import("@ffmpeg/ffmpeg").FFmpeg> | null} */
let ffmpegLoading = null;

async function getFFmpeg(onProgress) {
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoading) return ffmpegLoading;

  ffmpegLoading = (async () => {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");
    const ffmpeg = new FFmpeg();
    ffmpeg.on("progress", ({ progress }) => {
      onProgress?.(Math.round(Math.min(1, Math.max(0, progress)) * 100), "encoding");
    });
    const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  try {
    return await ffmpegLoading;
  } catch (err) {
    ffmpegLoading = null;
    throw err;
  }
}

async function webmToMp4(webmBlob, onProgress) {
  const { fetchFile } = await import("@ffmpeg/util");
  const ffmpeg = await getFFmpeg(onProgress);
  onProgress?.(0, "encoding");

  await ffmpeg.writeFile("input.webm", await fetchFile(webmBlob));
  await ffmpeg.exec([
    "-i",
    "input.webm",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    "output.mp4",
  ]);
  const data = await ffmpeg.readFile("output.mp4");
  await ffmpeg.deleteFile("input.webm").catch(() => {});
  await ffmpeg.deleteFile("output.mp4").catch(() => {});
  onProgress?.(100, "encoding");
  return new Blob([data], { type: "video/mp4" });
}

function renderHoldZoomFrame(ctx, resultImg, brand, highlight, holdT, holdTimeSec) {
  const progress = zoomProgress(holdT);
  const scale = START_SCALE + (END_SCALE - START_SCALE) * progress;
  const sw = W / scale;
  const sh = H / scale;
  const sx = (W - sw) / 2;
  const sy = (H - sh) / 2;

  ctx.fillStyle = brand === "valcoin" ? "#ffffff" : "#F4F0E6";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(resultImg, sx, sy, sw, sh, 0, 0, W, H);
  drawBlinkCircle(ctx, {
    cx: highlight.cx,
    cy: highlight.cy,
    r: highlight.r,
    scale,
    sx,
    sy,
    timeSec: holdTimeSec,
  });
}

/**
 * Scan → slide-up → hold (zoom/blink) → bad: last 1.5s vine-boom flag sting.
 * Total ~5s. Returns MP4.
 *
 * @param {{
 *   frameDataUrl: string,
 *   productImageUrl?: string,
 *   score: number,
 *   brand?: "labely" | "valcoin",
 *   analysisTitle?: string,
 *   analysisText?: string,
 *   muteEffects?: boolean,
 *   onProgress?: (pct: number, phase?: "recording" | "encoding", cueLabel?: string) => void,
 * }} opts
 * @returns {Promise<Blob>}
 */
export async function exportZoomVideo({
  frameDataUrl,
  productImageUrl,
  score,
  brand = "labely",
  seedOils = [],
  additives = [],
  analysisTitle = "Labely's Analysis",
  analysisText = "",
  muteEffects = false,
  onProgress,
}) {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Video export is not supported in this browser.");
  }

  const mimeType = pickMimeType();
  if (!mimeType) {
    throw new Error("No supported video format (try Chrome or Edge).");
  }

  const highlight = highlightForBrand(brand);
  const good = isGoodLabelyScore(score);
  void seedOils;
  void additives;
  void analysisTitle;
  void analysisText;
  const useEffects = !muteEffects;
  const boomSec = good || !useEffects ? 0 : BOOM_SEC;
  const holdSec = Math.max(0.45, DURATION_SEC - SCAN_SEC - REVEAL_SEC - boomSec);

  const resultImg = await loadImage(frameDataUrl);
  const productImg =
    (await loadImageOptional(productImageUrl || "")) || resultImg;
  const dogImg =
    useEffects && !good ? await loadImageOptional(pickDogMemeUrl()) : null;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas");

  const canvasStream = canvas.captureStream(FPS);
  const audioCtx = useEffects ? new AudioContext() : null;
  const dest = audioCtx ? audioCtx.createMediaStreamDestination() : null;
  const soundStart = SCAN_SEC;

  const combined = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...(dest ? dest.stream.getAudioTracks() : []),
  ]);

  const chunks = [];
  const recorder = new MediaRecorder(combined, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });

  const done = new Promise((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data?.size) chunks.push(e.data);
    };
    recorder.onerror = () => reject(new Error("MediaRecorder failed"));
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType.split(";")[0] || "video/webm" }));
    };
  });

  recorder.start(100);

  let stingerLabel = useEffects ? "" : "silent";
  let vineBoomDur = 0;
  let vineBoomStarted = false;

  if (useEffects && audioCtx && dest) {
    const t0 = audioCtx.currentTime;

    await scheduleScanSfx(audioCtx, dest, {
      when: t0,
      durationSec: SCAN_SEC,
    });

    const stinger = await scheduleScoreStinger(audioCtx, dest, {
      good,
      when: t0 + soundStart,
      // Keep playing through the dog/meme sting — don't cut at boom
      maxDuration: Math.max(0.1, DURATION_SEC - soundStart),
    });
    stingerLabel = stinger.label;
    const stingerDur = stinger.duration;

    // Duck only under scan SFX + punchline — keep bed audio through dog meme
    const duckWindows = good
      ? []
      : [{ start: 0, end: Math.min(DURATION_SEC, soundStart + stingerDur) }];

    await scheduleCantProveIt(audioCtx, dest, {
      when: t0,
      durationSec: good ? SCAN_SEC : DURATION_SEC,
      duckWindows,
    });
  }

  onProgress?.(0, "recording", stingerLabel);

  const scanFrames = Math.max(12, Math.round(SCAN_SEC * FPS));
  const revealFrames = Math.max(10, Math.round(REVEAL_SEC * FPS));
  const holdFrames = Math.max(12, Math.round(holdSec * FPS));
  const boomFrames = boomSec > 0 ? Math.max(1, Math.round(BOOM_SEC * FPS)) : 0;
  const totalFrames = scanFrames + revealFrames + holdFrames + boomFrames;
  const frameInterval = 1000 / FPS;
  const boomFrameStart = scanFrames + revealFrames + holdFrames;

  await new Promise((resolve) => {
    let frame = 0;
    const tick = () => {
      if (frame < scanFrames) {
        const t = scanFrames <= 1 ? 1 : frame / (scanFrames - 1);
        drawScanTourFrame(ctx, {
          phase: "scan",
          t,
          productImg,
          resultImg,
          w: W,
          h: H,
        });
      } else if (frame < scanFrames + revealFrames) {
        const i = frame - scanFrames;
        const t = revealFrames <= 1 ? 1 : i / (revealFrames - 1);
        drawScanTourFrame(ctx, {
          phase: "reveal",
          t,
          productImg,
          resultImg,
          w: W,
          h: H,
        });
      } else if (frame < boomFrameStart) {
        const i = frame - scanFrames - revealFrames;
        const holdT = holdFrames <= 1 ? 1 : i / (holdFrames - 1);
        renderHoldZoomFrame(ctx, resultImg, brand, highlight, holdT, i / FPS);
      } else {
        // Dog appears → fire vine boom at 0:03 of the sample immediately
        if (useEffects && !good && !vineBoomStarted && audioCtx && dest) {
          vineBoomStarted = true;
          void scheduleVineBoom(audioCtx, dest, {
            when: audioCtx.currentTime,
            durationSec: 1.25,
          }).then((d) => {
            vineBoomDur = d;
          });
        }
        renderHoldZoomFrame(ctx, resultImg, brand, highlight, 1, holdFrames / FPS);
        if (useEffects) drawDogLowerHalf(ctx, dogImg);
      }

      onProgress?.(Math.round((frame / totalFrames) * 100), "recording", stingerLabel);
      frame += 1;
      if (frame >= totalFrames) {
        resolve();
        return;
      }
      setTimeout(tick, frameInterval);
    };
    tick();
  });

  // Hold last frame so vine boom isn't chopped by MediaRecorder stop
  const tailMs =
    !useEffects || good
      ? 50
      : Math.max(
          200,
          Math.round((vineBoomDur || 1.25) * 1000) - Math.round(BOOM_SEC * 1000) + 180
        );
  await new Promise((r) => setTimeout(r, tailMs));
  recorder.stop();
  const recorded = await done;

  canvasStream.getTracks().forEach((t) => t.stop());
  dest?.stream.getTracks().forEach((t) => t.stop());
  await audioCtx?.close().catch(() => {});

  if (recorded.type.includes("mp4")) {
    return recorded;
  }

  try {
    return await webmToMp4(recorded, onProgress);
  } catch (err) {
    console.error("[exportZoomVideo] MP4 encode failed", err);
    throw new Error("Could not encode MP4. Check your network and try again.");
  }
}
