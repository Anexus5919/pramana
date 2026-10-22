import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, BadgeCheck, FileSearch, KeyRound, LoaderCircle, Network, RotateCcw } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { api, qk } from "../../api";
import { homePath, useLogin, useSession } from "../../auth/session";
import { Brand } from "../../components/layout/Brand";
import { Footer } from "../../components/layout/Footer";
import { ThemeToggle } from "../../components/layout/ThemeToggle";
import { Button } from "../../components/ui/Button";
import { ErrorBanner, PageLoading, Spinner } from "../../components/ui/Feedback";
import { Input, Label } from "../../components/ui/Field";
import { roleLabel, roleOrder } from "../../lib/labels";
import type { DemoAccount, SessionInfo } from "../../types";

const POINTS = [
  {
    icon: <FileSearch className="size-4" />,
    title: "Every finding points at its evidence",
    body: "The page region, the rule clause it cites and the record it was compared with.",
  },
  {
    icon: <BadgeCheck className="size-4" />,
    title: "Verification states, not verdicts",
    body: "Signatures, signed QR codes and issuer registries reported as verified, mismatch, expired or pending.",
  },
  {
    icon: <Network className="size-4" />,
    title: "Cross-application view",
    body: "Faculty, certificates and files reused across institutions surface as linked indicators.",
  },
  {
    icon: <RotateCcw className="size-4" />,
    title: "Replayable and audited",
    body: "Runs pin the ruleset and inputs by digest; every action lands in a hash-chained log.",
  },
];

function DemoAccounts({ onPick, pending }: { onPick: (a: DemoAccount, password: string) => void; pending: string | null }) {
  const demo = useQuery({ queryKey: qk.demo, queryFn: api.demoAccounts, retry: false, staleTime: 60_000 });
  if (demo.isPending) return <Spinner label="Loading demo accounts" />;
  if (demo.error) {
    return (
      <p className="text-sm text-muted">
        Demo accounts are not available. {demo.error instanceof Error ? demo.error.message : ""}
      </p>
    );
  }
  const officials = roleOrder.filter((r) => r !== "institution").flatMap((r) => demo.data.accounts.filter((a) => a.role === r));
  const institutions = demo.data.accounts.filter((a) => a.role === "institution");
  const button = (a: DemoAccount, primary: string, secondary: string) => (
    <button
      type="button"
      disabled={!!pending}
      onClick={() => onPick(a, demo.data.password)}
      className="group flex w-full items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-primary-soft/50 disabled:opacity-60"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-fg">{primary}</span>
        <span className="block truncate text-xs text-subtle-fg">{secondary}</span>
      </span>
      {pending === a.username ? (
        <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin text-primary-ink" />
      ) : (
        <ArrowUpRight aria-hidden className="size-4 shrink-0 text-subtle-fg transition-colors group-hover:text-primary-ink" />
      )}
    </button>
  );
  return (
    <div>
      <p className="text-xs text-muted">
        {demo.data.notice}. One click signs in with the shared demo password{" "}
        <code className="rounded bg-subtle px-1 font-mono text-[12px] text-fg">{demo.data.password}</code>.
      </p>
      <div className="mt-4 space-y-4">
        {officials.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-[11px] font-semibold tracking-wider text-subtle-fg uppercase">Officials</h3>
            <ul className="grid gap-1.5 sm:grid-cols-3">
              {officials.map((a) => (
                <li key={a.id}>{button(a, a.role_label || roleLabel[a.role], `${a.display_name.replace(/\s*\(.*\)$/, "")}, ${a.username}`)}</li>
              ))}
            </ul>
          </div>
        )}
        {institutions.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-[11px] font-semibold tracking-wider text-subtle-fg uppercase">Institution applicants</h3>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {institutions.map((a) => (
                <li key={a.id}>
                  {button(a, a.institution ?? a.display_name, `${a.display_name.replace(/\s*\(.*\)$/, "")}, ${a.username}`)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export function LoginPage() {
  const session = useSession();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [source, setSource] = useState<"form" | "demo">("form");
  const from = (location.state as { from?: string } | null)?.from;

  if (session.isPending) return <PageLoading label="Checking session" />;
  if (session.data) return <Navigate to={homePath(session.data.user.role)} replace />;

  function done(s: SessionInfo) {
    const target = from && from !== "/login" ? from : homePath(s.user.role);
    navigate(target, { replace: true });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setSource("form");
    login.mutate({ username: username.trim(), password }, { onSuccess: done });
  }

  function pick(a: DemoAccount, pw: string) {
    setSource("demo");
    setPending(a.username);
    login.mutate({ username: a.username, password: pw }, { onSuccess: done, onSettled: () => setPending(null) });
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <div className="absolute top-3 right-4">
        <ThemeToggle />
      </div>
      <div className="mx-auto grid w-full max-w-6xl flex-1 items-start gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:py-16">
        <section aria-labelledby="about-title" className="lg:pt-6">
          <Brand />
          <h1 id="about-title" className="mt-8 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
            Scrutiny support for technical education approvals
          </h1>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted">
            Pramana checks an application against the cited approval norms, authenticates its documents and links
            each preliminary finding to the evidence behind it, so reviewers can decide faster and explain why.
          </p>
          <ul className="mt-8 space-y-4">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-ink">
                  {p.icon}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-fg">{p.title}</span>
                  <span className="block text-sm text-muted">{p.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-5">
          <section aria-labelledby="signin-title" className="rounded-xl border border-line bg-surface p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <KeyRound aria-hidden className="size-4 text-subtle-fg" />
              <h2 id="signin-title" className="text-base font-semibold">
                Sign in
              </h2>
            </div>
            <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
              <div>
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {login.error && source === "form" && <ErrorBanner error={login.error} title="Sign in failed" />}
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                loading={login.isPending && source === "form"}
                disabled={!username.trim() || !password}
              >
                Sign in
              </Button>
            </form>
          </section>

          <section aria-labelledby="demo-title" className="rounded-xl border border-dashed border-line-strong bg-surface/70 p-6">
            <h2 id="demo-title" className="text-base font-semibold">
              Demo accounts (synthetic data)
            </h2>
            <div className="mt-3">
              {login.error && source === "demo" && (
                <ErrorBanner error={login.error} title="Demo sign in failed" className="mb-3" />
              )}
              <DemoAccounts onPick={pick} pending={pending} />
            </div>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}
