const SOURCE_LABEL: Record<string, string> = {
  "open-meteo": "Open-Meteo (live)",
  "noaa-nhc": "NOAA NHC (live)",
  "geo-estimate": "Real geo distance",
  reference: "Reference price",
  stub: "Stub (no live source)",
};

/** Small pill row disclosing where a prediction's numbers actually came
 * from — same "don't let real data look indistinguishable from a stub"
 * treatment as RecommendationCard, for the intelligence endpoints. */
export function SourceBadges({ sources }: { sources: (string | undefined | null)[] }) {
  const unique = Array.from(new Set(sources.filter((s): s is string => Boolean(s))));
  if (unique.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {unique.map((s) => (
        <span
          key={s}
          className="rounded-full border border-ng-border bg-ng-surface px-2 py-0.5 text-ng-2xs font-semibold text-ng-secondary"
        >
          {SOURCE_LABEL[s] ?? s}
        </span>
      ))}
    </div>
  );
}
