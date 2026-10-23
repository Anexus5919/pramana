import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Certificate, type Field } from "../illustrations/Certificate";
import { Hand, RING } from "../illustrations/Hand";
import { useViewport } from "../lib/hooks";

type P = { x: number; y: number };
const PATH: Field[] = ["institution", "number", "validity", "qr", "signature"];

const CAPTIONS: Record<Field | "none", { inside: string; outside?: string }> = {
  validity: {
    inside: "Revision 1, as the fire officer signed it: Valid Up To 30-06-2025.",
    outside: "Revision 3, as submitted: 30-06-2027, drawn after signing.",
  },
  signature: {
    inside: "The signature covers this revision and is intact.",
    outside: "The submitted revision changed after it was signed.",
  },
  qr: {
    inside: "The QR code encodes Valid Up To 30-06-2025.",
    outside: "It is the same QR code, so it no longer matches the printed 30-06-2027.",
  },
  number: { inside: "Same in both revisions: certificate number FSC/KRD/2024/0419." },
  institution: { inside: "Same in both revisions: Krishna Valley College, Karad." },
  none: { inside: "Move the ring over the page. Inside it you see the revision the fire officer signed." },
};

export function LookCloser() {
  const vp = useViewport();
  const cardW = Math.round(Math.min(620, Math.max(296, vp.w - 72)));
  const lensR = Math.max(40, Math.round(cardW * 0.098));
  const zoom = 1.28;
  const cardRef = useRef<HTMLDivElement>(null);
  const anchors = useRef<Record<string, { c: P; r: DOMRect }>>({});
  const [pos, setPos] = useState<P | null>(null);
  const [slider, setSlider] = useState(50);
  const [region, setRegion] = useState<Field | "none">("validity");
  const raf = useRef(0);

  const measure = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    const base = card.getBoundingClientRect();
    const out: Record<string, { c: P; r: DOMRect }> = {};
    card.querySelectorAll<HTMLElement>("[data-base] [data-field]").forEach((el) => {
      const r = el.getBoundingClientRect();
      const rel = new DOMRect(r.left - base.left, r.top - base.top, r.width, r.height);
      out[el.dataset.field!] = { c: { x: rel.x + rel.width / 2, y: rel.y + rel.height / 2 }, r: rel };
    });
    anchors.current = out;
  }, []);

  const fromSlider = useCallback((v: number): P | null => {
    const pts = PATH.map((f) => anchors.current[f]?.c).filter(Boolean) as P[];
    if (pts.length < 2) return null;
    const t = (v / 100) * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(t));
    const u = t - i;
    return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * u, y: pts[i].y + (pts[i + 1].y - pts[i].y) * u };
  }, []);

  useLayoutEffect(() => {
    measure();
    setPos(fromSlider(slider));
    // re-measure when fonts settle
    document.fonts?.ready.then(() => {
      measure();
      setPos((p) => p ?? fromSlider(50));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardW]);

  useEffect(() => {
    if (!pos) return;
    let hit: Field | "none" = "none";
    for (const [f, a] of Object.entries(anchors.current)) {
      const r = a.r;
      if (pos.x >= r.left - 8 && pos.x <= r.right + 8 && pos.y >= r.top - 8 && pos.y <= r.bottom + 8) hit = f as Field;
    }
    setRegion(hit);
  }, [pos]);

  const place = (clientX: number, clientY: number) => {
    const card = cardRef.current;
    if (!card) return;
    const b = card.getBoundingClientRect();
    const x = Math.max(0, Math.min(b.width, clientX - b.left));
    const y = Math.max(0, Math.min(b.height, clientY - b.top));
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => setPos({ x, y }));
  };

  const s = (lensR - 3) / 46;
  const p = pos ?? { x: cardW / 2, y: cardW * 0.4 };
  const cap = CAPTIONS[region];

  return (
    <section id="lens" aria-labelledby="lens-title" className="overflow-hidden bg-paper px-3 py-6 sm:px-5">
      <div className="mx-auto grid max-w-[1480px] gap-10 overflow-hidden rounded-[40px] bg-rose px-5 pt-14 pb-24 sm:rounded-[56px] sm:px-12 sm:pt-20 sm:pb-32 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-x-16 lg:gap-y-7 lg:py-24">
        <div className="max-w-[34rem] lg:col-start-1 lg:row-start-1 lg:self-end">
          <p className="text-[0.8rem] font-bold tracking-[0.14em] uppercase">Try it</p>
          <h2 id="lens-title" className="mt-3 font-display text-[clamp(2.4rem,5vw,4.6rem)] leading-[0.98] font-[800]">
            Hold the ring to the page.
          </h2>
          <p className="mt-5 text-[1.1rem] leading-relaxed">
            This certificate was edited after it was signed. Through the ring you see the revision the fire officer signed;
            around it, the one that was submitted.
          </p>
        </div>
        <div
          className="lens-area relative mx-auto lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center"
          style={{ width: cardW, paddingBottom: 8 }}
          onPointerMove={(e) => {
            if (e.pointerType === "mouse" || e.pointerType === "pen") place(e.clientX, e.clientY);
          }}
          onPointerDown={(e) => place(e.clientX, e.clientY)}
        >
          <div ref={cardRef} className="relative" style={{ width: cardW }}>
            <div data-base>
              <Certificate
                id="krishna-r3"
                width={cardW}
                signature="changed"
                label="Synthetic Fire Safety Certificate for Krishna Valley College, Karad, Revision 3 as submitted, Valid Up To 30-06-2027. Through the ring: Revision 1 as signed, Valid Up To 30-06-2025."
              />
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 left-0"
              style={{
                width: cardW,
                clipPath: `circle(${(lensR / zoom).toFixed(1)}px at ${p.x}px ${p.y}px)`,
                transform: `scale(${zoom})`,
                transformOrigin: `${p.x}px ${p.y}px`,
              }}
            >
              <Certificate id="krishna-r1" width={cardW} signature="intact" className="shadow-none!" />
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 left-0"
              style={{
                width: 360 * s,
                height: 560 * s,
                transform: `translate(${p.x - RING.x * s}px, ${p.y - RING.y * s}px) rotate(-26deg)`,
                transformOrigin: `${RING.x * s}px ${RING.y * s}px`,
              }}
            >
              <Hand hue="tang" pose="ok" eye={null} height={560} className="h-full w-full overflow-visible" />
            </div>
          </div>
        </div>
        <div className="relative z-10 w-full max-w-[34rem] lg:col-start-1 lg:row-start-2 lg:self-start">
          <div aria-live="polite" className="rounded-3xl bg-white p-5 shadow-[0_4px_0_rgba(27,21,48,0.12)]">
            <p className="text-[0.75rem] font-bold tracking-[0.14em] text-ink-2 uppercase">
              {cap.outside ? "Inside the ring" : "Through the ring"}
            </p>
            <p className="mt-1 text-[1.05rem] leading-snug font-semibold">{cap.inside}</p>
            {cap.outside && (
              <>
                <p className="mt-3 text-[0.75rem] font-bold tracking-[0.14em] text-alert uppercase">Outside the ring</p>
                <p className="mt-1 text-[1.05rem] leading-snug font-semibold">{cap.outside}</p>
              </>
            )}
          </div>
          <label className="mt-6 block">
            <span className="text-[0.9rem] font-semibold">Move the ring across the certificate</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={slider}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSlider(v);
                const q = fromSlider(v);
                if (q) setPos(q);
              }}
              aria-valuetext={cap.inside}
              className="mt-3 w-full accent-ink"
            />
          </label>
        </div>
      </div>
    </section>
  );
}
