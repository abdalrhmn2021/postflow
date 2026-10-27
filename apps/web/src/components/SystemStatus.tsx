"use client";

import { useEffect, useState } from "react";

interface Health {
  status: "ok" | "error";
  checks: { database: "up" | "down"; redis: "up" | "down" };
  worker: { status: "up" | "down"; lastHeartbeat?: string };
}

type State = { kind: "loading" } | { kind: "unreachable" } | { kind: "done"; health: Health };

const ROWS = [
  { key: "api", label: "الـ API" },
  { key: "database", label: "قاعدة البيانات (PostgreSQL)" },
  { key: "redis", label: "Redis" },
  { key: "worker", label: "الـ Worker" },
] as const;

function isUp(state: State, key: (typeof ROWS)[number]["key"]): boolean | null {
  if (state.kind === "loading") return null;
  if (state.kind === "unreachable") return false;
  if (key === "api") return true;
  if (key === "worker") return state.health.worker.status === "up";
  return state.health.checks[key] === "up";
}

// Phase 0 check: does the browser -> Next.js -> API -> database / Redis chain work?
// /api/health goes through the rewrite in next.config.ts, so this also proves the proxy.
export default function SystemStatus() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (!stopped) setState(body?.checks ? { kind: "done", health: body } : { kind: "unreachable" });
      } catch {
        if (!stopped) setState({ kind: "unreachable" });
      }
    };
    void load();
    const timer = setInterval(load, 10_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <section className="w-full rounded-2xl border border-line bg-card p-6">
      <h2 className="text-lg font-semibold">حالة النظام</h2>
      <ul className="mt-4 divide-y divide-line">
        {ROWS.map((row) => {
          const up = isUp(state, row.key);
          return (
            <li key={row.key} className="flex items-center justify-between py-3">
              <span>{row.label}</span>
              <span
                className={`flex items-center gap-2 text-sm ${up === null ? "text-muted" : up ? "text-good" : "text-bad"}`}
              >
                <span
                  aria-hidden
                  className={`size-2.5 rounded-full ${up === null ? "bg-muted" : up ? "bg-good" : "bg-bad"}`}
                />
                {up === null ? "جاري الفحص…" : up ? "شغّال" : "واقف"}
              </span>
            </li>
          );
        })}
      </ul>
      {state.kind === "unreachable" && (
        <p className="mt-4 text-sm text-muted">
          الـ API مش واصل. شغّل <code dir="ltr">npm run dev:api</code> وتأكد إنه Docker شغّال (
          <code dir="ltr">npm run db:up</code>).
        </p>
      )}
    </section>
  );
}
