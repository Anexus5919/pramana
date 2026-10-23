import { FileArchive, MessageCircleQuestion } from "lucide-react";
import { Button } from "../../../ui/Button";
import { Tooltip } from "../../../ui/Tooltip";

/** Officer-only header actions: the Ask why panel and the evidence pack export. */
export function OfficerActions({ askOpen, onAsk, onPack }: { askOpen: boolean; onAsk: () => void; onPack: () => void }) {
  return (
    <>
      <Tooltip content="Ask about this application's findings. Answers cite evidence and decide nothing.">
        <Button variant={askOpen ? "soft" : "ghost"} aria-pressed={askOpen} leadingIcon={<MessageCircleQuestion />} onClick={onAsk}>
          Ask why
        </Button>
      </Tooltip>
      <Tooltip content="Export a signed ZIP with the report, page crops, audit extract and an offline checker.">
        <Button variant="ghost" leadingIcon={<FileArchive />} onClick={onPack}>
          Evidence pack
        </Button>
      </Tooltip>
    </>
  );
}
