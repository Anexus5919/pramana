import { useEffect, useId, useRef } from "react";
import { addEye, prefersReduced, wake, type EyeMode, type LookSource } from "../lib/gaze";

export const INK = "#1B1530";
const ALMOND = "M -40 0 C -24 -33 24 -33 40 0 C 24 33 -24 33 -40 0 Z";

type Props = {
  look?: LookSource;
  mode?: EyeMode;
  scale?: number;
  white?: string;
  live?: boolean;
};

// Almond eye drawn around (0,0); the gaze loop moves the pupil and the lids
export function Eye({ look = "auto", mode = "open", scale = 1, white = "#FFFFFF", live = true }: Props) {
  const clip = useId().replace(/:/g, "");
  const origin = useRef<SVGCircleElement>(null);
  const axis = useRef<SVGCircleElement>(null);
  const pupil = useRef<SVGGElement>(null);
  const lidA = useRef<SVGPathElement>(null);
  const lidB = useRef<SVGPathElement>(null);
  const lash = useRef<SVGPathElement>(null);
  const lookRef = useRef<LookSource>(look);
  const modeRef = useRef<EyeMode>(mode);
  lookRef.current = look;
  modeRef.current = mode;

  useEffect(() => {
    if (!live) return;
    if (!origin.current || !axis.current || !pupil.current || !lidA.current || !lidB.current) return;
    return addEye({
      origin: origin.current,
      axis: axis.current,
      pupil: pupil.current,
      lids: [lidA.current, lidB.current],
      lash: lash.current,
      maxX: 21,
      maxY: 10,
      look: lookRef,
      mode: modeRef,
      px: { x: 0, v: 0 },
      py: { x: 0, v: 0 },
      open: { x: mode === "narrow" ? 0.42 : 1, v: 0 },
      visible: true,
      last: "",
    });
  }, [live]);

  useEffect(() => {
    wake();
  }, [mode, look]);

  // React only writes the resting shape; while live, the loop owns these attributes
  const driven = live && !prefersReduced();
  const staticOpen = driven ? 1 : mode === "narrow" ? 0.42 : mode === "closed" ? 0.06 : 1;
  return (
    <g transform={scale !== 1 ? `scale(${scale})` : undefined}>
      <defs>
        <clipPath id={clip}>
          <path ref={lidB} d={ALMOND} transform={`scale(1 ${staticOpen})`} />
        </clipPath>
      </defs>
      <path ref={lidA} d={ALMOND} fill={white} transform={`scale(1 ${staticOpen})`} />
      <g clipPath={`url(#${clip})`}>
        <g ref={pupil}>
          <circle r={15.5} fill={INK} />
          <circle cx={-5} cy={-6} r={4.6} fill="#FFFFFF" />
        </g>
      </g>
      <path
        ref={lash}
        d="M -36 1 Q 0 15 36 1"
        stroke={INK}
        strokeWidth={5}
        strokeLinecap="round"
        fill="none"
        opacity={!driven && mode === "closed" ? 1 : 0}
      />
      <circle ref={origin} r={0.5} fill="transparent" />
      <circle ref={axis} cx={20} r={0.5} fill="transparent" />
    </g>
  );
}
