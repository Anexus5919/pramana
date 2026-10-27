import { Link } from "react-router-dom";
import { ExternalLink, InfoPage, InfoTable } from "./InfoLayout";

/*
 * The policies of the Pramana prototype. They describe what this software does, read from its code and settings
 * (backend/pramana/config.py, auth.py, retention.py, crypto.py, keyring.py, audit.py and deploy/). They are not
 * AICTE or Government of India policies.
 */

export function PrivacyPolicyPage() {
  return (
    <InfoPage
      title="Privacy policy"
      summary="What Pramana stores, why, for how long, and the one cookie it sets. Pramana is a prototype built for Smart India Hackathon 2026; this is its own policy, not an AICTE or Government of India policy."
    >
      <h2>Use real data with care</h2>
      <p>
        The demonstration runs on synthetic records: made-up institutions, people and documents. Please do not upload real
        documents or personal information. On the public demonstration the demo accounts and their password are shown on the
        sign-in page, so anyone with the link can see what you enter, and every night at 03:00 IST the server restores its
        demonstration data, which erases everything visitors added that day.
      </p>

      <h2>What Pramana stores</h2>
      <ul>
        <li>
          <strong>Accounts.</strong> A username, display name, role and, for institution accounts, the institution. Passwords are
          stored only as Argon2 hashes, never as the password itself.
        </li>
        <li>
          <strong>Sign-in sessions.</strong> When you sign in, the server stores a hash of your session token, a token that protects
          forms against cross-site requests, and when the session expires. A session lasts 8 hours and ends when you sign out.
        </li>
        <li>
          <strong>Applications.</strong> What an institution enters and uploads: declared figures, documents and messages in
          correction rounds. Pramana also stores what it derives from them: the text and values read from each document, the
          results of each check, the findings and the reviewers' notes.
        </li>
        <li>
          <strong>The audit trail.</strong> Every action is recorded with the username, role, time and what it acted on: signing
          in, uploading, each validation run, review actions, letters, messages and outcomes. Failed sign-ins record the username
          that was tried. When too many attempts lock sign-in for a while, the event also records the network address they came
          from. The trail is hash-chained and signed, so it cannot be edited without detection.
        </li>
        <li>
          <strong>Drishti, the assistant.</strong> For each question, the audit trail records what kind of question it was, how many
          records the answer listed and the language, never the text of the question. The server keeps the last 10 turns of a
          conversation in memory for 30 idle minutes so that follow-up questions work; it is not written to disk.
        </li>
        <li>
          <strong>Counters against misuse.</strong> Sign-in attempts and assistant questions are counted per network address and
          per user, in memory only, to slow down password guessing and flooding.
        </li>
      </ul>

      <h2>How documents are protected</h2>
      <ul>
        <li>Each uploaded file is encrypted with its own 256-bit key (AES-256-GCM). That key is itself encrypted under a master key, which can be rotated.</li>
        <li>Uploaded files are opened only in separate, restricted worker processes, so a malformed file cannot reach the server's own memory.</li>
        <li>On the public demonstration all traffic is over HTTPS, and browsers are told to use HTTPS only (HSTS).</li>
        <li>Institutions see only their own applications. Officials see applications by role.</li>
      </ul>

      <h2>How long data is kept</h2>
      <p>A purge removes data on these clocks. The periods are settings of the deployment; these are the defaults.</p>
      <InfoTable
        caption="Retention periods"
        head={["Data", "Kept for", "Counted from"]}
        rows={[
          ["Uploaded document files", "730 days", "When the application is closed or withdrawn"],
          ["Page images rendered for viewing", "30 days", "When they were rendered"],
          ["Progress events of validation runs", "180 days", "When the run finished"],
          ["Sign-in session records", "7 days", "When the session expired"],
          ["Audit trail, findings, document hashes and run records", "Not purged", "They are the record of what was checked and decided"],
        ]}
      />
      <p>Each purge is itself recorded in the audit trail.</p>

      <h2>Cookies and browser storage</h2>
      <p>
        Pramana sets one cookie, the session cookie (<code>pramana_session</code>, or <code>__Host-pramana_session</code> over
        HTTPS). It holds a random token, cannot be read by scripts, is sent only to this site, is marked Secure over HTTPS and
        expires with the session. There are no advertising, analytics or tracking cookies.
      </p>
      <p>
        Your browser also keeps a few display choices in its own storage on your device: theme, text size, contrast, language,
        whether the side bar is collapsed and the pages you opened recently from search. The assistant's conversation is kept in
        the browser tab's session storage and is cleared when you sign out. None of this is sent to the server.
      </p>

      <h2>Other services</h2>
      <ul>
        <li>No analytics, advertising or cloud artificial-intelligence services are used. The language models run on the server or on the team's own computer, so document text does not leave it.</li>
        <li>Fonts and scripts are served by Pramana itself.</li>
        <li>
          The Campus view, for officials, loads map tiles from the OpenStreetMap tile servers. Your browser then requests them
          directly, so those servers see your network address and the map area.
        </li>
        <li>The public demonstration runs on a cloud virtual machine in an Azure region in India.</li>
      </ul>

      <h2>Sharing</h2>
      <p>
        Pramana does not sell or share data. An application's evidence is shown to the officials who review it, and an
        official can export a sealed evidence pack of one application.
      </p>

      <h2>Questions</h2>
      <p>
        Write to the team through <Link to="/contact">Contact and feedback</Link>. For a real AICTE application, contact AICTE
        through its <ExternalLink href="https://www.aicte-india.org">official website</ExternalLink>.
      </p>
    </InfoPage>
  );
}

