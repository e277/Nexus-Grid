"use client";

import { geoMercator, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import { useMemo, useState } from "react";

import caricom from "../../lib/geo/caricom-50m.json";
import { cn } from "../../lib/utils";
import type { Lane, PortExposure } from "../../types";
import { ChartFrame, compact, INK } from "./chart-kit";

const CANVAS = { width: 900, height: 470 };

const STATUS_STROKE: Record<string, string> = {
  clear: "var(--color-success)",
  watch: "var(--color-warning)",
  at_risk: "var(--color-danger)",
};

const LAND = caricom as FeatureCollection<Geometry, { iso3: string; name: string }>;

/**
 * The region as a network: the member states themselves, and the lanes between
 * them.
 *
 * A table of sixty lanes answers "what is the transit on this one" and hides
 * what a coordination layer is for — that the region's food moves through a
 * handful of hubs, and that the busiest of them sit under the same weather.
 *
 * Coastlines are Natural Earth at 50m, cut to the fifteen member states and
 * committed as a 20KB asset. The projection is a real Mercator fitted to those
 * shapes rather than a hand-rolled linear scale, so an island is where it is
 * and the distances the transit estimates are computed from are the distances
 * on screen.
 *
 * A state with no lane is still drawn. The region is the region whether or not
 * this quarter's trade data gives it a lane, and a map that omitted it would
 * imply it had left.
 */
export function CaribbeanMap({
  lanes,
  ports,
}: {
  lanes: Lane[];
  ports: PortExposure[];
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const { path, project } = useMemo(() => {
    const projection = geoMercator().fitExtent(
      [
        [18, 18],
        [CANVAS.width - 18, CANVAS.height - 30],
      ],
      LAND
    );
    return { path: geoPath(projection), project: projection };
  }, []);

  const positions = useMemo(() => {
    const out = new Map<string, { x: number; y: number }>();
    for (const port of ports) {
      if (!Array.isArray(port.coordinates)) continue;
      // GeoJSON order is [longitude, latitude]; ours is [lat, lon].
      const xy = project([port.coordinates[1], port.coordinates[0]]);
      if (xy) out.set(port.iso3, { x: xy[0], y: xy[1] });
    }
    return out;
  }, [ports, project]);

  const drawable = lanes.filter(
    (l) => positions.has(l.supplier_iso3) && positions.has(l.importer_iso3)
  );
  const maxValue = Math.max(1, ...drawable.map((l) => l.external_usd));
  const maxLanes = Math.max(1, ...ports.map((p) => p.lanes));
  const hoveredLane = drawable.find(
    (l) => `${l.supplier_iso3}-${l.importer_iso3}-${l.commodity}` === hovered
  );

  return (
    <ChartFrame
      title="The region, and the lanes between it"
      subtitle={`${drawable.length} lanes across ${positions.size} member states. Line weight is the import value a lane could displace; colour is the weather at its two ends`}
      variant="supporting"
    >
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}
          className="h-auto w-full min-w-[680px]"
          role="img"
          aria-label={`Map of CARICOM member states and the ${drawable.length} supplier-to-importer lanes between them`}
        >
          {/* Land first, recessive: it is the frame the lanes are read
              against, not a layer competing with them. */}
          <g>
            {LAND.features.map((f) => (
              <path
                key={f.properties.iso3}
                d={path(f) ?? undefined}
                fill="var(--color-muted)"
                stroke={INK.grid}
                strokeWidth={0.6}
              />
            ))}
          </g>

          <g>
            {drawable.map((lane) => {
              const from = positions.get(lane.supplier_iso3)!;
              const to = positions.get(lane.importer_iso3)!;
              const key = `${lane.supplier_iso3}-${lane.importer_iso3}-${lane.commodity}`;
              const active = hovered === key;

              // Bowed, so the two directions of a pair do not sit on top of
              // each other and read as one line.
              const mx = (from.x + to.x) / 2;
              const my = (from.y + to.y) / 2;
              const dx = to.x - from.x;
              const dy = to.y - from.y;
              const bow = 0.14;

              return (
                <path
                  key={key}
                  d={`M ${from.x} ${from.y} Q ${mx - dy * bow} ${my + dx * bow} ${to.x} ${to.y}`}
                  fill="none"
                  stroke={STATUS_STROKE[lane.status] ?? INK.grid}
                  strokeWidth={active ? 3 : 0.7 + (lane.external_usd / maxValue) * 2.4}
                  strokeOpacity={hovered === null ? 0.55 : active ? 0.95 : 0.1}
                  strokeLinecap="round"
                  className="cursor-pointer transition-[stroke-opacity,stroke-width]"
                  onMouseEnter={() => setHovered(key)}
                  onMouseLeave={() => setHovered(null)}
                />
              );
            })}
          </g>

          <g>
            {ports.map((port) => {
              const at = positions.get(port.iso3);
              if (!at) return null;
              // Radius carries how many lanes touch this port; the hubs are
              // the point of the picture.
              const r = 3.5 + (port.lanes / maxLanes) * 7;
              const touched =
                hoveredLane &&
                (hoveredLane.supplier_iso3 === port.iso3 ||
                  hoveredLane.importer_iso3 === port.iso3);

              return (
                <g key={port.iso3}>
                  <circle
                    cx={at.x}
                    cy={at.y}
                    r={r}
                    fill="var(--color-accent)"
                    fillOpacity={hovered === null || touched ? 0.9 : 0.2}
                    stroke={INK.surface}
                    strokeWidth={1.5}
                  />
                  <text
                    x={at.x}
                    y={at.y - r - 4}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={touched ? 700 : 500}
                    fill={hovered === null || touched ? INK.primary : INK.muted}
                  >
                    {port.name}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Identity is never colour alone: the key names each status, and the
          hovered lane prints its own figures here rather than only in a
          tooltip. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-ng-border pt-2.5">
        {Object.entries(STATUS_STROKE).map(([status, colour]) => (
          <span key={status} className="flex items-center gap-1.5 text-ng-2xs text-ng-secondary">
            <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: colour }} />
            {status === "at_risk" ? "At risk" : status === "watch" ? "Watch" : "Clear"}
          </span>
        ))}
        <span className="text-ng-2xs text-ng-secondary">· dot size is lanes through that port</span>
        <span
          className={cn("ml-auto text-ng-2xs", hoveredLane ? "text-ng-primary" : "text-ng-disabled")}
        >
          {hoveredLane
            ? `${hoveredLane.supplier} → ${hoveredLane.importer} · ${hoveredLane.commodity} · ${Math.round(
                hoveredLane.transit_hours
              )}h · ${compact(hoveredLane.external_usd)}`
            : "Hover a lane for its transit and value"}
        </span>
      </div>
    </ChartFrame>
  );
}
