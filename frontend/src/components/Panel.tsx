import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  subtitle?: string;
  action?: { label: string; onClick?: () => void };
  children: ReactNode;
  noPad?: boolean;
}

export function Panel({ title, subtitle, action, children, noPad }: PanelProps) {
  return (
    <section className="overflow-hidden rounded-[10px] border border-ng-border bg-ng-surface">
      <div className="flex items-start justify-between border-b border-ng-border px-5 py-3.5">
        <div>
          <h2 className="text-[13px] font-semibold text-ng-primary">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-[11px] text-ng-secondary">{subtitle}</p>
          ) : null}
        </div>
        {action ? (
          <button
            onClick={action.onClick}
            className="mt-0.5 text-xs font-medium text-ng-accent hover:underline"
          >
            {action.label}
          </button>
        ) : null}
      </div>
      <div className={noPad ? "" : "overflow-x-auto p-5"}>{children}</div>
    </section>
  );
}
