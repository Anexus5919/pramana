import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../api";
import { workspacePath } from "../../../shell/nav";
import type { DocumentDetail } from "../../../types";
import { Button, ErrorState, Panel, Skeleton } from "../../../ui2";
import { useWorkspace } from "../context";
import { useSetParams } from "../data";
import { historyApi } from "../history/api";
import type { Focus } from "../viewer/DocViewer";
import { LifeStoryView } from "./LifeStory";
import type { StoryLink, StoryThumb } from "./storyApi";
import { useDocumentStory } from "./storyApi";

const OPEN_KEY = "pramana.story.open";

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

export const STORY_DESCRIPTION =
  "A chain of custody built only from evidence inside the file and Pramana's own records. Every time says where it comes from and how far it can be trusted.";

/** The life story of one application document, above its viewer. Officers only. */
export function DocumentStory({ doc, onFocus }: { doc: DocumentDetail; onFocus: (f: Focus) => void }) {
  const { app } = useWorkspace();
  const navigate = useNavigate();
  const setParams = useSetParams();
  const [open, setOpen] = useState(readOpen);
  const q = useDocumentStory(doc.id, open);
  const pdf = doc.mime === "application/pdf";

  const toggle = () => {
    setOpen((v) => {
      try {
        window.localStorage.setItem(OPEN_KEY, v ? "0" : "1");
      } catch {
        /* the choice is a convenience; private windows may refuse storage */
      }
      return !v;
    });
  };

  // The current page is the one the viewer loads too; only earlier revisions need the time machine's renders
  const thumbUrl = (t: StoryThumb) => {
    if (t.photo) return api.photoUrl(doc.id, "thumb");
    if (!pdf) return null;
    const count = q.data?.revision_count ?? 1;
    return (t.rev ?? 1) >= count ? api.pageImageUrl(doc.id, t.page ?? 1) : historyApi.revisionPageUrl(doc.id, t.rev ?? 1, t.page ?? 1);
  };
  const pageSize = (p: number) => {
    const pg = doc.pages.find((x) => x.page_no === p);
    return pg && pg.width && pg.height ? { width: pg.width, height: pg.height } : null;
  };

  const linkLabel = (l: StoryLink): string | null => {
    switch (l.to) {
      case "revision":
        return pdf && doc.forensic_facts ? `Open revision ${l.rev} in the time machine` : null;
      case "region":
        return "Show on the page";
      case "page":
        return `Show page ${l.page}`;
      case "signature":
        return "Open the signature check";
      case "credentials":
        return "Open the credentials check";
      case "photo":
        return "Open the capture metadata";
      case "fields":
        return "Open the fields read";
      case "findings":
        return "Open the findings";
      case "audit":
        return "Open the activity log";
    }
  };

  const onOpen = (l: StoryLink, e: { title: string }) => {
    // The viewer and the side panels sit below the story; bring them into view with the evidence
    if (["revision", "region", "page", "signature", "credentials", "photo", "fields"].includes(l.to)) {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      window.setTimeout(() => document.getElementById("doc-stage")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }), 60);
    }
    switch (l.to) {
      case "revision":
        setParams({ panel: "revisions", rev: l.rev, hl: null, hlabel: null });
        break;
      case "region":
        onFocus({ page: l.page, bbox: l.bbox, label: e.title });
        break;
      case "page":
        setParams({ page: l.page, hl: null, hlabel: null });
        break;
      case "signature":
      case "credentials":
        setParams({ panel: "verification" });
        break;
      case "photo":
        setParams({ panel: "forensics" });
        break;
      case "fields":
        setParams({ panel: "fields" });
        break;
      case "findings":
        navigate(workspacePath(app.id, "findings"));
        break;
      case "audit":
        navigate(workspacePath(app.id, "activity"));
        break;
    }
  };

  return (
    <Panel
      title="Life story"
      description={open ? STORY_DESCRIPTION : undefined}
      padding="none"
      actions={
        <Button size="sm" variant="ghost" trailingIcon={open ? <ChevronUp /> : <ChevronDown />} onClick={toggle} aria-expanded={open}>
          {open ? "Hide" : "Show"}
        </Button>
      }
    >
      {open &&
        (q.isPending ? (
          <div role="status" className="px-5 pb-5">
            <span className="sr-only">Loading the life story</span>
            <Skeleton className="h-72" />
          </div>
        ) : q.error || !q.data ? (
          <div className="px-5 pb-5">
            <ErrorState error={q.error} title="Could not build the life story" onRetry={() => void q.refetch()} />
          </div>
        ) : (
          <LifeStoryView story={q.data} thumbUrl={thumbUrl} pageSize={pageSize} onOpen={onOpen} linkLabel={linkLabel} />
        ))}
    </Panel>
  );
}
