import { FinalCta } from "./sections/FinalCta";
import { Footer } from "./sections/Footer";
import { HeroStory } from "./sections/HeroStory";
import { HonestNumbers } from "./sections/HonestNumbers";
import { HowItReads } from "./sections/HowItReads";
import { LookCloser } from "./sections/LookCloser";
import { SlipsThrough } from "./sections/SlipsThrough";
import { TwoApplications } from "./sections/TwoApplications";

export function App() {
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-ink px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <main id="main">
        <HeroStory />
        <SlipsThrough />
        <HowItReads />
        <LookCloser />
        <TwoApplications />
        <HonestNumbers />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
