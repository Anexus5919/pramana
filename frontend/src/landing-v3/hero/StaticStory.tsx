import { useEffect, useRef } from "react";
import { Section } from "../../landing/kit";
import { CUT, drawWholeHand, type Hue } from "./hands";
import { Certificate, CheckList, ReviewNote, STORY_COPY, StepPills } from "./StoryParts";

// A still hand for the reduced-motion story, cut at the wrist like the ones on the ground
function HandStill({ hue, mirror, pose, width, label }: { hue: Hue; mirror: boolean; pose: number; width: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const box = { x0: -20, y0: 30, x1: 380, y1: CUT };
  const height = (width * (box.y1 - box.y0)) / (box.x1 - box.x0);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const k = (width / (box.x1 - box.x0)) * dpr;
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(k, 0, 0, k, -box.x0 * k, -box.y0 * k);
    drawWholeHand(ctx, { hue, mirror, pose, eye: { px: 0, py: 0, open: 1 } }, CUT);
  }, [hue, mirror, pose, width, height, box.x0, box.x1, box.y0]);
  return <canvas ref={ref} role="img" aria-label={label} style={{ width, height }} />;
}

export default function StaticStory() {
  return (
    <Section id="story" eyebrow="How Pramana looks at a certificate" title="Look, confirm, and know when to wait.">
      <div className="mt-14 grid gap-14 lg:grid-cols-2">
        {[0, 1].map((step) => (
          <div key={step}>
            <StepPills step={step} />
            <p className="lp-eyebrow mt-5">{STORY_COPY[step].kicker}</p>
            <h3 className="lp-display mt-2 text-[30px] leading-[1.05] font-semibold text-(--lp-ink)">{STORY_COPY[step].title}</h3>
            <p className="mt-3 max-w-[440px] text-[16px] leading-relaxed text-(--lp-ink-2)">{STORY_COPY[step].body}</p>
            <div className="mt-8 flex flex-wrap items-end gap-6">
              {step === 0 ? (
                <Certificate id="panchganga" width={340} signature="intact" highlight={{ signature: "ok", qr: "ok", number: "ok" }} />
              ) : (
                <Certificate id="krishna-r3" width={340} signature="changed" highlight={{ validity: "alert" }} />
              )}
              <HandStill
                hue={step === 0 ? "rose" : "violet"}
                mirror={step === 0}
                pose={step}
                width={120}
                label={step === 0 ? "A rose hand making an OK sign around a watching eye: confirmed" : "A violet open palm with an eye: wait, a person must review"}
              />
            </div>
            <div className="mt-6 max-w-[480px]">{step === 0 ? <CheckList shown={3} /> : <ReviewNote show />}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}
