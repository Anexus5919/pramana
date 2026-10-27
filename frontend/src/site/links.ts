/** The standard information pages, public and reachable signed in or out. Footer and sitemap order. */
export interface SitePage {
  to: string;
  label: string;
  summary: string;
}

export const SITE_PAGES: SitePage[] = [
  { to: "/help", label: "Help", summary: "How to sign in, use the portal or the review workspace, and where to get answers." },
  { to: "/contact", label: "Contact and feedback", summary: "Who runs this prototype and how to send feedback." },
  {
    to: "/accessibility-statement",
    label: "Accessibility statement",
    summary: "The standard the screens are built to, the display controls, keyboard shortcuts and known gaps.",
  },
  { to: "/privacy-policy", label: "Privacy policy", summary: "What Pramana stores, why, for how long, and the one cookie it sets." },
  { to: "/terms-of-use", label: "Terms of use", summary: "What this prototype is and is not, and the conditions for using it." },
  { to: "/copyright-policy", label: "Copyright policy", summary: "Who owns the content and the terms for reusing it." },
  { to: "/hyperlinking-policy", label: "Hyperlinking policy", summary: "Linking to Pramana, and the links it makes to other sites." },
  { to: "/sitemap", label: "Sitemap", summary: "Every page of Pramana, by who can open it." },
];

export const SITE_PATHS = new Set(SITE_PAGES.map((p) => p.to));
