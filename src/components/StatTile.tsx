import { Badge } from "./ui/badge";
import { Card } from "./ui/card";

interface StatTileProps {
  label: string;
  value: string | number;
  hint?: string;
  delta?: { label: string; kind: "up" | "down" | "warn" | "neutral" };
}

const DELTA_VARIANT = {
  up: "success",
  down: "danger",
  warn: "warning",
  neutral: "muted",
} as const;

export function StatTile({ label, value, hint, delta }: StatTileProps) {
  return (
    <Card className="p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[.5px] text-ng-secondary">
        {label}
      </p>
      <p className="mt-1.5 text-ng-hero font-bold leading-none tracking-tight text-ng-primary">
        {value}
      </p>
      {hint ? <p className="mt-2 text-[11px] leading-snug text-ng-secondary">{hint}</p> : null}
      {delta ? (
        <Badge variant={DELTA_VARIANT[delta.kind]} className="mt-2">
          {delta.label}
        </Badge>
      ) : null}
    </Card>
  );
}
