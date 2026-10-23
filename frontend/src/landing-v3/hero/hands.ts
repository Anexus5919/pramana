// Hand geometry carried over from the v2 OK-sign hands, redrawn with Canvas2D so it can feed WebGL textures
import { palette } from "../../landing/palette";

export type Hue = "rose" | "violet";

// Hand-local units: a right hand seen palm first, thumb and index forming a ring on the left
export const RING = { x: 112, y: 222 };
export const PALM_EYE = { x: 243, y: 326 };
export const PIVOT = { x: 243, y: 456 };
// Hand-local y that sits on the block tops when a hand is fully up; the wrist and cuff stay below it
export const CUT = 392;
// The cuff starts well below the cut, so lifting a hand to hold the certificate shows wrist, not sleeve
export const CUFF_TOP = 540;

// Two poses share one command layout (M, C, C) so they interpolate number by number
const INDEX = {
  ok: [178, 262, 178, 185.5, 148.5, 156, 112, 156, 71, 156, 39.9, 193.1, 47, 233.5],
  open: [178, 262, 177.5, 226, 177, 200, 176.5, 176, 176, 150, 175, 120, 174, 92],
};
const THUMB = {
  ok: [172, 350, 160, 318, 140, 288, 112, 288, 88.4, 288, 66.6, 275.4, 54.8, 255],
  open: [172, 350, 154, 336, 136, 322, 118, 306, 100, 290, 84, 272, 70, 250],
};
const NAIL = { ok: [46, 224], open: [174, 104] };

export const HUES: Record<Hue, { base: string; shade: string; tips: [string, string, string]; nail: string }> = {
  violet: { base: palette.brand[500], shade: palette.brand[600], tips: [palette.brand[200], palette.peach, "#ffffff"], nail: "#ffffff" },
  rose: { base: "#e88fb8", shade: "#d4729f", tips: [palette.lilac, palette.peach, "#ffffff"], nail: "#ffffff" },
};
export const CUFF = { body: "#ffffff", band: palette.brand[100], dots: palette.brand[400] };
export const EYE_INK = palette.ink;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function bezier(nums: number[]): Path2D {
  const n = nums.map((v) => v.toFixed(2));
  return new Path2D(`M ${n[0]} ${n[1]} C ${n[2]} ${n[3]} ${n[4]} ${n[5]} ${n[6]} ${n[7]} C ${n[8]} ${n[9]} ${n[10]} ${n[11]} ${n[12]} ${n[13]}`);
}

function mixNums(a: number[], b: number[], t: number) {
  return a.map((v, i) => lerp(v, b[i], t));
}

