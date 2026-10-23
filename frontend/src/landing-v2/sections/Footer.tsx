export function Footer() {
  return (
    <footer className="on-dark bg-ink px-5 py-14 text-white sm:px-10">
      <div className="mx-auto grid max-w-[1400px] gap-8 md:grid-cols-[1fr_1.4fr] md:items-start">
        <div>
          <p className="font-display text-[1.8rem] font-[780]">pramana</p>
          <p className="mt-2 text-[0.95rem] text-white/80">
            A Smart India Hackathon 2026 prototype for problem statement 26261, AICTE.
          </p>
        </div>
        <p className="rounded-3xl bg-white/[0.07] p-6 text-[1rem] leading-relaxed text-white/90">
          Decision support only. Findings are preliminary indicators for review by competent authorities. Pramana does not
          approve, reject or penalise any institution. Synthetic demo data.
        </p>
      </div>
    </footer>
  );
}
