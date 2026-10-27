/**
 * Hindi for the institution portal and the sign-in page, keyed by the English text. Formal administrative Hindi as on
 * Government of India portals, with Drishti's terms (backend/pramana/drishti/glossary.py): आवेदन application,
 * निष्कर्ष finding, निर्णय decision, प्रमाणपत्र certificate, सुधार correction, कमी पत्र deficiency letter.
 * "Pramana" and "AICTE" stay in Latin script. {name} placeholders are filled at run time.
 * The team proofreads these pairs from Downloads/SIH26261_Pramana/gigw/hindi_strings_review.md (scripts/hindi-review.mjs).
 */
export const HI: Record<string, string> = {
  // Shell, footer and display options
  "Skip to content": "मुख्य सामग्री पर जाएँ",
  "Main": "मुख्य",
  "Applications": "आवेदन",
  "Account": "खाता",
  "Account menu for {name}": "{name} का खाता मेनू",
  "Sign out": "साइन आउट करें",
  "Switch to light theme": "हल्की थीम पर जाएँ",
  "Switch to dark theme": "गहरी थीम पर जाएँ",
  "Accessibility options": "सुगम्यता विकल्प",
  "Text size": "अक्षर का आकार",
  "smaller": "छोटा",
  "default": "सामान्य",
  "larger": "बड़ा",
  "Contrast": "कंट्रास्ट",
  "Standard": "सामान्य",
  "High contrast": "उच्च कंट्रास्ट",
  "Theme": "थीम",
  "Light": "हल्की",
  "Dark": "गहरी",
  "Accessibility statement": "सुगम्यता विवरण",
  "Site information": "साइट संबंधी जानकारी",
  "Help": "सहायता",
  "Contact and feedback": "संपर्क और प्रतिक्रिया",
  "Privacy policy": "गोपनीयता नीति",
  "Terms of use": "उपयोग की शर्तें",
  "Copyright policy": "कॉपीराइट नीति",
  "Hyperlinking policy": "हाइपरलिंक नीति",
  "Sitemap": "साइटमैप",
  "Decision support only. Findings are preliminary indicators for review by competent authorities. Pramana does not approve, reject or penalise any institution. Synthetic demo data.":
    "केवल निर्णय में सहायता हेतु। निष्कर्ष सक्षम प्राधिकारियों की समीक्षा के लिए प्रारंभिक संकेतक हैं। Pramana किसी संस्थान को न अनुमोदित करता है, न अस्वीकार करता है और न दंडित करता है। डेमो डेटा कृत्रिम है।",
  "Pramana is a prototype for AICTE, built for Smart India Hackathon 2026 (problem statement 26261). It is not an official AICTE or Government of India website.":
    "Pramana, AICTE के लिए Smart India Hackathon 2026 (समस्या विवरण 26261) हेतु बनाया गया एक प्रोटोटाइप है। यह AICTE या भारत सरकार की आधिकारिक वेबसाइट नहीं है।",
  "Last updated: {date}": "अंतिम अद्यतन: {date}",
};
