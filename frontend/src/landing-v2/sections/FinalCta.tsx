import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { Hand } from "../illustrations/Hand";
import { WORKSPACE_URL } from "../links";

export function FinalCta() {
  const [invite, setInvite] = useState(false);
  return (
    <section aria-labelledby="cta-title" className="relative overflow-hidden bg-sun px-5 pt-24 pb-[300px] sm:px-10 sm:pt-32 md:pb-36">
      <div className="relative z-10 mx-auto flex max-w-[56rem] flex-col items-center text-center">
        <h2 id="cta-title" className="font-display text-[clamp(3.4rem,8vw,9rem)] leading-[0.92] font-[800]">
          Look closer.
        </h2>
        <p className="mt-6 max-w-[36rem] text-[1.12rem] leading-relaxed text-ink-2">
          Pramana is Sanskrit for a valid means of knowledge. The first pramana, pratyaksha, is perception by the eye.
        </p>
        <a
          data-look
          href={WORKSPACE_URL}
          className="pill pill-dark mt-9 px-7! py-5! text-[1.1rem]!"
          onPointerEnter={() => setInvite(true)}
          onPointerLeave={() => setInvite(false)}
          onFocus={() => setInvite(true)}
          onBlur={() => setInvite(false)}
        >
          Open the workspace
          <ArrowUpRight className="size-5" aria-hidden />
        </a>
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto h-full max-w-[1500px]">
        <Hand
          hue="rose"
          mirror
          pose="ok"
          eye={{ look: "auto" }}
          lean={{ max: 6, enabled: true, extra: invite ? 9 : 0 }}
          height={640}
          className="absolute bottom-[-40px] left-[-4%] h-[290px] w-auto overflow-visible transition-transform duration-500 md:bottom-[-9%] md:left-[3%] md:h-[min(92%,560px)]"
          style={{ transform: invite ? "translateY(-18px)" : undefined }}
        />
        <Hand
          hue="tang"
          pose="ok"
          eye={{ look: "auto" }}
          lean={{ max: 6, enabled: true, extra: invite ? -9 : 0 }}
          height={640}
          className="absolute right-[-4%] bottom-[-40px] h-[290px] w-auto overflow-visible transition-transform duration-500 md:right-[3%] md:bottom-[-9%] md:h-[min(92%,560px)]"
          style={{ transform: invite ? "translateY(-18px)" : undefined }}
        />
      </div>
    </section>
  );
}