export function TermsOfUsePage() {
  return (
    <InfoPage
      title="Terms of use"
      summary="What this prototype is and is not, and the conditions for using it. By using Pramana you accept these terms."
    >
      <h2>What Pramana is</h2>
      <p>
        Pramana is a prototype for AICTE, built by a student team for Smart India Hackathon 2026, problem statement 26261. It is
        not an official AICTE or Government of India website or service, and nothing on it is a communication from AICTE.
      </p>

      <h2>Decision support only</h2>
      <ul>
        <li>Findings are preliminary indicators for review by competent authorities.</li>
        <li>Pramana does not approve, reject or penalise any institution, and nothing it shows is a decision.</li>
        <li>Issuer registries are simulated and marked SIMULATED; their answers are not those of the real issuers.</li>
      </ul>

      <h2>Demonstration data</h2>
      <ul>
        <li>The institutions, people, documents and applications in the demonstration are synthetic.</li>
        <li>
          The demo accounts are shared and their password is shown on the sign-in page. Anything entered can be seen and changed
          by other visitors, and the public demonstration restores its data every night at 03:00 IST.
        </li>
        <li>Do not upload real documents, real personal information or anything confidential.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>Do not:</p>
      <ul>
        <li>try to break into accounts, the server or the network, or test its security without the team's written permission;</li>
        <li>send automated traffic that could slow the service down for others;</li>
        <li>upload malicious files, or material you have no right to share;</li>
        <li>present Pramana's screens or findings as an official AICTE or Government of India communication.</li>
      </ul>
      <p>Sign-in attempts and assistant questions are limited per network address and per user.</p>

      <h2>No warranty</h2>
      <p>
        The prototype is provided as it is, without any warranty. It may be unavailable, change or be withdrawn at any time. The
        team is not liable for any loss arising from its use. The source code is released under the MIT Licence.
      </p>

      <h2>Changes and governing law</h2>
      <p>
        These terms may change; the date at the foot of every page shows when the site's content last changed. These terms are
        governed by the laws of India.
      </p>
      <p>
        See also the <Link to="/privacy-policy">privacy policy</Link>, the <Link to="/copyright-policy">copyright policy</Link> and the{" "}
        <Link to="/hyperlinking-policy">hyperlinking policy</Link>.
      </p>
    </InfoPage>
  );
}

