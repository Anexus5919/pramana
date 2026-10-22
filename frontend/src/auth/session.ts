import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, qk, setCsrfToken } from "../api";
import type { Role, SessionInfo } from "../types";

async function loadSession(): Promise<SessionInfo | null> {
  try {
    const s = await api.me();
    setCsrfToken(s.csrf_token);
    return s;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      setCsrfToken(null);
      return null;
    }
    throw e;
  }
}

export function useSession() {
  return useQuery({ queryKey: qk.me, queryFn: loadSession, staleTime: Infinity, retry: false });
}

/** The signed-in session; only call below a guard that has already resolved it. */
export function useAuth() {
  const { data } = useSession();
  const role = data?.user.role;
  return {
    session: data ?? null,
    user: data?.user ?? null,
    role,
    is: (...roles: Role[]) => !!role && roles.includes(role),
  };
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) => api.login(username, password),
    onSuccess: (s) => {
      setCsrfToken(s.csrf_token);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" && q.queryKey[0] !== "demo-accounts" });
      qc.setQueryData(qk.me, s);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.logout(),
    onSettled: () => {
      setCsrfToken(null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" && q.queryKey[0] !== "demo-accounts" });
      qc.setQueryData(qk.me, null);
    },
  });
}

export function homePath(role: Role | undefined): string {
  return role === "institution" ? "/portal" : "/dashboard";
}
