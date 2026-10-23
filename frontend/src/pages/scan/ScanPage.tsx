import { useMutation } from "@tanstack/react-query";
import { Camera, ImageUp, KeyRound, LogIn, RotateCcw, ScanLine, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { Wordmark } from "../../brand";
import { Footer } from "../../shell/AppShell";
import { Tag } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { cn } from "../../ui/cn";
import { dur, ease, fadeUp, stagger } from "../../ui/motion";
import { prepareImage, scanImage, ScanError, type ScanResponse } from "./scanApi";
import { ScanResult } from "./ScanResult";
import { statusView } from "./status";
import { Viewfinder } from "./Viewfinder";

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
    </motion.ol>
  );
}

export default function ScanPage() {
  const [preview, setPreview] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [notImage, setNotImage] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const lastFile = useRef<File | null>(null);

  const mut = useMutation<ScanResponse, ScanError, File>({
    mutationFn: async (f) => scanImage(await prepareImage(f), f.name || "photo.jpg"),
  });

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    document.title = "Scan to verify - Pramana";
  }, []);

  function start(file: File | undefined | null) {
    if (!file) return;
    mut.reset();
    if (!file.type.startsWith("image/")) {
      setNotImage(`"${file.name}" is not an image. Choose a photo of the QR (JPEG, PNG or WebP).`);
      return;
    }
    setNotImage(null);
    lastFile.current = file;
    setPreview(URL.createObjectURL(file));
    mut.mutate(file);
  }

  function reset() {
    mut.reset();
    setNotImage(null);
    setPreview(null);
    if (camera.current) camera.current.value = "";
    if (gallery.current) gallery.current.value = "";
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    start(e.dataTransfer.files?.[0]);
  }

  const tone = mut.data ? statusView(mut.data.status, mut.data.results[0]).tone : mut.error || notImage ? "unchecked" : null;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="mx-auto flex w-full max-w-[1120px] items-center justify-between px-4 pt-4 sm:px-6">
        <Link to="/" aria-label="Pramana home" className="rounded-full">
          <Wordmark size={26} />
        </Link>
        <Link to="/login" className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-medium text-ink-3 hover:bg-surface-2 hover:text-ink">
          <LogIn className="size-3.5" aria-hidden /> Officials sign in
        </Link>
      </header>

      <main className="mx-auto grid w-full max-w-[1120px] flex-1 items-start gap-6 px-4 pt-6 pb-10 sm:px-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-10 lg:pt-10">
        <section aria-labelledby="scan-title" className="min-w-0 lg:sticky lg:top-8">
          <p className="flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-ink-3 uppercase">
            Public check <span aria-hidden>·</span> no sign-in
            <Tag variant="demo">Simulated issuers</Tag>
          </p>
          <h1 id="scan-title" className="mt-2 font-display text-[32px] leading-[1.05] font-semibold tracking-[-0.03em] text-ink sm:text-[38px]">
            Scan a certificate's QR
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2 text-pretty">
            Photograph the issuer-signed QR on a certificate. Pramana checks the signature and shows what the issuer signed, so you can compare it with the paper.
          </p>

          <div
            className={cn(
              "mt-5 rounded-hero border bg-surface p-3 shadow-sm transition-[border-color,box-shadow] duration-200",
              drag ? "border-brand-400 shadow-glow" : "border-line",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
          >
            <Viewfinder preview={preview} busy={mut.isPending} tone={tone} compact={!!mut.data} />
            <p className="mt-1 text-center text-[13px] text-ink-3" aria-live="polite">
              {mut.isPending ? (
                "Reading the QR and checking the signature"
              ) : drag ? (
                "Drop the image to check it"
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
              <Button size="lg" className="w-full" leadingIcon={<Camera />} loading={mut.isPending} onClick={() => camera.current?.click()} magnetic>
                Take a photo of the QR
              </Button>
              <Button size="md" variant="ghost" className="w-full border border-line" leadingIcon={<ImageUp />} disabled={mut.isPending} onClick={() => gallery.current?.click()}>
                Choose an image
              </Button>
            </div>
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-ink-3">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-verified-dot" aria-hidden />
            The photo is checked in memory and not stored. Only its SHA-256 fingerprint is written to the audit trail.
          </p>
        </section>

        <section aria-label="Result" className="min-w-0" aria-live="polite" aria-busy={mut.isPending}>
          <AnimatePresence mode="wait" initial={false}>
            {mut.data ? (
              <motion.div key={mut.data.checked_at + mut.data.image_sha256} className="space-y-3" exit={{ opacity: 0 }} transition={{ duration: dur.micro }}>
                <ScanResult data={mut.data} />
                <Button variant="ghost" className="w-full border border-line sm:w-auto" leadingIcon={<RotateCcw />} onClick={reset}>
                  Scan another certificate
                </Button>
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
                <h2 className="font-display text-lg font-semibold text-ink">The photo could not be checked</h2>
                <p className="mt-1 text-sm text-ink-2 text-pretty">{mut.error?.message ?? notImage}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {lastFile.current && mut.error && mut.error.status !== 429 && (
                    <Button variant="soft" leadingIcon={<RotateCcw />} onClick={() => start(lastFile.current)}>
                      Try again
                    </Button>
                  )}
                  <Button variant="ghost" className="border border-line" onClick={reset}>
                    Start over
                  </Button>
                </div>
              </motion.div>
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