export function CopyrightPolicyPage() {
  return (
    <InfoPage title="Copyright policy" summary="Who owns what you see on Pramana, and the terms for reusing it.">
      <h2>Pramana's own content</h2>
      <p>
        The source code is copyright 2026 Pramana contributors and released under the MIT Licence: you may use, copy, change and
        share it, keeping the copyright notice.
      </p>
      <p>
        The text, diagrams and screens of this site may be reproduced free of charge, provided they are reproduced accurately,
        not used in a misleading context or in a way that suggests an AICTE or Government of India endorsement, and the source is
        acknowledged as "Pramana, a prototype for AICTE built for Smart India Hackathon 2026". This permission does not extend to
        the third-party material below.
      </p>

      <h2>Third-party material</h2>
      <InfoTable
        caption="Third-party material and its terms"
        head={["Material", "Owner and terms"]}
        rows={[
          [
            "Clauses of the AICTE Approval Process Handbook 2024-27 and its addenda",
            "AICTE. Quoted word for word, with the clause and page, so each rule can be checked against its source.",
          ],
          ["Government e-Gazette notifications used to test signature checks", "Government of India publications, used unchanged for testing."],
          ["Map data and tiles on the Campus view", "OpenStreetMap contributors, under the Open Database Licence; the attribution is shown on the map."],
          ["Demonstration lab photos", "Wikimedia Commons authors, under CC BY-SA 3.0, CC BY-SA 4.0 and CC0; attributions in docs/features/photos.md."],
          ["Fonts: IBM Plex Sans, IBM Plex Sans Devanagari, IBM Plex Mono, Inter, JetBrains Mono", "Their authors, under the SIL Open Font Licence 1.1."],
          ["Recognition and detection models (PP-OCR, YOLOX-M)", "Their authors, under the Apache 2.0 licence."],
          ["Software libraries", "Their authors, under the open-source licences listed in the repository README."],
        ]}
      />
      <p>To reuse third-party material, follow its owner's terms.</p>

      <h2>Documents uploaded to Pramana</h2>
      <p>
        Documents uploaded by institutions remain with their owners and issuers. Pramana stores them only to check and review
        the application they belong to.
      </p>

      <h2>Requests</h2>
      <p>
        If you believe something here infringes your rights, write to the team through <Link to="/contact">Contact and feedback</Link>{" "}
        and it will be removed while the matter is looked at.
      </p>
    </InfoPage>
  );
}

export function HyperlinkingPolicyPage() {
  return (
    <InfoPage title="Hyperlinking policy" summary="Linking to Pramana, and the links Pramana makes to other websites.">
      <h2>Links to Pramana</h2>
      <ul>
        <li>You may link to the home page and the information pages without asking. Please tell the team through <Link to="/contact">Contact and feedback</Link> so they know where links come from.</li>
        <li>Do not load Pramana's pages inside frames on another site; link to them so they open in their own window.</li>
        <li>Do not describe a link to Pramana in a way that suggests it is an AICTE or Government of India service.</li>
        <li>Pages inside the workspace need a sign-in. Links to an application open only for an account allowed to see it.</li>
        <li>
          The links printed in issuer QR codes open the public certificate check, <Link to="/scan">Scan a certificate</Link>. They
          are made for QR codes and may stop working when the demonstration data is regenerated.
        </li>
      </ul>

      <h2>Links from Pramana to other websites</h2>
      <ul>
        <li>
          Pramana links to a few other websites: news reports cited on the home page, the AICTE website, the screen readers named in
          the accessibility statement, and the map credits on the Campus view.
        </li>
        <li>These links open in a new tab and say so to screen readers.</li>
        <li>
          The team does not control those websites, is not responsible for their content or availability, and does not
          necessarily endorse their views. A link is not an endorsement.
        </li>
      </ul>
    </InfoPage>
  );
}
