"use client";

import { useEffect, useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/ar";

interface Health {
  status: "ok" | "error";
  checks: { database: "up" | "down"; redis: "up" | "down" };
  worker: { status: "up" | "down"; lastHeartbeat?: string };
}

type State = { kind: "loading" } | { kind: "unreachable" } | { kind: "done"; health: Health };

const ROWS = ["api", "database", "redis", "worker"] as const;

function isUp(state: State, key: (typeof ROWS)[number]): boolean | null {
  if (state.kind === "loading") return null;
  if (state.kind === "unreachable") return false;
  if (key === "api") return true;
  if (key === "worker") return state.health.worker.status === "up";
  return state.health.checks[key] === "up";
}

// Phase 0 check: does the browser -> Next.js -> API -> database / Redis chain work?
// /api/health goes through the rewrite in next.config.ts, so this also proves the proxy.
export default function SystemStatus({ t }: { t: Dictionary["status"] }) {
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
      <h1 className="text-lg font-semibold">{t.title}</h1>
      <ul className="mt-4 divide-y divide-line">
        {ROWS.map((key) => {
          const up = isUp(state, key);
          return (
            <li key={key} className="flex items-center justify-between py-3">
              <span>{t[key]}</span>
              <span
                className={`flex items-center gap-2 text-sm ${up === null ? "text-muted" : up ? "text-good" : "text-bad"}`}
              >
                <span
                  aria-hidden
                  className={`size-2.5 rounded-full ${up === null ? "bg-muted" : up ? "bg-good" : "bg-bad"}`}
                />
                {up === null ? t.checking : up ? t.up : t.down}
              </span>
            </li>
          );
        })}
      </ul>
      {state.kind === "unreachable" && (
        <p className="mt-4 text-sm text-muted">
          {t.unreachable} <code dir="ltr">npm run dev:api</code>
        </p>
      )}
    </section>
  );
}
