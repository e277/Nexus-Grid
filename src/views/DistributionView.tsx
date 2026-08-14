"use client";

import { CoverageNote } from "../components/CoverageNote";

/**
 * The build area this platform does not implement.
 *
 * Kept as a page rather than dropped, because the gap is worth stating: a
 * reader comparing the console against the track's build brief should find an
 * answer here rather than an absence they have to interpret. What it says is
 * what is true — the demand half is derivable from trade data and already
 * drives the loop, the stock half is not published anywhere free, and nothing
 * on this page pretends otherwise.
 */
export function DistributionView() {
  return (
    <div className="space-y-4">
      <CoverageNote
        level="none"
        missing={
          <>
            Warehouse and inventory optimisation. There is no stock position, no storage
            capacity, no spoilage rate and no distribution schedule anywhere in this
            platform, and no page infers one.
          </>
        }
        requires={
          <>
            Per-market inventory and warehouse data — held by ministries, distributors and
            port operators, and not published as an open feed for any CARICOM member state.
            Trade statistics record what crossed a border, not what is sitting in a
            warehouse behind it, so the gap cannot be closed by reading the sources already
            here more carefully.
          </>
        }
      >
        <div className="mt-3 border-t border-ng-warning-bd pt-3">
          <p className="text-ng-2xs font-bold uppercase tracking-[.6px] text-ng-secondary">
            What the platform does instead
          </p>
          <p className="mt-0.5 max-w-4xl text-ng-sm leading-relaxed text-ng-primary">
            Distribution has a demand half and a stock half. The demand half is observable
            in trade flows and drives the whole loop: which member state needs which
            commodity, at what value, and which neighbour already supplies it.{" "}
            <span className="font-medium">Farm-to-Market Intelligence</span> sizes it,{" "}
            <span className="font-medium">Freight Matching</span> works out how it would
            move, and the approval gate decides whether to act. Optimising stock across
            island markets sits one dataset beyond that, and this page will stay a note
            until that dataset exists.
          </p>
        </div>
      </CoverageNote>
    </div>
  );
}
