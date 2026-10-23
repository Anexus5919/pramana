// Mutable state shared between the DOM layer and the WebGL eye; read every frame, never rendered by React

export type EyeLayout = {
  width: number;
  height: number;
  pupilR: number; // px
  irisR: number; // px
  apertureA: number; // px, half width of the almond
  apertureTop: number; // px, upper lid height at the centre
  apertureBottom: number; // px, lower lid depth at the centre
  shapeP: number; // almond fullness exponent
  compact: boolean; // narrow screens: iris sits faded behind the copy
};

export type EyeState = {
  pointer: { x: number; y: number; inside: boolean; lastMove: number };
  pulses: { x: number; y: number; t0: number }[];
  reads: { angle: number; t0: number; tone: number }[];
  scrollClose: number;
  layout: EyeLayout;
  running: boolean;
};

export const now = () => performance.now() / 1000;

export function computeLayout(
  width: number,
  height: number,
  copyW: number,
  copyH: number,
  opts: { compact?: boolean } = {},
): EyeLayout {
  const compact = opts.compact ?? width < 720;
  const halfDiag = 0.5 * Math.hypot(copyW, copyH);
  let pupilR: number;
  let irisR: number;
  if (compact) {
    irisR = Math.min(width * 0.62, height * 0.42);
    pupilR = irisR * 0.62;
  } else {
    // the lens must clear the copy block's corners, not just its sides
    pupilR = halfDiag + 14;
    irisR = pupilR / 0.7;
    const maxIris = height * 0.6;
    if (irisR > maxIris) {
      irisR = maxIris;
      pupilR = Math.max(pupilR, irisR * 0.72);
    }
  }
  const apertureTop = compact ? height * 0.36 : Math.min(height * 0.4, irisR * 0.9);
  const apertureBottom = apertureTop * 0.92;
  return {
    width,
    height,
    pupilR,
    irisR,
    apertureA: compact ? width * 0.62 : width * 0.51,
    apertureTop,
    apertureBottom,
    shapeP: compact ? 0.62 : 0.78,
    compact,
  };
}

// Almond edge in px (positive y is up): upper and lower lid at horizontal offset x
export function lidEdge(l: EyeLayout, x: number): { top: number; bottom: number } {
  const u = Math.min(1, Math.abs(x) / l.apertureA);
  const f = Math.pow(Math.max(0, 1 - u * u), l.shapeP);
  return { top: l.apertureTop * f, bottom: -l.apertureBottom * f };
}

export function createEyeState(): EyeState {
  return {
    pointer: { x: 0, y: 0, inside: false, lastMove: 0 },
    pulses: [],
    reads: [],
    scrollClose: 0,
    layout: computeLayout(1440, 900, 540, 420),
    running: true,
  };
}