function stroke(ctx: CanvasRenderingContext2D, p: Path2D, color: string, width: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke(p);
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

// Texture windows in hand units
export const UPPER_BOX = { x0: -24, y0: 18, x1: 384, y1: 452 };
export const CUFF_BOX = { x0: 150, y0: 380, x1: 336, y1: 820 };

// Fingers, thumb and palm: everything that leans about the wrist pivot
export function drawUpper(ctx: CanvasRenderingContext2D, hue: Hue, pose: number, tapDeg: number) {
  const c = HUES[hue];
  ctx.lineCap = "round";
  ctx.save();
  ctx.translate(178, 244);
  ctx.rotate((tapDeg * Math.PI) / 180);
  ctx.translate(-178, -244);
  stroke(ctx, bezier(mixNums(INDEX.ok, INDEX.open, pose)), c.shade, 40);
  dot(ctx, lerp(NAIL.ok[0], NAIL.open[0], pose), lerp(NAIL.ok[1], NAIL.open[1], pose), 9.5, c.nail);
  ctx.restore();
  const line = (x0: number, y0: number, x1: number, y1: number, w: number) => {
    const p = new Path2D();
    p.moveTo(x0, y0);
    p.lineTo(x1, y1);
    stroke(ctx, p, c.base, w);
  };
  line(222, 262, 220, 72, 43);
  line(267, 264, 271, 90, 43);
  line(309, 272, 319, 142, 39);
  dot(ctx, 220, 84, 10, c.tips[0]);
  dot(ctx, 271, 102, 10, c.tips[1]);
  dot(ctx, 318.5, 153, 9, c.tips[2]);
  stroke(ctx, bezier(mixNums(THUMB.ok, THUMB.open, pose)), c.base, 48);
  roundRect(ctx, 150, 206, 186, 232, 58, c.base);
}

// Wrist and cuff: they never lean, they stay rooted below the block tops
export function drawCuff(ctx: CanvasRenderingContext2D, hue: Hue, bottom = CUFF_BOX.y1) {
  const c = HUES[hue];
  ctx.fillStyle = c.base;
  ctx.fillRect(180, 390, 126, CUFF_TOP - 390 + 40);
  roundRect(ctx, 158, CUFF_TOP, 170, bottom - CUFF_TOP + 40, 30, CUFF.body);
  ctx.save();
  ctx.beginPath();
  ctx.rect(158, CUFF_TOP + 30, 170, bottom - CUFF_TOP + 10);
  ctx.clip();
  ctx.fillStyle = CUFF.dots;
  for (let y = CUFF_TOP + 26; y < bottom + 34; y += 34) {
    for (let x = 136; x < 340; x += 34) {
      ctx.beginPath();
      ctx.moveTo(x + 13, y + 10);
      ctx.arc(x + 8, y + 10, 5, 0, Math.PI * 2);
      ctx.moveTo(x + 30, y + 27);
      ctx.arc(x + 25, y + 27, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  roundRect(ctx, 158, CUFF_TOP, 170, 30, 15, CUFF.band);
}

// Almond eye drawn around (0,0) in hand units; the WebGL path draws the same shape in a shader
export function drawEye(ctx: CanvasRenderingContext2D, px = 0, py = 0, open = 1) {
  ctx.save();
  ctx.scale(1, Math.max(0.05, open));
  const almond = new Path2D("M -40 0 C -24 -33 24 -33 40 0 C 24 33 -24 33 -40 0 Z");
  ctx.fillStyle = "#ffffff";
  ctx.fill(almond);
  ctx.clip(almond);
  ctx.scale(1, 1 / Math.max(0.05, open));
  dot(ctx, px, py, 15.5, EYE_INK);
  dot(ctx, px - 5, py - 6, 4.6, "#ffffff");
  ctx.restore();
}

export type HandPose = {
  hue: Hue;
  mirror: boolean;
  pose: number; // 0 OK sign, 1 open "wait" palm
  tapDeg?: number;
  tilt?: number; // degrees, screen space, about the wrist pivot
  eye?: { px: number; py: number; open: number };
};

// Whole hand for 2D canvases (static story and the no-WebGL fallback), clipped at a hand-local y
export function drawWholeHand(ctx: CanvasRenderingContext2D, h: HandPose, clipY = CUT) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(-200, -200, 760, clipY + 200);
  ctx.clip();
  ctx.lineCap = "round";
  if (h.mirror) {
    ctx.translate(360, 0);
    ctx.scale(-1, 1);
  }
  drawCuff(ctx, h.hue, Math.max(clipY + 40, CUFF_TOP + 80));
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(-200, -200, 760, clipY + 200);
  ctx.clip();
  const pvx = h.mirror ? 360 - PIVOT.x : PIVOT.x;
  ctx.translate(pvx, PIVOT.y);
  ctx.rotate(((h.tilt ?? 0) * Math.PI) / 180);
  ctx.translate(-pvx, -PIVOT.y);
  ctx.save();
  if (h.mirror) {
    ctx.translate(360, 0);
    ctx.scale(-1, 1);
  }
  drawUpper(ctx, h.hue, h.pose, h.tapDeg ?? 0);
  ctx.restore();
  const ex = lerp(RING.x, PALM_EYE.x, h.pose);
  const ey = lerp(RING.y, PALM_EYE.y, h.pose);
  ctx.translate(h.mirror ? 360 - ex : ex, ey);
  const sc = lerp(1, 1.08, h.pose);
  ctx.scale(sc, sc);
  drawEye(ctx, h.eye?.px ?? 0, h.eye?.py ?? 0, h.eye?.open ?? 1);
  ctx.restore();
}

// Tap: the index lifts off the thumb and presses back twice, the ring confirms
export function tapAngle(elapsedMs: number): number {
  const u = elapsedMs / 760;
  if (u <= 0 || u >= 1) return 0;
  const keys: [number, number][] = [
    [0, 0],
    [0.22, 11],
    [0.42, -2],
    [0.62, 8],
    [1, 0],
  ];
  for (let i = 1; i < keys.length; i++) {
    if (u <= keys[i][0]) {
      const [t0, a0] = keys[i - 1];
      const [t1, a1] = keys[i];
      const k = (u - t0) / (t1 - t0);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      return lerp(a0, a1, e);
    }
  }
  return 0;
}
