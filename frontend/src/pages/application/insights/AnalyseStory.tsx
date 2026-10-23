import { useSearchParams } from "react-router-dom";
import type { BBox } from "../../../types";
import type { Analysis } from "../../analyse/analyseApi";
import { analyseApi } from "../../analyse/analyseApi";
import { anchorId, ReportPanel } from "../../analyse/parts";
import { STORY_DESCRIPTION } from "./DocumentStory";
import { LifeStoryView } from "./LifeStory";
import type { StoryLink, StoryThumb } from "./storyApi";

function jump(id: string) {
  const el = document.getElementById(anchorId(id));
  if (!el) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

/** The same life story for a file analysed without an application, from the in-memory analysis. */
export function AnalyseStory({ a, onShow }: { a: Analysis; onShow: (page: number, bbox: BBox | null, label: string) => void }) {
  const [, setSp] = useSearchParams();
  const story = a.story;
  if (!story) return null;
  const pdf = a.mime === "application/pdf";
  const machine = pdf && !!a.revisions && (a.revision_count ?? 1) >= 2;

  const thumbUrl = (t: StoryThumb) => (t.photo ? analyseApi.photoUrl(a.token) : pdf ? analyseApi.revisionPageUrl(a.token, t.rev ?? 1, t.page ?? 1) : null);
  const pageSize = (p: number) => {
    const pg = a.document.pages.find((x) => x.page_no === p);
    return pg && pg.width && pg.height ? { width: pg.width, height: pg.height } : null;
  };

  const linkLabel = (l: StoryLink): string | null => {
    switch (l.to) {
      case "revision":
        return machine ? `Open revision ${l.rev} in the time machine` : pdf ? "Show the page" : null;
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
      default:
        return null;
    }
  };

  const onOpen = (l: StoryLink, e: { title: string }) => {
    switch (l.to) {
      case "revision":
        if (machine) {
          setSp(
            (prev) => {
              const n = new URLSearchParams(prev);
              n.set("rev", String(l.rev));
              return n;
            },
            { replace: true },
          );
          jump("revisions");
        } else onShow(1, null, e.title);
        break;
      case "region":
        onShow(l.page, l.bbox, e.title);
        break;
      case "page":
        onShow(l.page, null, e.title);
        break;
      case "signature":
        jump("signatures");
        break;
      case "credentials":
        jump("photo");
        break;
      case "photo":
        jump("capture");
        break;
      case "fields":
        jump("fields");
        break;
    }
  };

  return (
    <ReportPanel id="story" title="Life story" description={STORY_DESCRIPTION} padding="none">
      <LifeStoryView story={story} thumbUrl={thumbUrl} pageSize={pageSize} onOpen={onOpen} linkLabel={linkLabel} />
    </ReportPanel>
  );
}
