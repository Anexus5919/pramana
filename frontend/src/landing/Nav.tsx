import { Link } from "react-router-dom";
import { useWorkspaceHref } from "./kit";

export default function Nav() {
  const href = useWorkspaceHref();
  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-3">
      <nav aria-label="Primary" className="lp-glass mx-auto flex h-14 max-w-6xl items-center justify-between rounded-full px-5">
        <a href="#top" className="lp-display text-lg font-semibold">Pramana</a>
        <Link to={href} className="text-sm font-semibold">Open workspace</Link>
      </nav>
    </header>
  );
}
