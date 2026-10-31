import clsx from "clsx";
import type { ReactNode } from "react";
import { formatPercent } from "@/lib/format";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={clsx("rounded-[10px] border border-[#d8e5e8] bg-white", className)}>
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#e1ecee] px-5 py-4">
      <div>
        <h2 className="text-[13px] font-bold tracking-tight text-[#1d353c]">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-[11px] text-[#657b81]">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "muted" | "amber";

const TONES: Record<Tone, string> = {
  neutral: "border-[#d8e5e8] bg-[#f6fafb] text-[#3f5b62]",
  success: "border-[#c7e4e9] bg-[#e6f4f6] text-[#0f6b7a]",
  warning: "border-[#f0d2b6] bg-[#fff1e5] text-[#ae611b]",
  danger: "border-[#f0cecb] bg-[#fceceb] text-[#a3463f]",
  info: "border-[#cde7ec] bg-[#edf6f8] text-[#1f6f7d]",
  muted: "border-[#d8e5e8] bg-[#ecf3f4] text-[#4a646b]",
  amber: "border-[#f0d2b6] bg-[#fff1e5] text-[#a85a1c]",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.04em]",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const tone: Tone =
    severity === "critical"
      ? "danger"
      : severity === "high"
        ? "warning"
        : severity === "medium"
          ? "info"
          : "muted";
  return <Badge tone={tone}>{severity}</Badge>;
}

export function DecisionBadge({ decision }: { decision: string }) {
  const tone: Tone =
    decision === "allow" ? "success" : decision === "reschedule" ? "warning" : "danger";
  return <Badge tone={tone}>{decision}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const tone: Tone =
    status === "upheld" || status === "active" || status === "completed"
      ? "success"
      : status === "escalated" || status === "paused"
        ? "warning"
        : status === "dismissed" || status === "error"
          ? "danger"
          : status === "open"
            ? "info"
            : "muted";
  return <Badge tone={tone}>{status}</Badge>;
}

export function Kpi({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className="min-h-[150px] rounded-[10px] border border-[#d8e5e8] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold text-[#6f8a91]">{label}</span>
        <span
          className={clsx(
            "h-1.5 w-1.5 rounded-full",
            tone === "danger"
              ? "bg-[#c5544b]"
              : tone === "warning"
                ? "bg-[#d77522]"
                : tone === "success"
                  ? "bg-[#1f8797]"
                  : "bg-[#b6c8cc]",
          )}
        />
      </div>
      <div className="mt-3 text-[34px] font-bold leading-none tracking-[-0.07em] text-[#12262c]">
        {value}
      </div>
      {hint ? <div className="mt-2 text-[11px] leading-relaxed text-[#657b81]">{hint}</div> : null}
    </div>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-12 text-center">
      <div className="text-[13px] font-semibold text-[#1d353c]">{title}</div>
      <div className="max-w-sm text-[11px] leading-relaxed text-[#657b81]">{body}</div>
    </div>
  );
}

export function Bar({ value }: { value: number | null }) {
  const width = value === null ? 0 : Math.max(2, Math.round(value * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#e4eff1]">
      <div
        className={clsx(
          "h-full rounded-full",
          value === null
            ? "bg-[#b6c8cc]"
            : value >= 0.9
              ? "bg-[#1f8797]"
              : value >= 0.7
                ? "bg-[#d77522]"
                : "bg-[#c5544b]",
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#758b91]">{label}</div>
      <div className="mt-1 text-[13px] font-semibold text-[#1d353c]">{formatPercent(value)}</div>
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx("font-mono text-[10px] text-[#657b81]", className)}>{children}</span>;
}
