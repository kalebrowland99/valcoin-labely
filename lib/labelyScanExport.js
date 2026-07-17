/**
 * Labely / Valcoin scan intro helpers — product photo + viewfinder beam,
 * then result UI slides up over it.
 */

const OUT_W = 1080;
const OUT_H = 1920;

export function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function drawContain(ctx, img, cw, ch) {
  const ir = img.width / img.height;
  const cr = cw / ch;
  let dw;
  let dh;
  let dx;
  let dy;
  if (ir > cr) {
    dw = cw;
    dh = dw / ir;
    dx = 0;
    dy = (ch - dh) / 2;
  } else {
    dh = ch;
    dw = dh * ir;
    dx = (cw - dw) / 2;
    dy = 0;
  }
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawPlaceholderBg(ctx, cw, ch) {
  const g = ctx.createLinearGradient(0, 0, cw, ch);
  g.addColorStop(0, "#2a2824");
  g.addColorStop(1, "#0f0e0c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);
}

function strokeRoundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Viewfinder stroke + sweeping horizontal beam. */
export function drawScanOverlay(ctx, box, tScan) {
  const { x, y, w, h } = box;
  const rr = Math.min(44, Math.min(w, h) * 0.06);

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  strokeRoundRectPath(ctx, x, y, w, h, rr);
  ctx.stroke();

  const inset = Math.max(10, h * 0.02);
  const innerTop = y + inset;
  const innerBot = y + h - inset;
  const innerH = Math.max(12, innerBot - innerTop);
  const beamY = innerTop + tScan * innerH;

  const grad = ctx.createLinearGradient(x, beamY - 6, x, beamY + 6);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.92)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.92)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(x + rr, beamY - 6, w - 2 * rr, 12);
  ctx.restore();
}

export function defaultScanBox(w = OUT_W, h = OUT_H) {
  const padX = w * 0.065;
  const padYT = h * 0.165;
  return { x: padX, y: padYT, w: w - 2 * padX, h: h * 0.495 };
}

/** Black frame + product photo (contain). */
export function drawProductScanBg(ctx, productImg, w = OUT_W, h = OUT_H) {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  if (productImg?.width) drawContain(ctx, productImg, w, h);
  else drawPlaceholderBg(ctx, w, h);
}

/**
 * Draw one scan/reveal frame onto ctx.
 * @param {"scan"|"reveal"|"hold"} phase
 */
export function drawScanTourFrame(ctx, {
  phase,
  t,
  productImg,
  resultImg,
  w = OUT_W,
  h = OUT_H,
}) {
  drawProductScanBg(ctx, productImg, w, h);

  if (phase === "scan") {
    drawScanOverlay(ctx, defaultScanBox(w, h), easeInOutQuad(t));
    return;
  }

  if (phase === "reveal") {
    const eased = easeOutCubic(t);
    ctx.fillStyle = `rgba(14,13,17,${0.12 + eased * 0.28})`;
    ctx.fillRect(0, 0, w, h);
    if (resultImg?.width) {
      const offset = Math.round((1 - eased) * h);
      ctx.drawImage(resultImg, 0, offset, w, h);
    }
    return;
  }

  // hold — full result UI
  if (resultImg?.width) {
    ctx.drawImage(resultImg, 0, 0, w, h);
  }
}
