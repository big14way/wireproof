import Link from "next/link";
import type { DataSource } from "@/lib/agent/jobdata";

/** Live case or sample data: the same pages, two sources, always labelled. */
export function DataSwitch({ href, source, verified }: { href: string; source: DataSource; verified: number }) {
  const tab = (s: DataSource, label: string) => (
    <Link
      href={`${href}?data=${s}`}
      className={`rounded-md px-3 py-1 ${source === s ? "bg-ink text-white" : "text-ink-2 hover:text-copper"}`}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <div className="inline-flex rounded-lg border border-line bg-card p-0.5 font-semibold">
        {tab("live", `Live case${verified ? ` · ${verified} verified` : ""}`)}
        {tab("sample", "Sample data")}
      </div>
      <span className="text-muted">
        {source === "live"
          ? "Readings the agent has verified on this job so far."
          : "Made-up readings that show what a finished job looks like."}
      </span>
    </div>
  );
}
