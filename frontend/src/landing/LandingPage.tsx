import "./landing.css";
import Hero from "./hero/Hero";
import Nav from "./Nav";
import { landingVars } from "./palette";
import BuiltInOpen from "./sections/BuiltInOpen";
import CrossApplications from "./sections/CrossApplications";
import FinalCta from "./sections/FinalCta";
import HonestNumbers from "./sections/HonestNumbers";
import HowItReads from "./sections/HowItReads";
import LandingFooter from "./sections/LandingFooter";
import SeeThroughEdits from "./sections/SeeThroughEdits";
import SlipsThrough from "./sections/SlipsThrough";
import TrustLadder from "./sections/TrustLadder";

export default function LandingPage() {
  return (
    <div className="lp min-h-screen" style={landingVars}>
      <Nav />
      <main>
        <Hero />
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
