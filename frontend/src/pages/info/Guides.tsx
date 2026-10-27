import { Link } from "react-router-dom";
import { ExternalLink, InfoPage, InfoTable } from "./InfoLayout";
import { CONTACT_EMAIL } from "../../site/links";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "Cmd" : "Ctrl";

function Keys({ k }: { k: string[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {k.map((x) => (
        <kbd key={x} className="rounded border border-line-2 bg-surface-2 px-1.5 font-mono text-xs text-ink">
          {x}
        </kbd>
      ))}
    </span>
  );
}

export function AccessibilityStatementPage() {
  return (
    <InfoPage
      title="Accessibility statement"
      summary="Pramana is built so that everyone, including people who use a keyboard, a screen reader or larger text, can use it. This statement says what is in place and what is not yet."
    >
      <h2>The standard</h2>
      <p>
        The screens are built to the Web Content Accessibility Guidelines (WCAG) 2.1 at level AA, the level that the Guidelines
        for Indian Government Websites and Apps (GIGW 3.0) adopt. Pramana is a prototype and has not been audited, so it does not
        claim conformance. The main screens are checked with an automated scan (axe-core, against the WCAG 2.1 A and AA rules)
        in light, dark and high contrast, at desktop and phone widths; the scan script is part of the source code. An automated
        scan finds only part of the problems, so keyboard use is also checked by hand.
      </p>

      <h2>Display options</h2>
      <p>The accessibility button in the top bar of every signed-in page, the sign-in page and these pages opens:</p>
      <ul>
        <li>
          <strong>Text size</strong>: A- for smaller text, A for the default and A+ for larger text. The whole layout scales with
          it. Browser zoom up to 200% also works, and the pages reflow down to phone width.
        </li>
        <li>
          <strong>Contrast</strong>: High contrast darkens text and borders, strengthens focus outlines and underlines links in
          text. It works with the light and the dark theme.
        </li>
        <li>
          <strong>Theme</strong>: light or dark.
        </li>
      </ul>
      <p>
        Your choices are kept in this browser. Animations are reduced when your system asks for reduced motion.
      </p>

      <h2>Language</h2>
      <p>
        The institution portal and the sign-in page are available in Hindi and English, from the हिंदी / English button in the
        top bar. Officials' screens are in English. Text written by people or produced by the server, such as the items of a
        deficiency letter, an officer's reasons and notifications, is shown as written, which is English in the demonstration.
        The deficiency letter PDF and these information pages are in English.
      </p>

      <h2>Screen reader access</h2>
      <p>
        The pages use headings, landmarks, labelled controls and live regions for status messages, so screen readers can
        announce them. These screen readers can be used with Pramana:
      </p>
      <InfoTable
        caption="Screen readers"
        head={["Screen reader", "Where to get it", "Free or commercial"]}
        rows={[
          ["NVDA (Windows)", <ExternalLink key="nvda" href="https://www.nvaccess.org/download/">nvaccess.org</ExternalLink>, "Free"],
          ["Narrator (Windows)", "Built into Windows", "Free"],
          ["VoiceOver (macOS, iPhone, iPad)", "Built into Apple devices", "Free"],
          ["TalkBack (Android)", "Built into Android", "Free"],
          ["JAWS (Windows)", <ExternalLink key="jaws" href="https://www.freedomscientific.com/products/software/jaws/">freedomscientific.com</ExternalLink>, "Commercial"],
        ]}
      />

      <h2>Using the keyboard</h2>
      <InfoTable
        caption="Keyboard shortcuts"
        head={["Keys", "What they do", "Where"]}
        rows={[
          [<Keys key="k" k={["Tab"]} />, "The first press shows Skip to content, which moves past the top bar to the page.", "Every page"],
          [<Keys key="k" k={["Tab", "Shift + Tab"]} />, "Move to the next or previous control.", "Every page"],
          [<Keys key="k" k={["Enter", "Space"]} />, "Activate the focused button or link.", "Every page"],
          [<Keys key="k" k={["Esc"]} />, "Close a dialog, drawer or menu and return to where you were.", "Every page"],
          [<Keys key="k" k={["Left", "Right"]} />, "Move between tabs and between the options of a switch, such as text size.", "Every page"],
          [<Keys key="k" k={[MOD, "K"]} />, "Open search for pages and applications.", "Officials' screens"],
          [<Keys key="k" k={["Up", "Down"]} />, "Move through search results; Enter opens one.", "Search"],
          [<Keys key="k" k={["Up", "Down"]} />, "Move between findings in the list.", "Findings of an application"],
          [<Keys key="k" k={["Left", "Right", "Home", "End"]} />, "Step through a document's saved revisions.", "Revision time machine"],
          [<Keys key="k" k={["Left", "Right", "Home", "End"]} />, "Step through the events of a document's life story.", "Document life story"],
        ]}
      />

      <h2>Known limitations</h2>
      <ul>
        <li>The integrity network and the campus map are drawn graphics; the same facts are given as findings and tables, but the drawings themselves are hard to use without a pointer.</li>
        <li>Uploaded documents are shown as page images with highlighted regions. Their text is read and listed beside them, but a scanned page is only as accessible as its text layer.</li>
        <li>The deficiency letter PDF is generated in English and is not a tagged PDF.</li>
        <li>The moving illustration on the home page is decorative; a still version replaces it when your system asks for reduced motion.</li>
        <li>Hindi covers the screens institutions use; officials' screens and these information pages are English only.</li>
        <li>A signed-in session ends after 8 hours without a warning first; anything not yet saved is lost and you sign in again.</li>
        <li>In the standard colours some field and card borders are lighter than 3:1 against the page. High contrast makes them dark enough.</li>
        <li>Links to other websites say so to screen readers, but there is no visible notice before you leave Pramana.</li>
      </ul>

      <h2>Feedback</h2>
      <p>
        If something is hard to use, tell the team through <Link to="/contact">Contact and feedback</Link>, with the page, what you
        were trying to do, and your browser and assistive technology.
      </p>
    </InfoPage>
  );
}

export function HelpPage() {
  return (
    <InfoPage title="Help" summary="How to sign in, how institutions and officials use Pramana, and where to get answers.">
      <h2>Signing in</h2>
      <ul>
        <li>
          Open <Link to="/login">Sign in</Link>. In the demonstration, one click on a demo account signs in with the shared demo
          password: officials (scrutiny officer, verification cell, administrator) or one of eleven institutions.
        </li>
        <li>A session lasts 8 hours. After too many sign-in attempts, sign-in pauses for a while.</li>
        <li>On the public demonstration, data returns to its starting state every night at 03:00 IST.</li>
      </ul>

      <h2>For institutions</h2>
      <ol>
        <li>On <strong>Applications</strong>, start a new application or open one.</li>
        <li>Upload each document on the checklist. The checklist cites the handbook clause it comes from.</li>
        <li>Check your declared figures. The readiness check lists what the handbook rules are likely to raise, and where to fix it.</li>
        <li>Submit. The automatic check runs and its stages show on the page; then an AICTE officer reviews the application.</li>
        <li>
          If AICTE asks for corrections, a deficiency letter appears on the application page. Each item has its own conversation
          with the AICTE Scrutiny Cell. Upload corrected documents or fix your figures, then resubmit.
        </li>
        <li>When AICTE records the scrutiny outcome, it appears on the application page with its reasons and what you can do next.</li>
      </ol>
      <p>The bell in the top bar lists new messages and requests. The हिंदी button shows the portal in Hindi.</p>

      <h2>For officials</h2>
      <ul>
        <li><strong>Review queue</strong>: applications in the order to review them, with what needs attention.</li>
        <li><strong>Application workspace</strong>: summary, findings with their evidence, documents, comparisons, the correction round and activity. Decide holds the review actions; each needs a reason.</li>
        <li><strong>Analyse a document</strong>: run the same checks on any PDF or photo without storing it.</li>
        <li><strong>Integrity</strong>: applications linked by shared evidence, and faculty listed by two institutions at once.</li>
        <li><strong>Rules</strong>, <strong>Audit log</strong> and <strong>Platform</strong>: the cited ruleset, the tamper-evident trail and the system's status.</li>
        <li>Press {MOD} + K to search for pages and applications.</li>
      </ul>

      <h2>Checking a certificate with a QR code</h2>
      <p>
        Anyone can open <Link to="/scan">Scan a certificate</Link>, without signing in, to check the issuer's signature in a
        certificate's QR code with a phone camera or an image.
      </p>

      <h2>Drishti, the assistant</h2>
      <p>
        The round button at the bottom right of every signed-in page answers questions about your work in English, Hindi or
        Hinglish, and takes you to the right screen. It explains; it does not decide anything.
      </p>

      <h2>Display and language</h2>
      <p>
        The accessibility button changes text size, contrast and theme. The <Link to="/accessibility-statement">accessibility statement</Link>{" "}
        lists the keyboard shortcuts.
      </p>

      <h2>Still stuck?</h2>
      <p>
        Write to the team through <Link to="/contact">Contact and feedback</Link>. The <Link to="/sitemap">sitemap</Link> lists every page.
      </p>
    </InfoPage>
  );
}

const CONTACT = CONTACT_EMAIL;

export function ContactPage() {
  const subject = encodeURIComponent("Pramana feedback");
  return (
    <InfoPage title="Contact and feedback" summary="Who runs this prototype, and how to tell the team what works and what does not.">
      <h2>Who runs Pramana</h2>
      <p>
        Pramana is a prototype for AICTE built by a student team for Smart India Hackathon 2026, problem statement 26261
        (AICTE, Regulation Bureau). It is not run by AICTE or the Government of India.
      </p>

      <h2>Send feedback</h2>
      {CONTACT ? (
        <>
          <p>
            Write to the team at <a href={`mailto:${CONTACT}?subject=${subject}`}>{CONTACT}</a>. Feedback on accessibility, wording,
            Hindi translations and errors is especially welcome.
          </p>
          <p>Please include:</p>
        </>
      ) : (
        <p>
          The team's contact address is set when this site is deployed, and this deployment has none set. Feedback on
          accessibility, wording, Hindi translations and errors is especially welcome; please include:
        </p>
      )}
      <ul>
        <li>the page, or its address;</li>
        <li>what you were trying to do and what happened;</li>
        <li>for accessibility problems, your browser and any assistive technology you use.</li>
      </ul>
      <p>Please do not send real documents or personal information. The team replies as time allows; this is a prototype, not a service with a response time.</p>

      <h2>Questions about a real AICTE application</h2>
      <p>
        Pramana holds only demonstration data and cannot answer questions about real applications. Contact AICTE through its{" "}
        <ExternalLink href="https://www.aicte-india.org">official website</ExternalLink>.
      </p>
    </InfoPage>
  );
}

interface MapEntry {
  to: string;
  label: string;
  note?: string;
}

const PUBLIC: MapEntry[] = [
  { to: "/", label: "Home" },
  { to: "/login", label: "Sign in" },
  { to: "/scan", label: "Scan a certificate", note: "Check the issuer's signature in a certificate's QR code" },
];
const INFO: MapEntry[] = [
  { to: "/help", label: "Help" },
  { to: "/contact", label: "Contact and feedback" },
  { to: "/accessibility-statement", label: "Accessibility statement" },
  { to: "/privacy-policy", label: "Privacy policy" },
  { to: "/terms-of-use", label: "Terms of use" },
  { to: "/copyright-policy", label: "Copyright policy" },
  { to: "/hyperlinking-policy", label: "Hyperlinking policy" },
  { to: "/sitemap", label: "Sitemap" },
];
const INSTITUTION: MapEntry[] = [
  { to: "/portal", label: "Applications", note: "Your applications and what to do next" },
  { to: "/portal/new", label: "New application" },
];
const OFFICIALS: MapEntry[] = [
  { to: "/dashboard", label: "Review queue" },
  { to: "/analyse", label: "Analyse a document" },
  { to: "/integrity", label: "Integrity", note: "Applications linked by shared evidence" },
  { to: "/integrity/faculty", label: "Faculty overlaps" },
  { to: "/issuers", label: "Issuer simulator" },
  { to: "/rules", label: "Rules" },
  { to: "/audit", label: "Audit log", note: "Scrutiny officers and administrators" },
  { to: "/platform", label: "Platform", note: "Scrutiny officers and administrators" },
];

function MapList({ title, items, note }: { title: string; items: MapEntry[]; note?: string }) {
  return (
    <>
      <h2>{title}</h2>
      {note && <p>{note}</p>}
      <ul>
        {items.map((i) => (
          <li key={i.to}>
            <Link to={i.to}>{i.label}</Link>
            {i.note && <span className="text-ink-3">: {i.note}</span>}
          </li>
        ))}
      </ul>
    </>
  );
}

export function SitemapPage() {
  return (
    <InfoPage title="Sitemap" summary="Every page of Pramana, by who can open it. Signed-in pages ask you to sign in first.">
      <MapList title="Public pages" items={PUBLIC} />
      <MapList title="Information" items={INFO} />
      <MapList title="Institution portal" items={INSTITUTION} note="For institution accounts. Each application has its own page, opened from Applications." />
      <MapList
        title="Officials"
        items={OFFICIALS}
        note="For AICTE officials. Each application opens in a workspace with Summary, Findings, Documents, Comparisons, Rectification and Activity."
      />
    </InfoPage>
  );
}
