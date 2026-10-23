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
      <Nav />
      <main>
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
