import type { Tone } from "../../ui/tone";
import type { ScanStatus, ScanTokenResult } from "./scanApi";

export interface StatusView {
  tone: Tone;
  title: string;
  lede: string;
}

const fmt = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "an unstated date";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : fmt.format(d);
}

export function statusView(status: ScanStatus, r?: ScanTokenResult): StatusView {
  const issuer = r?.issuer?.name ?? "the issuer";
  switch (status) {
    case "verified":
      return { tone: "verified", title: "Signature verified", lede: `The values below were signed with the published key of ${issuer} and have not changed since.` };
    case "expired":
      return {
        tone: "expired",
        title: "Signature verified, validity ended",
        lede: `The signature is intact, but the validity the issuer signed ended on ${fmtDay(r?.validity?.until)}.`,
      };
    case "not_yet_valid":
      return {
        tone: "pending",
        title: "Signature verified, not yet in force",
        lede: `The signature is intact; the validity it states starts on ${fmtDay(r?.validity?.from)}.`,
      };
    case "bad_signature":
      return { tone: "mismatch", title: "Signature does not match", lede: r?.detail ?? "The signature does not match the data in the QR." };
    case "unknown_key":
      return { tone: "manual", title: "Signed with an unknown key", lede: r?.detail ?? "The signing key is not one this service knows." };
    case "unsupported":
      return { tone: "manual", title: "Token could not be checked", lede: r?.detail ?? "The QR token uses a format this service does not check." };
    case "not_signed":
      return { tone: "unchecked", title: "Not an issuer-signed QR", lede: r?.detail ?? "This QR carries no signed token." };
    case "no_qr":
    default:
      return {
        tone: "unchecked",
        title: "No QR code found",
        lede: "Fill the frame with the QR, hold the phone parallel to the paper, keep it in focus and avoid glare, then try again.",
      };
  }
}
