import { PrimaryLink, OutlineButton, scrollToId, useWorkspaceHref } from "../kit";

export default function Hero() {
  const href = useWorkspaceHref();
  return (
    <section id="top" aria-labelledby="hero-title" className="lp-sky relative grid min-h-svh place-items-center px-4 text-center">
      <div>
        <h1 id="hero-title" className="lp-display text-[64px] leading-none font-semibold">
          Every approval, checked against its evidence.
        </h1>
        <div className="mt-8 flex justify-center gap-3">
          <PrimaryLink to={href}>Open the workspace</PrimaryLink>
          <OutlineButton onClick={() => scrollToId("how")}>See how it works</OutlineButton>
        </div>
      </div>
    </section>
  );
}
