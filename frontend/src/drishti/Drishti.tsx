import { useQuery } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { qk } from "../api";
import { useAuth } from "../auth/session";
import { drishtiSuggestions, preferredLanguage } from "./client";
import { displayName, greetingFor, starterChips } from "./copy";
import { DrishtiButton } from "./DrishtiButton";
import type { MascotCue, MascotMood } from "./DrishtiMascot";
import { DrishtiPanel } from "./DrishtiPanel";
import type { DrishtiSuggestionsPayload } from "./types";
import { useDrishtiChat } from "./useDrishtiChat";

const PHONE = "(max-width: 639px)";

function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

function readSuggestions(p: DrishtiSuggestionsPayload | undefined): { greeting?: string; chips?: string[] } {
  if (!p) return {};
  if (Array.isArray(p)) return { chips: p.filter((s) => typeof s === "string") };
  const greeting = p.greeting ?? p.text ?? undefined;
  return { greeting: greeting || undefined, chips: Array.isArray(p.suggestions) ? p.suggestions.filter((s) => typeof s === "string") : undefined };
}

/**
 * Drishti, the assistant: the round button and its chat window. Mounted once by AppShell, so it is on every
 * signed-in page (officials and the institution portal) and never on the landing, sign-in, /scan or not-found pages.
 */
export function Drishti() {
  const { user, role } = useAuth();
  const id = `drishti-${useId().replace(/:/g, "")}`;
  const phone = useMediaQuery(PHONE);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  // The mascot's face: a reaction per reply, a mood from the request
  const [cue, setCue] = useState<MascotCue | null>(null);
  const [draft, setDraft] = useState("");
  const button = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const chat = useDrishtiChat({
    user: user?.username ?? "",
    role,
    onReply: (reply) => {
      setCue({ type: reply.kind === "refuse" ? "refuse" : "happy", at: Date.now() });
      if (!openRef.current) setUnread(true);
    },
  });
  const mood: MascotMood = chat.pending ? "thinking" : chat.failed && chat.error ? "error" : "idle";

  const lang = preferredLanguage();
  const suggestions = useQuery({
    queryKey: qk.drishtiSuggestions(lang),
    queryFn: () => drishtiSuggestions(role, lang),
    enabled: open && !!role,
    staleTime: Infinity,
    retry: false,
  });
  const served = readSuggestions(suggestions.data);
  const greeting = served.greeting ?? greetingFor(role, displayName(user?.display_name));
  // The server's chips when they come; the built-in ones only if it has none or cannot answer, so chips never swap
  const loading = suggestions.isPending && suggestions.fetchStatus === "fetching";
  const starters = served.chips?.length ? served.chips : loading ? [] : starterChips(role);

  const close = useCallback(() => {
    setOpen(false);
    // Back to the button that opened the window
    requestAnimationFrame(() => button.current?.focus({ preventScroll: true }));
  }, []);

  const toggle = useCallback(() => {
    if (openRef.current) close();
    else {
      setOpen(true);
      setUnread(false);
    }
  }, [close]);

  // Into the composer as the window opens
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Toasts read this to stack above the button, and beside the open window when there is room (index.css)
  useLayoutEffect(() => {
    const el = document.documentElement;
    el.dataset.drishti = open && !phone ? "open" : "on";
    return () => {
      delete el.dataset.drishti;
    };
  }, [open, phone]);

  if (!user) return null;
  return (
    <>
      {!(open && phone) && (
        <DrishtiButton ref={button} open={open} mood={mood} cue={cue} unread={unread} controls={id} onClick={toggle} />
      )}
      <AnimatePresence>
        {open && (
          <DrishtiPanel
            key="panel"
            id={id}
            phone={phone}
            greeting={greeting}
            starters={starters}
            mood={mood}
            cue={cue}
            messages={chat.messages}
            pending={chat.pending}
            failed={chat.failed}
            error={chat.error}
            draft={draft}
            onDraft={setDraft}
            onSend={chat.send}
            onRetry={chat.retry}
            onNewChat={() => {
              chat.reset();
              setDraft("");
              input.current?.focus();
            }}
            onClose={close}
            // On a phone the sheet covers the page, so it steps aside once a link is followed
            onNavigate={() => {
              if (phone) close();
            }}
            inputRef={input}
          />
        )}
      </AnimatePresence>
    </>
  );
}
