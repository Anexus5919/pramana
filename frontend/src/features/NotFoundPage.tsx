import { FileSearch } from "lucide-react";
import { homePath, useAuth } from "../auth/session";
import { ButtonLink } from "../components/ui/Button";
import { EmptyState } from "../components/ui/Feedback";

export function NotFoundPage() {
  const { role } = useAuth();
  return (
    <EmptyState
      icon={<FileSearch className="size-6" />}
      title="Page not found"
      action={
        <ButtonLink to={homePath(role)} variant="primary">
          Go to home
        </ButtonLink>
      }
    >
      The address does not match any page, or you do not have access to it.
    </EmptyState>
  );
}
