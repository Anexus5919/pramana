import "../landing/landing.css";
import { landingVars } from "../landing/palette";
import BuiltInOpen from "../landing/sections/BuiltInOpen";
import CrossApplications from "../landing/sections/CrossApplications";
import FinalCta from "../landing/sections/FinalCta";
import HonestNumbers from "../landing/sections/HonestNumbers";
import HowItReads from "../landing/sections/HowItReads";
import LandingFooter from "../landing/sections/LandingFooter";
import SeeThroughEdits from "../landing/sections/SeeThroughEdits";
import SlipsThrough from "../landing/sections/SlipsThrough";
import TrustLadder from "../landing/sections/TrustLadder";
import HeroStory from "./hero/HeroStory";
import Nav from "./Nav";

// The v3 landing: the block ground hero and its certificate story, then the v1 sections
export default function LandingV3() {
  return (
    <div className="lp min-h-screen" style={landingVars}>
      <a
        href="#main"
        className="sr-only z-[100] rounded-full bg-(--lp-brand-500) px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main" tabIndex={-1} className="outline-none">
        <HeroStory />
        <SlipsThrough />
        <HowItReads />
        <SeeThroughEdits />
        <CrossApplications />
        <TrustLadder />
        <HonestNumbers />
        <BuiltInOpen />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
