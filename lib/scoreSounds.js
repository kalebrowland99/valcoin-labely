/**
 * Score stingers from packaged MP3s.
 * Good = children yay · Bad = fah / oh hell naw / fart / sax (random)
 * Scan = sci-fi body scan (scan phase only)
 */

const GOOD_URL = "/sounds/score-good.mp3";
const SCAN_URL = "/sounds/scan-body.mp3";
const CANT_PROVE_URL = "/sounds/cant-prove-it.mp3";
const VINE_BOOM_URL = "/sounds/vine-boom.mp3";
const BAD_URLS = [
  "/sounds/score-bad.mp3",
  "/sounds/score-bad-alt.mp3",
  "/sounds/score-bad-fart.mp3",
  "/sounds/score-bad-sax.mp3",
];
const BAD_ALT_URL = "/sounds/score-bad-alt.mp3";

/** @type {Map<string, ArrayBuffer>} */
const fileCache = new Map();

async function fetchArrayBuffer(url) {
  const cached = fileCache.get(url);
  if (cached) return cached.slice(0);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load sound: ${url}`);
  const buf = await res.arrayBuffer();
  fileCache.set(url, buf);
  return buf.slice(0);
}

const YAY_SKIP_SEC = 1.5;
const BAD_ALT_MAX_SEC = 3;
const CANT_PROVE_OFFSET_SEC = 22;
const YAY_GAIN = 0.72;
const BAD_GAIN = 1.0;
const SCAN_GAIN = 0.85;
const CANT_PROVE_GAIN = 0.78;
/** Bed level while scan SFX / score stinger is on top (bad only). */
const CANT_PROVE_DUCKED_GAIN = 0.12;
const VINE_BOOM_GAIN = 1.0;
/** Sample starts at 0:03 so the boom hits when the dog appears. */
const VINE_BOOM_OFFSET_SEC = 3;

function pickBadUrl() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return BAD_URLS[buf[0] % BAD_URLS.length];
  }
  return BAD_URLS[Math.floor(Math.random() * BAD_URLS.length)];
}

function badLabelFromUrl(url) {
  if (url.includes("fart")) return "fart";
  if (url.includes("sax")) return "sax";
  if (url.includes("bad-alt")) return "oh hell naw";
  return "fah";
}

async function playBuffer(ctx, dest, {
  url,
  when = ctx.currentTime,
  offset = 0,
  maxDuration,
  gain = 0.9,
}) {
  if (ctx.state === "suspended") {
    await ctx.resume().catch(() => {});
  }

  const arrayBuffer = await fetchArrayBuffer(url);
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  const startOffset = Math.min(Math.max(0, offset), Math.max(0, audioBuffer.duration - 0.05));
  let duration = Math.max(0.05, audioBuffer.duration - startOffset);
  if (Number.isFinite(maxDuration) && maxDuration > 0) {
    duration = Math.min(duration, maxDuration);
  }

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  const g = ctx.createGain();
  g.gain.value = gain;
  source.connect(g);
  g.connect(dest);
  source.start(when, startOffset, duration);

  return duration;
}

/** Sci-fi body scan — only for the scan animation window. */
export async function scheduleScanSfx(ctx, dest, { when = ctx.currentTime, durationSec }) {
  return playBuffer(ctx, dest, {
    url: SCAN_URL,
    when,
    offset: 0,
    maxDuration: durationSec,
    gain: SCAN_GAIN,
  });
}

/**
 * “Just can’t prove it” bed — starts at 0:22 of the source.
 * Bad: plays through scan + result; ducks under other SFX via duckWindows.
 * Good: scan-only, cuts at reveal.
 *
 * @param {{ start: number, end: number }[]} [duckWindows] times relative to `when`
 */
export async function scheduleCantProveIt(
  ctx,
  dest,
  { when = ctx.currentTime, durationSec, duckWindows = [] }
) {
  if (ctx.state === "suspended") {
    await ctx.resume().catch(() => {});
  }

  const arrayBuffer = await fetchArrayBuffer(CANT_PROVE_URL);
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  const startOffset = Math.min(
    CANT_PROVE_OFFSET_SEC,
    Math.max(0, audioBuffer.duration - 0.05)
  );
  let duration = Math.max(0.05, audioBuffer.duration - startOffset);
  if (Number.isFinite(durationSec) && durationSec > 0) {
    duration = Math.min(duration, durationSec);
  }

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  const g = ctx.createGain();
  source.connect(g);
  g.connect(dest);

  const full = CANT_PROVE_GAIN;
  const ducked = CANT_PROVE_DUCKED_GAIN;
  const playEnd = when + duration;

  g.gain.setValueAtTime(full, when);

  const windows = [...duckWindows]
    .map((w) => ({
      start: Math.max(0, Number(w.start) || 0),
      end: Math.max(0, Number(w.end) || 0),
    }))
    .filter((w) => w.end > w.start)
    .sort((a, b) => a.start - b.start);

  for (const w of windows) {
    const duckAt = when + w.start;
    const riseAt = when + w.end;
    if (duckAt >= playEnd) continue;

    const fade = 0.06;
    const downAt = Math.max(when, duckAt);
    const downDone = Math.min(playEnd, downAt + fade);
    const upAt = Math.min(playEnd, Math.max(downDone, riseAt - fade));
    const upDone = Math.min(playEnd, riseAt);

    g.gain.setValueAtTime(full, Math.max(when, downAt - 0.001));
    g.gain.linearRampToValueAtTime(ducked, downDone);
    g.gain.setValueAtTime(ducked, upAt);
    if (upDone > upAt && upDone < playEnd) {
      g.gain.linearRampToValueAtTime(full, upDone);
    } else if (upDone >= playEnd) {
      g.gain.setValueAtTime(ducked, playEnd);
    }
  }

  source.start(when, startOffset, duration);
  return duration;
}

/** Vine boom — punch for the bad seed-oil/additive sting frame. */
export async function scheduleVineBoom(
  ctx,
  dest,
  { when = ctx.currentTime, durationSec = 1.6 }
) {
  return playBuffer(ctx, dest, {
    url: VINE_BOOM_URL,
    when,
    offset: VINE_BOOM_OFFSET_SEC,
    maxDuration: durationSec,
    gain: VINE_BOOM_GAIN,
  });
}

/**
 * Decode and play a good/bad cue into `dest` (MediaStreamDestination or ctx.destination).
 * Bad cue is chosen at random each call: fah / oh hell naw / fart / sax.
 * @returns {Promise<{ duration: number, label: string }>}
 */
export async function scheduleScoreStinger(
  ctx,
  dest,
  { good, when = ctx.currentTime, maxDuration }
) {
  const url = good ? GOOD_URL : pickBadUrl();
  const label = good ? "yay" : badLabelFromUrl(url);
  let offset = 0;
  let clipMax = maxDuration;

  if (good) {
    offset = YAY_SKIP_SEC;
  } else if (url === BAD_ALT_URL) {
    clipMax = Number.isFinite(maxDuration)
      ? Math.min(maxDuration, BAD_ALT_MAX_SEC)
      : BAD_ALT_MAX_SEC;
  }

  const duration = await playBuffer(ctx, dest, {
    url,
    when,
    offset,
    maxDuration: clipMax,
    gain: good ? YAY_GAIN : BAD_GAIN,
  });

  return { duration, label };
}

export function isGoodLabelyScore(score) {
  return Number(score) > 60;
}
