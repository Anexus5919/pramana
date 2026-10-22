// Dev-only harness: /src/landing/dev/index.html renders the landing page, ?section=<id> renders one section, ?page=login the login page
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { type ComponentType, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "../../index.css";
import "../landing.css";
import LoginPage from "../../pages/login/LoginPage";
import LandingPage from "../LandingPage";
import { computeLayout } from "../hero/eyeState";
import StaticEye from "../hero/StaticEye";
import { landingVars } from "../palette";
import BuiltInOpen from "../sections/BuiltInOpen";
import CrossApplications from "../sections/CrossApplications";
import FinalCta from "../sections/FinalCta";
import HonestNumbers from "../sections/HonestNumbers";
import HowItReads from "../sections/HowItReads";
import SeeThroughEdits from "../sections/SeeThroughEdits";
import SlipsThrough from "../sections/SlipsThrough";
import TrustLadder from "../sections/TrustLadder";

const sections: Record<string, ComponentType> = {
  problem: SlipsThrough,
  how: HowItReads,
  edits: SeeThroughEdits,
  network: CrossApplications,
  ladder: TrustLadder,
  numbers: HonestNumbers,
  open: BuiltInOpen,
  cta: FinalCta,
};

const params = new URLSearchParams(window.location.search);
const only = params.get("section");
const page = params.get("page");
const One = only ? sections[only] : undefined;
const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <MotionConfig reducedMotion="user">
          {page === "login" ? (
            <LoginPage />
          ) : page === "static" ? (
            <div className="lp lp-sky relative h-svh" style={landingVars}>
              <StaticEye layout={computeLayout(window.innerWidth, window.innerHeight, 540, 430)} />
            </div>
          ) : One ? (
            <div className="lp min-h-screen" style={landingVars}>
              <One />
            </div>
          ) : (
            <LandingPage />
          )}
        </MotionConfig>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
