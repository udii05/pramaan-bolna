import type { Metadata } from "next";
import "./globals.css";
import { Brand, NavLinks } from "@/components/nav";
import { Badge } from "@/components/ui";
import { hasApiKey } from "@/lib/judge";
import { bolnaConfigured } from "@/lib/bolna";
import { readDb } from "@/lib/store";

export const metadata: Metadata = {
  title: "Pramaan — compliance evidence for AI voice",
  description:
    "Pre-dial gates, post-call audits and tamper-evident reports for AI voice campaigns.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const db = await readDb();
  const mode = db.settings?.judgeMode ?? "heuristic";
  const engine = mode === "llm" ? (hasApiKey() ? "LLM judge" : "LLM (no key)") : "Heuristic judge";
  const bolna = bolnaConfigured() ? "Bolna live" : "simulated";

  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="topbar no-print">
            <div className="topbar-brand">
              <Brand />
            </div>
            <nav className="topbar-nav" aria-label="Main navigation">
              <NavLinks />
            </nav>
            <div className="topbar-status">
              <span className="status-dot" />
              <span className="hidden font-mono text-[9px] uppercase tracking-[0.08em] text-[#7d9197] lg:inline">
                Chain verified
              </span>
              <Badge tone={mode === "llm" && hasApiKey() ? "info" : "muted"}>{engine}</Badge>
              <Badge tone={bolnaConfigured() ? "success" : "muted"}>{bolna}</Badge>
            </div>
          </header>

          <main className="workspace">{children}</main>
        </div>
      </body>
    </html>
  );
}
