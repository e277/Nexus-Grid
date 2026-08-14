"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { AnalysisResult, Finding, GapMatch } from "../../types";
import {
  AXIS_PROPS,
  ChartFrame,
  ChartLegend,
  DECISION_COLOR,
  GRID_PROPS,
  INK,
  SERIES,
  SEVERITY_COLOR,
  TooltipRow,
  TooltipShell,
  VALUE_LABEL,
  compact,
} from "./chart-kit";

const DOMAIN_LABEL: Record<string, string> = {
  market: "Farm-to-Market",
  soil: "Soil & Crop",
  planting: "Planting",
  logistics: "Logistics",
  impact: "Outcomes",
};

const SEVERITY_ORDER = ["critical", "opportunity", "watch", "gap"] as const;
const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical",
  opportunity: "Opportunity",
  watch: "Watch",
  gap: "Data gap",
};

/**
 * What each agent raised, by how serious it judged it.
 *
 * Stacked because the segments sum to that domain's whole finding count, which
 * is the comparison that matters — a domain with four criticals and one with
 * four data gaps are not the same workload. Severity wears status tokens, not
 * the categorical palette: "critical" means critical.
 */
export function FindingsByDomainChart({
  analyses,
  onSelect,
  selected,
}: {
  analyses: AnalysisResult[];
  /** Clicking a bar filters the findings list below it. */
  onSelect?: (domain: string | null) => void;
  selected?: string | null;
}) {
  const rows = analyses.map((analysis) => {
    const row: Record<string, string | number> = {
      domain: DOMAIN_LABEL[analysis.domain] ?? analysis.domain,
      key: analysis.domain,
    };
    for (const severity of SEVERITY_ORDER) {
      row[severity] = analysis.findings.filter((f) => f.severity === severity).length;
    }
    // Printed above the stack: a stacked bar shows the split well and the
    // total badly, because reading it means adding four segments by eye.
    row.total = SEVERITY_ORDER.reduce((sum, sev) => sum + (row[sev] as number), 0);
    return row;
  });

  const total = rows.reduce(
    (sum, row) => sum + SEVERITY_ORDER.reduce((s, sev) => s + (row[sev] as number), 0),
    0
  );

  if (total === 0) {
    return (
      <ChartFrame title="Findings by domain" subtitle="Nothing raised yet">
        <p className="py-6 text-center text-ng-sm text-ng-secondary">
          No agent has returned a finding yet.
        </p>
      </ChartFrame>
    );
  }

  function ChartTooltip({ active, payload, label }: {
    active?: boolean;
    payload?: { name: string; value: number; color: string }[];
    label?: string;
  }) {
    if (!active || !payload?.length) return null;
    return (
      <TooltipShell title={String(label)}>
        {payload
          .filter((entry) => entry.value > 0)
          .map((entry) => (
            <TooltipRow
              key={entry.name}
              color={entry.color}
              name={SEVERITY_LABEL[entry.name] ?? entry.name}
              value={String(entry.value)}
            />
          ))}
      </TooltipShell>
    );
  }

  return (
    <ChartFrame
      title="Findings by domain"
      subtitle={`How many conclusions each agent raised, stacked by how serious it judged them. ${total} finding${total === 1 ? "" : "s"} across ${rows.length} agents — click a bar to filter`}
    >
      <ChartLegend
        items={SEVERITY_ORDER.map((severity) => ({
          label: SEVERITY_LABEL[severity],
          color: SEVERITY_COLOR[severity],
        }))}
      />
      <div className="h-[210px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid {...GRID_PROPS} vertical={false} />
            <XAxis dataKey="domain" {...AXIS_PROPS} interval={0} />
            <YAxis
              allowDecimals={false}
              width={46}
              {...AXIS_PROPS}
              label={{
                value: "Findings",
                angle: -90,
                position: "insideLeft",
                fill: INK.secondary,
                fontSize: 11,
                style: { textAnchor: "middle" },
              }}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-accent-light)" }} />
            {SEVERITY_ORDER.map((severity, index) => (
              <Bar
                key={severity}
                dataKey={severity}
                name={severity}
                stackId="findings"
                fill={SEVERITY_COLOR[severity]}
                stroke={INK.surface}
                strokeWidth={2}
                maxBarSize={44}
                radius={index === 0 ? [4, 4, 0, 0] : undefined}
                onClick={(data: { payload?: { key?: string } }) =>
                  onSelect?.(
                    selected === data?.payload?.key ? null : (data?.payload?.key ?? null)
                  )
                }
                className={onSelect ? "cursor-pointer" : undefined}
              >
                {rows.map((row) => (
                  <Cell
                    key={String(row.key)}
                    fillOpacity={selected && selected !== row.key ? 0.32 : 1}
                  />
                ))}
                {index === SEVERITY_ORDER.length - 1 ? (
                  <LabelList dataKey="total" position="top" {...VALUE_LABEL} />
                ) : null}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

/**
 * How sure the agents were.
 *
 * Confidence is ordinal — low, medium, high have a natural order — so it takes
 * one hue stepped light to dark rather than three identities. A single measure
 * per bucket means no legend; the axis is the key.
 */
export function ConfidenceChart({ findings }: { findings: Finding[] }) {
  const buckets = (["low", "medium", "high"] as const).map((level, index) => {
    const count = findings.filter((f) => f.confidence === level).length;
    return {
      level: level[0].toUpperCase() + level.slice(1),
      count,
      // The count answers "how many"; the share answers "how much of the
      // whole", which is the question a three-bucket chart is actually asked.
      label: findings.length > 0 ? `${count}  (${Math.round((count / findings.length) * 100)}%)` : "0",
      fill: `color-mix(in oklab, var(--color-accent) ${32 + index * 26}%, var(--color-surface))`,
    };
  });

  if (findings.length === 0) {
    return (
      <ChartFrame title="Confidence" subtitle="Nothing to score yet">
        <p className="py-6 text-center text-ng-sm text-ng-secondary">No findings to score.</p>
      </ChartFrame>
    );
  }

  function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: (typeof buckets)[number] }[] }) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
      <TooltipShell title={`${row.level} confidence`}>
        <p className="text-ng-xs text-ng-secondary">
          <span className="font-medium tabular-nums text-ng-primary">{row.count}</span> of{" "}
          {findings.length} findings ({Math.round((row.count / findings.length) * 100)}%)
        </p>
      </TooltipShell>
    );
  }

  return (
    <ChartFrame
      title="Confidence across findings"
      subtitle="How many findings sit at each confidence level. Low confidence is not wrong — it means the agent wants the figure checked before it is acted on"
    >
      <div className="h-[210px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={buckets} margin={{ top: 20, right: 12, bottom: 18, left: 0 }}>
            <CartesianGrid {...GRID_PROPS} vertical={false} />
            <XAxis
              dataKey="level"
              {...AXIS_PROPS}
              interval={0}
              label={{
                value: "Confidence the agent attached",
                position: "insideBottom",
                offset: -2,
                fill: INK.secondary,
                fontSize: 11,
              }}
            />
            <YAxis
              allowDecimals={false}
              width={46}
              {...AXIS_PROPS}
              label={{
                value: "Findings",
                angle: -90,
                position: "insideLeft",
                fill: INK.secondary,
                fontSize: 11,
                style: { textAnchor: "middle" },
              }}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-accent-light)" }} />
            <Bar
              dataKey="count"
              radius={[4, 4, 0, 0]}
              maxBarSize={56}
              stroke={INK.surface}
              strokeWidth={2}
            >
              {buckets.map((bucket) => (
                <Cell key={bucket.level} fill={bucket.fill} />
              ))}
              <LabelList dataKey="label" position="top" {...VALUE_LABEL} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

