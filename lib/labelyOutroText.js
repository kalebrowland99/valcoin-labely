/** Outro overlay helpers — disabled for single product screenshots. */

export const LABELY_OUTRO_TEXT_POOL = [
  "the app i use is called labely",
];

export function pickLabelyOutroText() {
  return LABELY_OUTRO_TEXT_POOL[0];
}

/** Product screenshot mode never shows the Labely outro banner. */
export function shouldShowLabelyOutro() {
  return false;
}

export function lastLabelySlideIndex() {
  return 0;
}

export function resolveLabelyOutroText(config) {
  const explicit = String(config?.labelyOutroText || "").trim();
  if (explicit) return explicit;
  return pickLabelyOutroText();
}
