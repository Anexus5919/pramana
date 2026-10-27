import type { Role } from "../types";

/** The first line of every conversation, before anything is asked. */
export function greetingFor(role: Role | undefined, name: string | undefined): string {
  const hello = name ? `Hello, ${name}.` : "Hello.";
  switch (role) {
    case "institution":
      return `${hello} Ask about your application, what is still missing, or how a step works. English, हिंदी or Hinglish all work.`;
    case "verifier":
      return `${hello} Ask about items awaiting confirmation, verification findings, or how to use Pramana. English, हिंदी or Hinglish all work.`;
    default:
      return `${hello} Ask about applications, findings, decisions or certificates, and I will point you to the records. English, हिंदी or Hinglish all work.`;
  }
}

/** Starter chips used until GET /api/drishti/suggestions answers, or if it cannot. */
export function starterChips(role: Role | undefined): string[] {
  switch (role) {
    case "institution":
      return ["What is missing in my application?", "Status of my application", "How do I fix readiness items?", "Rectification kya hai?"];
    case "verifier":
      return ["Items awaiting confirmation", "Open findings on signatures", "What is a signed QR?", "How do I verify a QR by phone?"];
    default:
      return ["Decisions by me yesterday", "Aaj kitne intake applications aaye?", "Certificates expiring this session", "What is rectification?"];
  }
}

/** First name for the greeting: "Dr. Meera Kulkarni (Officer)" becomes "Dr. Meera Kulkarni". */
export function displayName(full: string | undefined): string | undefined {
  const n = full?.replace(/\s*\(.*\)\s*$/, "").trim();
  return n || undefined;
}
