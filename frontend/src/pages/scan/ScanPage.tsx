import { useMutation } from "@tanstack/react-query";
import { Camera, ImageUp, KeyRound, Link2, LogIn, RotateCcw, ScanLine, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { Wordmark } from "../../brand";
import { Footer } from "../../shell/AppShell";
import { Tag } from "../../ui/Badge";
import { BlockLoader, Button } from "../../ui/Button";
import { cn } from "../../ui/cn";
import { dur, ease, fadeUp, stagger } from "../../ui/motion";
import { Skeleton } from "../../ui/Skeleton";
import { clearLinkToken, linkToken, prepareImage, scanImage, scanToken, ScanError, type ScanResponse } from "./scanApi";
import { ScanResult } from "./ScanResult";
import { statusView } from "./status";
import { Viewfinder } from "./Viewfinder";

type ScanInput = { kind: "image"; file: File } | { kind: "link"; token: string };

const STEPS = [
  { icon: Camera, t: "Photograph the QR", d: "Use the code printed on the certificate. Fill the frame and keep it sharp." },
  { icon: KeyRound, t: "The signature is checked", d: "Against the issuer's published key. Nothing is guessed and the photo is not kept." },
  { icon: ScanLine, t: "You compare", d: "See exactly what the issuer signed, then check each value against the paper." },
];

function HowItWorks() {
  return (
    <motion.ol className="space-y-3" variants={stagger(0.06, 0.1)} initial="hidden" animate="show">
      {STEPS.map((s, i) => (
        <motion.li key={s.t} variants={fadeUp} className="flex gap-3 rounded-card border border-line bg-surface/70 p-3.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-brand-soft text-brand-ink">
            <s.icon className="size-4" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">
              {i + 1}. {s.t}
            </span>
            <span className="mt-0.5 block text-sm text-ink-3 text-pretty">{s.d}</span>
          </span>
        </motion.li>
      ))}
      <motion.li variants={fadeUp} className="rounded-card border border-dashed border-line-2 p-3.5 text-sm text-ink-3 text-pretty">
        A valid signature shows that the issuer signed the data in the QR. It cannot show that the paper around the QR is the one the issuer printed,
        which is why the comparison step matters.
      </motion.li>
      <motion.li variants={fadeUp} className="flex gap-3 p-1 text-sm text-ink-3 text-pretty">
        <Link2 className="mt-0.5 size-4 shrink-0 text-ink-4" aria-hidden />
        <span>Certificates with a scan link open this page straight from the phone camera and check themselves; a photo works for every signed QR.</span>
      </motion.li>
    </motion.ol>
  );
}

/** Stand-in for the photo while a check opened from a link runs: the shape of the result, not a spinner. */
function LinkChecking() {
  return (
    <motion.div
      key="checking"
      role="status"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: dur.ui, ease: ease.out }}
      className="overflow-hidden rounded-panel border border-line bg-surface shadow-md"
    >
      <div className="flex items-center gap-3 border-b border-line bg-surface-2/60 px-4 py-4 sm:px-5">
        <span className="grid size-[26px] place-items-center text-brand-500">
          <BlockLoader />
        </span>
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold text-ink">Checking the signature</p>
          <p className="text-sm text-ink-3">Against the issuer&apos;s published key</p>
        </div>
      </div>
      <div className="space-y-3 px-4 py-5 sm:px-5" aria-hidden>
        <Skeleton className="h-3 w-2/5" rounded="sm" />
        <Skeleton className="h-[74px] w-full" rounded="lg" />
        <Skeleton className="h-[74px] w-full" rounded="lg" />
        <Skeleton className="h-[74px] w-full" rounded="lg" />
      </div>
    </motion.div>
  );
}

