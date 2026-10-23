import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Building2, KeyRound, LoaderCircle, QrCode, ShieldCheck, User } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, lazy, Suspense, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { api, qk } from "../../api";
import { homePath, useLogin, useSession } from "../../auth/session";
import { Wordmark } from "../../brand";
import type { DemoAccount, Role, SessionInfo } from "../../types";
import { palette } from "../../landing/palette";
import { Button, Field, Input, Tag } from "../../ui";

const MiniEye = lazy(() => import("../../landing/hero/MiniEye"));

const OFFICIAL_ORDER: Role[] = ["officer", "verifier", "admin"];
const ROLE_LABEL: Record<Role, string> = {
  officer: "Scrutiny officer",
  verifier: "Verification cell",
  admin: "Administrator and auditor",
  institution: "Institution applicant",
};

const ease = [0.22, 1, 0.36, 1] as const;

function DemoCard({
  account,
  title,
  subtitle,
  pending,
  disabled,
  onPick,
}: {
  account: DemoAccount;
  title: string;
  subtitle: string;
  pending: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const Icon = account.role === "institution" ? Building2 : account.role === "admin" ? ShieldCheck : User;
  return (
    <motion.button
      type="button"
      onClick={onPick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      aria-busy={pending || undefined}
      className="group relative flex w-full items-center gap-3 overflow-hidden rounded-[14px] border border-line bg-surface px-3 py-2.5 text-left shadow-xs transition-[border-color,box-shadow,background-color] duration-200 hover:border-brand-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-default disabled:opacity-60"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-100">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold text-ink">{title}</span>
        <span className="block truncate text-[12px] text-ink-3">{subtitle}</span>
      </span>
      {pending ? (
        <LoaderCircle className="size-4 shrink-0 animate-spin text-brand-600" aria-hidden />
      ) : (
        <ArrowRight
          className="size-4 shrink-0 -translate-x-1 text-ink-4 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:text-brand-600 group-hover:opacity-100"
          aria-hidden
        />
      )}
      {pending && (
        <motion.span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-0.5 bg-brand-500"
          initial={{ scaleX: 0, originX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 1.2, ease }}
        />
      )}
    </motion.button>
  );
}

function DemoAccounts({ pending, onPick }: { pending: string | null; onPick: (a: DemoAccount, password: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const demo = useQuery({ queryKey: qk.demo, queryFn: api.demoAccounts, retry: false, staleTime: 60_000 });
  if (demo.isPending)
    return (
      <div className="grid gap-2 sm:grid-cols-2" aria-busy>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[58px] animate-pulse rounded-[14px] bg-surface-2" />
        ))}
      </div>
    );
  if (demo.error)
    return <p className="rounded-[14px] border border-line bg-surface-2 px-4 py-3 text-sm text-ink-2">Demo accounts are not available right now.</p>;
  const { accounts, password, notice } = demo.data;
  const officials = OFFICIAL_ORDER.flatMap((r) => accounts.filter((a) => a.role === r));
  const allInstitutions = accounts.filter((a) => a.role === "institution");
  const institutions = showAll ? allInstitutions : allInstitutions.slice(0, 4);
  const clean = (n: string) => n.replace(/\s*\(.*\)$/, "");
  return (
    <div>
      <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
        <Tag variant="demo">Simulated</Tag>
        <span>{notice}. One click signs in with the shared demo password.</span>
      </p>
      {officials.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-ink-3 uppercase">Officials</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {officials.map((a, i) => (
              <motion.li key={a.id} className="min-w-0" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i, duration: 0.4, ease }}>
                <DemoCard
                  account={a}
                  title={a.role_label || ROLE_LABEL[a.role]}
                  subtitle={`${clean(a.display_name)} · ${a.username}`}
                  pending={pending === a.username}
                  disabled={!!pending}
                  onPick={() => onPick(a, password)}
                />
              </motion.li>
            ))}
          </ul>
        </div>
      )}
      {institutions.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-ink-3 uppercase">Institutions</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {institutions.map((a, i) => (
              <motion.li
                key={a.id}
                className="min-w-0"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * (i + officials.length), duration: 0.4, ease }}
              >
                <DemoCard
                  account={a}
                  title={a.institution ?? clean(a.display_name)}
                  subtitle={`${clean(a.display_name)} · ${a.username}`}
                  pending={pending === a.username}
                  disabled={!!pending}
                  onPick={() => onPick(a, password)}
                />
              </motion.li>
            ))}
          </ul>
          {allInstitutions.length > 4 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="mt-2 rounded-full px-2 py-1 text-[13px] font-semibold text-brand-700 hover:bg-brand-50"
            >
              {showAll ? "Show fewer institutions" : `Show all ${allInstitutions.length} institutions`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  const session = useSession();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const from = (location.state as { from?: string } | null)?.from;

  if (session.data && !closing) return <Navigate to={homePath(session.data.user.role)} replace />;

  function done(s: SessionInfo) {
    const target = from && from !== "/login" ? from : homePath(s.user.role);
    setClosing(true);
    window.setTimeout(() => navigate(target, { replace: true }), 420);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setPending(null);
    login.mutate({ username: username.trim(), password }, { onSuccess: done });
  }

  function pick(a: DemoAccount, pw: string) {
    setPending(a.username);
    setUsername(a.username);
    login.mutate({ username: a.username, password: pw }, { onSuccess: done, onError: () => setPending(null) });
  }

  const formBusy = login.isPending && !pending;
  const error = login.error instanceof Error ? login.error.message : login.error ? "Sign in failed" : null;

  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <main className="flex min-w-0 flex-col px-5 py-6 sm:px-10 lg:px-14">
        <div className="flex items-center justify-between">
          <Link to="/" aria-label="Pramana home" className="rounded-full">
            <Wordmark size={30} />
          </Link>
          <Link to="/" className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[13px] font-medium text-ink-3 hover:text-ink">
            <ArrowLeft className="size-3.5" aria-hidden /> Back to overview
          </Link>
        </div>

        <motion.div
          className="mx-auto my-auto w-full max-w-[520px] py-10"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease }}
        >
          <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-3 uppercase">Pramana workspace</p>
          <h1 className="mt-2 font-display text-[38px] leading-[1.05] font-semibold tracking-[-0.03em] text-ink sm:text-[44px]">
            Sign in to review
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink-2">
            Officials review findings and the evidence behind them. Institutions submit applications and respond to
            rectification requests.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            <Field label="Username">
              <Input
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                leadingIcon={<User />}
                inputSize="lg"
                placeholder="officer"
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                leadingIcon={<KeyRound />}
                inputSize="lg"
              />
            </Field>
            <AnimatePresence>
              {error && !pending && (
                <motion.p
                  role="alert"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden rounded-[10px] bg-mismatch-bg px-3 py-2 text-sm text-mismatch-fg"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
            <Button
              type="submit"
              size="lg"
              className="w-full"
              loading={formBusy}
              disabled={!username.trim() || !password || !!pending}
              trailingIcon={<ArrowRight className="size-4" />}
            >
              Sign in
            </Button>
          </form>

          <div className="my-8 flex items-center gap-3 text-[12px] text-ink-3">
            <span className="h-px flex-1 bg-line" />
            Demo accounts (synthetic data)
            <span className="h-px flex-1 bg-line" />
          </div>
          <DemoAccounts pending={pending} onPick={pick} />

          <Link
            to="/scan"
            className="group mt-6 flex items-center gap-3 rounded-[14px] border border-dashed border-line-2 px-3.5 py-3 text-left transition-colors duration-200 hover:border-brand-300 hover:bg-brand-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-brand-50 text-brand-700">
              <QrCode className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold text-ink">Holding a certificate with a QR code?</span>
              <span className="block text-[12px] text-ink-3">Scan it to check the issuer's signature. No sign-in needed.</span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-ink-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden />
          </Link>
        </motion.div>

        <p className="text-[12px] leading-relaxed text-ink-3">
          Decision support only. Findings are preliminary indicators for review by competent authorities. Pramana does
          not approve, reject or penalise any institution. Synthetic demo data.
        </p>
      </main>

      <aside aria-label="Pramana eye" className="relative hidden p-3 lg:block">
        <div className="sticky top-3 h-[calc(100dvh-24px)] overflow-hidden rounded-[28px] shadow-lg">
          <Suspense fallback={<div className="h-full w-full" style={{ background: `linear-gradient(180deg, ${palette.peach}, ${palette.rose}, ${palette.lilac})` }} />}>
            <MiniEye closed={closing}>
              <div className="max-w-[260px] text-center select-none">
                <p className="font-display text-[30px] leading-none font-semibold tracking-[-0.03em]" style={{ color: palette.ink }}>Pratyaksha</p>
                <p className="mt-2 text-[13px] leading-snug" style={{ color: palette.ink2 }}>
                  Perception, the first pramana. Every finding points at what was seen.
                </p>
              </div>
            </MiniEye>
          </Suspense>
        </div>
      </aside>
    </div>
  );
}
