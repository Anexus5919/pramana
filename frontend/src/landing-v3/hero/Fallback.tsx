import { palette } from "../../landing/palette";
import { type Engine, HANDS, type Layout } from "./engine";
import { CUT, drawWholeHand, PIVOT } from "./hands";

// Static CSS sky and block floor: shown while WebGL loads and kept if it never comes up
export function FallbackGround({ layout, grid = true }: { layout: Layout; grid?: boolean }) {
  const hz = (layout.horizonY / layout.h) * 100;
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${palette.peach} 0%, ${palette.apricot} ${hz * 0.32}%, ${palette.rose} ${hz * 0.66}%, ${palette.lilac} ${hz}%, #c8b6f5 ${hz + 2}%, #b8a2ec 100%)`,
        }}
      />
      <div className="absolute inset-x-0 bottom-0 overflow-hidden" style={{ top: layout.horizonY }}>
        {grid && (
        <div
          className="absolute"
          style={{
            left: "-60%",
            right: "-60%",
            top: 0,
            height: "320%",
            transformOrigin: "50% 0",
            transform: "perspective(380px) rotateX(66deg)",
            backgroundColor: palette.voxel.top,
            backgroundImage: `linear-gradient(90deg, ${palette.voxel.side} 3px, transparent 3px), linear-gradient(0deg, ${palette.voxel.side} 3px, transparent 3px)`,
            backgroundSize: "56px 56px",
          }}
        />
        )}
        <div className="absolute inset-x-0 top-0 h-1/2" style={{ background: `linear-gradient(180deg, #ebe1ff 0%, rgb(235 225 255 / 0) 100%)` }} />
      </div>
    </div>
  );
}

// No-WebGL hands: the same drawing, clipped at the ground line instead of buried in blocks
export const FallbackHands = {
  draw(canvas: HTMLCanvasElement, engine: Engine) {
    const L = engine.layout;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const W = Math.round(L.w * dpr);
    const H = Math.round(L.h * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    engine.frame.hands.forEach((f, i) => {
      if (f.visible <= 0) return;
      const { hue, mirror } = HANDS[i];
      const ox = mirror ? 360 - PIVOT.x : PIVOT.x;
      const s = L.s;
      ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (f.wristX - ox * s), dpr * (L.groundY - CUT * s - f.yOff * s));
      drawWholeHand(ctx, { hue, mirror, pose: f.pose, tapDeg: f.tapDeg, folds: f.folds, tilt: f.tilt, eye: f.eye }, CUT + f.yOff);
    });
  },
};
