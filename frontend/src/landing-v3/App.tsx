import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
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
import { WORKSPACE_ORIGIN } from "./links";
import Nav from "./Nav";

function LandingV3() {
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

// v1 sections link to app routes such as /login; on this port those belong to the workspace origin
function ToWorkspace() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    window.location.replace(`${WORKSPACE_ORIGIN}${pathname}${search}`);
  }, [pathname, search]);
  return null;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingV3 />} />
      <Route path="*" element={<ToWorkspace />} />
    </Routes>
  );
}