const FACTOR_KEYS = [
  "Transit",
  "Weather at both ends",
  "Complementary planting",
  "Established regional trade",
] as const;

/**
 * Why a supplier ranked where it did.
 *
 * Stacked because the four factors sum to the score out of 100 — the whole
 * point is which part of the score a supplier earned, not just the total. Four
 * factors are four identities, so they take categorical slots 1 to 4 in fixed
 * order; a filter that removes a supplier never repaints the survivors.
 */
export function SupplierScoreChart({ match }: { match: GapMatch | null }) {
  if (!match || match.matches.length === 0) {
    return (
      <ChartFrame title="Supplier ranking" subtitle="Select a sourcing gap">
        <p className="py-6 text-center text-ng-sm text-ng-secondary">
          No ranked suppliers for this gap.
        </p>
      </ChartFrame>
    );
  }

  const rows = match.matches.map((supplier) => {
    const row: Record<string, string | number> = { supplier: supplier.supplier, score: supplier.score };
    for (const factor of FACTOR_KEYS) {
      row[factor] = supplier.factors.find((f) => f.label === factor)?.points ?? 0;
    }
    return row;
  });

  function ChartTooltip({ active, payload, label }: {
    active?: boolean;
    payload?: { name: string; value: number; color: string }[];
    label?: string;
  }) {
    if (!active || !payload?.length) return null;
    const supplier = match!.matches.find((s) => s.supplier === label);
    return (
      <TooltipShell title={`${label} — ${supplier?.score ?? 0}/100`}>
        {payload.map((entry) => (
          <TooltipRow
            key={entry.name}
            color={entry.color}
            name={entry.name}
            value={`${entry.value} pts`}
          />
        ))}
        {supplier ? (
          <p className="max-w-[280px] pt-1 text-ng-2xs leading-snug text-ng-secondary">
            {supplier.rationale}
          </p>
        ) : null}
      </TooltipShell>
    );
  }

  return (
    <ChartFrame
      title={`Supplier ranking — ${match.importer} needs ${match.commodity.toLowerCase()}`}
      subtitle={`${compact(match.external_usd)} bought outside the region · scored on four observed factors, best first`}
    >
      <ChartLegend
        items={FACTOR_KEYS.map((factor, index) => ({ label: factor, color: SERIES[index] }))}
      />
      <div className="w-full" style={{ height: Math.max(150, rows.length * 34 + 48) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 40, bottom: 18, left: 8 }}
            barCategoryGap="28%"
          >
            <CartesianGrid {...GRID_PROPS} horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 100]}
              {...AXIS_PROPS}
              label={{
                value: "Match score out of 100",
                position: "insideBottom",
                offset: -2,
                fill: INK.secondary,
                fontSize: 11,
              }}
            />
            <YAxis type="category" dataKey="supplier" width={160} {...AXIS_PROPS} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-accent-light)" }} />
            {FACTOR_KEYS.map((factor, index) => (
              <Bar
                key={factor}
                dataKey={factor}
                stackId="score"
                fill={SERIES[index]}
                stroke={INK.surface}
                strokeWidth={2}
                maxBarSize={22}
                radius={index === FACTOR_KEYS.length - 1 ? [0, 4, 4, 0] : undefined}
              >
                {/* The total, once, at the end of the stack — the four
                    segments are the breakdown and the tooltip names each. */}
                {index === FACTOR_KEYS.length - 1 ? (
                  <LabelList dataKey="score" position="right" {...VALUE_LABEL} />
                ) : null}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

/**
 * What the agents decided, and what humans answered at the gate.
 *
 * One series, so no legend box — the axis names each agent. Bars take slot 1
 * rather than a colour each: the length already carries the comparison and
 * colouring by it would spend the identity channel re-encoding it.
 */
export function AgentDecisionChart({
  decisions,
}: {
  decisions: { agent: string; confidence: number | null }[];
}) {
  const byAgent = Object.entries(
    decisions.reduce<Record<string, { count: number; scored: number[] }>>((acc, decision) => {
      const entry = (acc[decision.agent] ??= { count: 0, scored: [] });
      entry.count += 1;
      if (typeof decision.confidence === "number") entry.scored.push(decision.confidence);
      return acc;
    }, {})
  )
    .map(([agent, entry]) => ({
      agent,
      decisions: entry.count,
      meanConfidence:
        entry.scored.length > 0
          ? Math.round((entry.scored.reduce((a, b) => a + b, 0) / entry.scored.length) * 100)
          : null,
    }))
    .sort((a, b) => b.decisions - a.decisions);

  if (byAgent.length === 0) {
    return (
      <ChartFrame title="Decisions by agent" subtitle="Nothing recorded yet">
        <p className="py-6 text-center text-ng-sm text-ng-secondary">
          No agent has recorded a decision yet.
        </p>
      </ChartFrame>
    );
  }

  function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: (typeof byAgent)[number] }[] }) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
      <TooltipShell title={row.agent}>
        <p className="text-ng-xs text-ng-secondary">
          <span className="font-medium tabular-nums text-ng-primary">{row.decisions}</span> decision
          {row.decisions === 1 ? "" : "s"}
        </p>
        <p className="text-ng-xs text-ng-secondary">
          Mean confidence{" "}
          <span className="font-medium tabular-nums text-ng-primary">
            {row.meanConfidence === null ? "unscored" : `${row.meanConfidence}%`}
          </span>
        </p>
      </TooltipShell>
    );
  }

  return (
    <ChartFrame
      title="Decisions by agent"
      subtitle="How many decisions each specialist recorded, and how confident it was on average. These are the platform's own records, not a publisher's data"
    >
      <div className="w-full" style={{ height: Math.max(150, byAgent.length * 30 + 52) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={byAgent}
            layout="vertical"
            margin={{ top: 4, right: 40, bottom: 18, left: 8 }}
            barCategoryGap="30%"
          >
            <CartesianGrid {...GRID_PROPS} horizontal={false} />
            <XAxis
              type="number"
              allowDecimals={false}
              {...AXIS_PROPS}
              label={{
                value: "Decisions recorded",
                position: "insideBottom",
                offset: -2,
                fill: INK.secondary,
                fontSize: 11,
              }}
            />
            <YAxis type="category" dataKey="agent" width={150} {...AXIS_PROPS} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-accent-light)" }} />
            <Bar
              dataKey="decisions"
              fill={SERIES[0]}
              radius={[0, 4, 4, 0]}
              maxBarSize={20}
              stroke={INK.surface}
              strokeWidth={2}
            >
              <LabelList dataKey="decisions" position="right" {...VALUE_LABEL} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

/** Gate outcomes — status-coloured, because approved and rejected mean good and bad. */
export function GateOutcomeChart({
  gateDecisions,
}: {
  gateDecisions: { decision: string }[];
}) {
  const order = ["approved", "modified", "escalated", "rejected"];
  const rows = order.map((decision) => ({
    decision: decision[0].toUpperCase() + decision.slice(1),
    key: decision,
    count: gateDecisions.filter((g) => g.decision === decision).length,
  }));
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <ChartFrame
      title="Human decisions at the approval gate"
      subtitle={
        total === 0
          ? "No run has been decided yet — the gate is the one point a run is not autonomous"
          : `${total} decision${total === 1 ? "" : "s"} recorded. Approved and modified plans are delivered; rejected and escalated ones are decisions not to act`
      }
    >
      {total === 0 ? (
        <p className="py-6 text-center text-ng-sm text-ng-secondary">
          Run a coordination cycle on the dashboard and answer at the gate to populate this.
        </p>
      ) : (
        <div className="h-[210px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 20, right: 12, bottom: 18, left: 0 }}>
              <CartesianGrid {...GRID_PROPS} vertical={false} />
              <XAxis dataKey="decision" {...AXIS_PROPS} interval={0} />
              <YAxis
                allowDecimals={false}
                width={46}
                {...AXIS_PROPS}
                label={{
                  value: "Gate decisions",
                  angle: -90,
                  position: "insideLeft",
                  fill: INK.secondary,
                  fontSize: 11,
                  style: { textAnchor: "middle" },
                }}
              />
              <Tooltip
                cursor={{ fill: "var(--color-accent-light)" }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <TooltipShell title={String(label)}>
                      <p className="text-ng-xs text-ng-secondary">
                        <span className="font-medium tabular-nums text-ng-primary">
                          {payload[0].value as number}
                        </span>{" "}
                        of {total} gate decisions
                      </p>
                    </TooltipShell>
                  ) : null
                }
              />
              <Bar
                dataKey="count"
                radius={[4, 4, 0, 0]}
                maxBarSize={56}
                stroke={INK.surface}
                strokeWidth={2}
              >
                {rows.map((row) => (
                  <Cell key={row.key} fill={DECISION_COLOR[row.key]} />
                ))}
                <LabelList dataKey="count" position="top" {...VALUE_LABEL} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartFrame>
  );
}
