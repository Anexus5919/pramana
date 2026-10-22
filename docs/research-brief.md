# Research brief

SIH 2026, problem statement 26261 (AICTE, Regulation Bureau): AI-powered application validation, document authentication and regulatory compliance verification. Research cut-off: 22 October 2026.

Claims are marked **[V]** when we read the primary source and **[S]** when they come from secondary reporting.

## 1. The problem in practice

Technical institutions apply to AICTE every year, mainly for Extension of Approval (EoA). They also apply for changes such as increased intake, new programmes, a change of site or closure. Officials must decide five things:
- whether the required documents are present and valid;
- whether the declared values match AICTE's own records;
- whether the documents are authentic;
- whether the institution meets the norms;
- which cases need a person or an inspection.

Pramana answers these questions with evidence. It does not decide approval.

## 2. Regulatory framework (verified)

| Item | Finding |
|---|---|
| Applicable handbook | **AICTE Approval Process Handbook 2024-25 to 2026-27** (PDF dated 8 Dec 2023), amended by the **Addendum/Corrigendum 2025-26** and **2026-27 (V2)**. The handbook link in the problem statement is byte-identical to the copy AICTE links for 2026-27. [V] |
| Legal basis | AICTE (Grant of Approvals for Technical Institutions) Regulations, 2020, Gazette 4 Feb 2020, amended 24 Feb 2021. [V] |
| Next edition | No APH 2027-28 had been published by 22 Oct 2026. Rules are therefore versioned by year, and 2027-28 applications are evaluated provisionally. [V absence; S for the circular inviting course names] |
| EoA nature | Granted on self-disclosure, with no scrutiny committee and no expert visit by default. Random or complaint-driven visits can follow. The portal generates a rule-based Deficiency Report. [V] |
| EoA uploads (Annexure 2.1, APH PDF p.97) | (i) Affidavit 2: Rs 100 e-stamp, sworn, digitally signed by the Chairman or Secretary. (ii) TER pay receipt. (iii) Occupancy or Completion Certificate, Building Licence or Form D. (iv) Structural Stability Certificate if the building is more than 30 years from its Completion Certificate. (v) Fire Safety Certificate. (vi) Satellite map with coordinates at the main entrance. (vii) Previous year's audited accounts of the Trust or Society. [V] |
| TER | **Technical Education Regulatory** charges, paid online only. The application is not processed without timely payment (Cl. 2.3.2(d)). Affidavits and reports need the status "Payment Received" or "Payment Not Applicable" (User Manual 2026-27). [V] |
| Digital signatures | Every upload must be DSC-signed by the applicant (Cl. 1.4.6). That signature proves who uploaded the file, not who issued it. [V] |
| Norms used | Faculty-student ratio (Annexure 5), bandwidth tiers (Ann. 4.1), administrative and amenities areas (Ann. 3.3, 3.4), structural certificate validity of 5 years (Cl. 6.17(h)), fire certificate obtained before applying (Ann. 3.1(d)), core-branch condition for intake increase (Add. 2026-27 Cl. 2.6(c)). [V] |
| 2026-27 dates | Portal live 28 Nov 2025. Last date without late fee 17.01.2026, with late fee 20.01.2026. TER with late fee by 11.02.2026. Approvals due by 31 May 2026. [V] |

Conflicts we found in the sources are listed in the regulatory notes rather than resolved silently. Examples: the core-branch reduction limit in Cl. 2.6(g) versus 2.18(a), and the typo "Clause 7.17" for 6.17. Rule thresholds the handbook does not state, such as name-similarity and map-distance tolerances, are marked as configuration in the ruleset.

## 3. What goes wrong in reality

