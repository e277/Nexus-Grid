"use client";

import { CoverageNote } from "../components/CoverageNote";
import { ProductionTrendChart } from "../components/charts/ProductionTrendChart";

/**
 * Planning evidence that is measured, and the forecast that is not attempted.
 *
 * The production series is observed and the direction across it is arithmetic,
 * so both are safe to show. A yield forecast is not: it would need a per-crop
 * historical series this deployment cannot reach, and producing one anyway
 * would mean inventing the numbers under the curve.
 */
export function CropPlanningView() {
  return (
    <div className="space-y-4">
      <CoverageNote
        level="partial"
        covered={
          <>
            The observed change in each member state&rsquo;s food production index across the
            World Bank series — measured output, over a stated window. The planting side of
            the same question is on{" "}
            <span className="font-medium">Regional Planting Coordination</span>, which shows
            the months the region can and cannot start a rain-fed season.
          </>
        }
        missing={
          <>
            A yield forecast. Nothing here projects a future harvest, a future price, or a
            future shortage, and no chart on this page should be read as doing so.
          </>
        }
        requires={
          <>
            A historical yield series per crop per member state — FAOSTAT&rsquo;s country
            series, CARDI trial data, or ministry returns. FAOSTAT&rsquo;s open API now
            requires a key and the others are not published as machine-readable feeds, so
            none is used here. Every source in this console is free and keyless so its
            figures can be reproduced, and a forecast built on a series a reader cannot
            check would be the one claim in it that nobody could verify.
          </>
        }
      />

      <ProductionTrendChart />
    </div>
  );
}