export default function ScanPage() {
  const [preview, setPreview] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [notImage, setNotImage] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const lastInput = useRef<ScanInput | null>(null);
  // The token this page last opened from its address, so StrictMode and hash changes check it once
  const opened = useRef<string | null>(null);

  const mut = useMutation<ScanResponse, ScanError, ScanInput>({
    mutationFn: async (input) =>
      input.kind === "link" ? scanToken(input.token) : scanImage(await prepareImage(input.file), input.file.name || "photo.jpg"),
  });
  const { mutate } = mut;
  const link = !mut.isIdle && mut.variables?.kind === "link";

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    document.title = link ? "Certificate check - Pramana" : "Scan to verify - Pramana";
  }, [link]);

  // A phone camera opens {base}/scan#t=<token>: check it straight away, and again if another link lands here
  useEffect(() => {
    function fromAddress() {
      const token = linkToken();
      if (token === null || token === opened.current) return;
      opened.current = token;
      setPreview(null);
      setNotImage(null);
      lastInput.current = { kind: "link", token };
      mutate({ kind: "link", token });
    }
    fromAddress();
    window.addEventListener("hashchange", fromAddress);
    return () => window.removeEventListener("hashchange", fromAddress);
  }, [mutate]);

  function leaveLink() {
    opened.current = null;
    if (linkToken() !== null) clearLinkToken();
  }

  function start(file: File | undefined | null) {
    if (!file) return;
    mut.reset();
    leaveLink();
    if (!file.type.startsWith("image/")) {
      setNotImage(`"${file.name}" is not an image. Choose a photo of the QR (JPEG, PNG or WebP).`);
      return;
    }
    setNotImage(null);
    lastInput.current = { kind: "image", file };
    setPreview(URL.createObjectURL(file));
    mutate({ kind: "image", file });
  }

  function reset() {
    mut.reset();
    leaveLink();
    setNotImage(null);
    setPreview(null);
    if (camera.current) camera.current.value = "";
    if (gallery.current) gallery.current.value = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    start(e.dataTransfer.files?.[0]);
  }

  const tone = mut.data ? statusView(mut.data.status, mut.data.results[0], mut.data.source).tone : mut.error || notImage ? "unchecked" : null;
  const privacy = link
    ? "The token rides after the # in the link, a part browsers never send to a server on their own. This page sends it once to be checked, and only its SHA-256 goes into the audit trail."
    : "The photo is checked in memory and not stored. Only its SHA-256 fingerprint is written to the audit trail.";

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="mx-auto flex w-full max-w-[1120px] items-center justify-between px-4 pt-4 sm:px-6">
        <Link to="/" aria-label="Pramana home" className="rounded-full">
          <Wordmark size={26} />
        </Link>
        <Link to="/login" className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[0.8125rem] font-medium text-ink-3 hover:bg-surface-2 hover:text-ink">
          <LogIn className="size-3.5" aria-hidden /> Officials sign in
        </Link>
      </header>

      <main
        className={cn(
          "mx-auto grid w-full max-w-[1120px] flex-1 content-start items-start px-4 pb-10 sm:px-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-10 lg:pt-10",
          link ? "gap-4 pt-5" : "gap-6 pt-6",
        )}
      >
        <section aria-labelledby="scan-title" className="min-w-0 lg:sticky lg:top-8">
          <p className="flex flex-wrap items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.12em] text-ink-3 uppercase">
            Public check <span aria-hidden>·</span> no sign-in
            <Tag variant="demo">Simulated issuers</Tag>
          </p>
          <h1 id="scan-title" className="mt-2 font-display text-[2rem] leading-[1.05] font-semibold tracking-[-0.03em] text-ink sm:text-[2.375rem]">
            {link ? "Certificate QR check" : "Scan a certificate's QR"}
          </h1>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2 text-pretty">
            {link
              ? "You opened the link in a certificate's QR. Its signed data is checked against the issuer's published key, for you to compare with the paper."
              : "Photograph the issuer-signed QR on a certificate. Pramana checks the signature and shows what the issuer signed, so you can compare it with the paper."}
          </p>

          <div
            className={cn(
              "mt-5 rounded-hero border bg-surface p-3 shadow-sm transition-[border-color,box-shadow] duration-200",
              drag ? "border-brand-400 shadow-glow" : "border-line",
              link && "hidden lg:block",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
          >
            <Viewfinder
              preview={preview}
              busy={mut.isPending}
              tone={tone}
              compact={!!mut.data}
              small={link}
              placeholder={
                link ? (
                  <span className="flex flex-col items-center gap-2 text-brand-ink">
                    <Link2 aria-hidden className="size-11 text-brand-400" strokeWidth={1.5} />
                    <span className="text-[0.6562rem] font-semibold tracking-[0.08em] uppercase">From the QR link</span>
                  </span>
                ) : undefined
              }
            />
            <p className="mt-1 text-center text-[0.8125rem] text-ink-3" aria-live="polite">
              {mut.isPending ? (
                link ? "Checking the signature in the link" : "Reading the QR and checking the signature"
              ) : drag ? (
                "Drop the image to check it"
              ) : link ? (
                "To check another certificate, photograph its QR"
              ) : (
                <>
                  <span className="lg:hidden">Hold the phone flat over the QR so it fills the frame</span>
                  <span className="hidden lg:inline">You can also drop an image here</span>
                </>
              )}
            </p>
            <div className="mt-3 grid gap-2">
              <input
                ref={camera}
                id="scan-camera"
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => start(e.target.files?.[0])}
              />
              <input ref={gallery} id="scan-gallery" type="file" accept="image/*" className="sr-only" onChange={(e) => start(e.target.files?.[0])} />
              <Button
                size="lg"
                variant={link ? "soft" : "primary"}
                className="w-full"
                leadingIcon={<Camera />}
                loading={mut.isPending && !link}
                disabled={mut.isPending}
                onClick={() => camera.current?.click()}
                magnetic={!link}
              >
                Take a photo of the QR
              </Button>
              <Button size="md" variant="ghost" className="w-full border border-line" leadingIcon={<ImageUp />} disabled={mut.isPending} onClick={() => gallery.current?.click()}>
                Choose an image
              </Button>
            </div>
          </div>
          <p className={cn("mt-3 items-start gap-2 text-xs leading-relaxed text-ink-3", link ? "hidden lg:flex" : "flex")}>
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-verified-dot" aria-hidden />
            {privacy}
          </p>
        </section>

        <section aria-label="Result" className="min-w-0" aria-live="polite" aria-busy={mut.isPending}>
          <AnimatePresence mode="wait" initial={false}>
            {mut.data ? (
              <motion.div key={mut.data.checked_at + (mut.data.image_sha256 ?? mut.data.token_sha256 ?? "")} className="space-y-3" exit={{ opacity: 0 }} transition={{ duration: dur.micro }}>
                <ScanResult data={mut.data} />
                <Button variant="ghost" className="w-full border border-line sm:w-auto" leadingIcon={link ? <Camera /> : <RotateCcw />} onClick={reset}>
                  {link ? "Check another certificate by photo" : "Scan another certificate"}
                </Button>
                {link && (
                  <p className="flex items-start gap-2 pt-1 text-xs leading-relaxed text-ink-3 lg:hidden">
                    <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-verified-dot" aria-hidden />
                    {privacy}
                  </p>
                )}
              </motion.div>
            ) : mut.error || notImage ? (
              <motion.div
                key="error"
                role="alert"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: dur.ui, ease: ease.out }}
                className="rounded-panel border border-line bg-surface p-5 shadow-sm"
              >
                <h2 className="font-display text-lg font-semibold text-ink">{link ? "The link could not be checked" : "The photo could not be checked"}</h2>
                <p className="mt-1 text-sm text-ink-2 text-pretty">
                  {mut.error?.message ?? notImage}
                  {link && mut.error?.status === 422 && " Open the full link from the QR again, or photograph the QR instead."}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {lastInput.current && mut.error && mut.error.status !== 429 && !(link && mut.error.status === 422) && (
                    <Button variant="soft" leadingIcon={<RotateCcw />} onClick={() => lastInput.current && mutate(lastInput.current)}>
                      Try again
                    </Button>
                  )}
                  <Button variant="ghost" className="border border-line" leadingIcon={link ? <Camera /> : undefined} onClick={reset}>
                    {link ? "Check by photo instead" : "Start over"}
                  </Button>
                </div>
              </motion.div>
            ) : link && mut.isPending ? (
              <LinkChecking />
            ) : (
              <motion.div key="intro" exit={{ opacity: 0 }} transition={{ duration: dur.micro }}>
                <h2 className="eyebrow mb-3">How it works</h2>
                <HowItWorks />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>
      <Footer />
    </div>
  );
}