| Pattern | Evidence |
|---|---|
| Ghost or proxy faculty listed at several colleges | Anna University 2023-24: 353 teachers listed full-time at several colleges, one at 11. Show-cause notices went to 295 colleges and an FIR was filed in Nov 2025 ([The News Minute](https://thenewsminute.com/tamil-nadu/same-prof-in-11-colleges-ngo-exposes-alleged-fraud-in-anna-university-affiliation), [Careers360](https://news.careers360.com/anna-university-affiliation-fraud-half-tamil-nadu-engineering-colleges-fake-faculty-fir-names-senior-officials-cheating-admission)). The AICTE chairman has said institutions sharing faculty will be penalised ([Careers360](https://news.careers360.com/will-penalise-institutions-sharing-faculty-aicte-chairman)). [S] |
| Forged fire NOCs | Hyderabad, Aug 2026: private colleges booked for forged fire NOCs with forged official signatures. The NOCs could be checked by QR ([Careers360](https://news.careers360.com/hyderabad-eight-private-colleges-booked-for-submitting-fake-fire-nocs-telangana-board-intermediate-education-college-managements), [Deccan Chronicle](https://www.deccanchronicle.com/southern-states/telangana/telangana-police-identify-colleges-forging-fire-nocs-1976899)). [S] |
| Recycled land documents | JNTU-H vigilance, 2024: the same land shown under three deeds with updated survey numbers ([Deccan Chronicle](https://www.deccanchronicle.com/southern-states/telangana/vigilance-red-flags-faulty-affiliation-process-at-jntu-h-1893724)). [S] |

These are cross-document and cross-institution failures. Reading one document carefully does not catch them, so the design centres on linking records across applications.

## 4. Verification channels

| Channel | Reality | What Pramana does |
|---|---|---|
| PDF digital signatures (PAdES/CMS) | Free and offline against CCA India roots. Validated end to end on real DSC-signed e-Gazette PDFs. [V] | **Genuine.** pyHanko with bundled CCA India 2022, 2022 SPL, 2014 and 2015 SPL roots. |
| Signed QR codes | Some Indian documents carry signed QR codes. Issuer key distribution varies. | **Genuine cryptography with simulated issuers.** JWS with EdDSA (RFC 7515/8037), checked against published keys. |
| DigiLocker / API Setu | Needs organisational onboarding; the SOP says test-only access is not granted. [V] | Adapter interface only. |
| State fire NOC portals, SHCIL e-Stamp, GSTIN | Web forms with captcha or session challenges; no public API. [V] | **Simulated registries**, clearly labelled. Automated access would bypass access controls, so the real path is an officer checking by hand (manual confirmation workflow). |
| NBA and NAAC public lists | Public HTML/XLSX snapshots. [V] | Synthetic accreditation register modelled on the public list. |
| Aadhaar, PAN | Restricted by law (Aadhaar Act s.8A(4); PAN only for authorised entities). [V] | Not used. Synthetic faculty IDs only. |

## 5. Document forensics: what works

- **Deterministic structure checks beat ML on this problem.** In the ForensicHub benchmark (NeurIPS 2025), document-tampering models fall from about 0.74-0.81 F1 in-domain to 0.06-0.07 on real manual edits. A 2026 preprint finds "no evaluated method works reliably out of the box". [V for arXiv HTML]
- The best-known models carry non-commercial terms (TruFor, Noiseprint) or are trained on non-commercial data (DocTamper). That conflicts with our open-source constraint. [V]
- The checks we use are documented in signature-attack research: incremental-update revisions, overlapping objects and signature diff analysis (Mainka et al., "Shadow Attacks", NDSS 2021). [V]
- Page-image pHash cannot tell two genuine certificates on one template from a copied-and-edited one. Comparing variable field values can. [V, our experiment]

## 6. Document understanding

- Digital text with word boxes: pdfplumber.
- Rendering: pypdfium2.
- OCR: RapidOCR (Apache-2.0 code and weights) on CPU.

We avoided:
- **PyMuPDF:** AGPL.
- **Surya and Marker:** weight licence with a revenue cap.
- **MinerU:** custom licence.
- **Qwen2.5 3B and VL-3B:** research-only licence.

Hindi text layers in digital PDFs are often corrupt (Private Use Area glyphs), so we OCR pages that fail a text-quality check. [V on this machine]

## 7. Law and policy for the prototype

- **DPDP Act 2023 and DPDP Rules 2025** (G.S.R. 846(E), 13 Nov 2025). Most obligations commence on 13 May 2027 [V]. AICTE scrutiny probably falls under the s.17(1)(b) regulator exemption, but security safeguards (s.8(5)) still apply. This is our analysis, not legal advice. We build to Rule 6: encryption, access control, access logs and retention.
- **CERT-In Directions (28 Apr 2022):** apply to government organisations. They require 180-day log retention and 6-hour incident reporting. [V]
- **India AI Governance Guidelines (MeitY, Nov 2025):** voluntary. They call for human oversight, "Understandable by Design" and audit trails. [V]

## 8. Open questions

- AICTE has published no permanent-ID format. We used `1-` followed by 10 digits.
- We found no public verification pages for Maharashtra or Karnataka fire NOCs.
- How pyHanko handles Aadhaar eSign PDFs is untested.
- The exact 2026-27 TER payable amounts are uncertain (10% annual escalation), so receipts are matched to the ledger, not to a computed amount.
- All accuracy figures come from synthetic documents.
