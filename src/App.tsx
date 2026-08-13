"use client";

import { api } from "./api";
import { TopBar } from "./components/shell/TopBar";
import { usePoll } from "./hooks";
import { findPage } from "./navigation";
import { DashboardView } from "./views/DashboardView";

/**
 * One page, so the shell is one bar.
 *
 * The rail, the mobile drawer and the phone's tab bar were three ways to reach
 * seven destinations. There is one now — the loop and what it concluded, on the
 * same screen — and navigation that cannot navigate is chrome that costs
 * viewport without buying anything. What the rail carried besides links, the
 * brand and the runtime's status, is in the bar.
 */
export default function App() {
  const { data: health } = usePoll(() => api.health(), 30_000);
  const active = findPage("dashboard");

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ng-bg">
      <TopBar health={health} />

      <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {/* Capped rather than full-bleed: without the rail the charts would
            stretch to whatever the display is, and a bar chart four feet wide
            is harder to read than the same chart at a sane measure. */}
        <div className="mx-auto max-w-[1600px]">
          {/* What this screen is, before any numbers. */}
          <div className="mb-5">
            <h1 className="text-ng-2xl font-bold tracking-tight text-ng-primary">
              {active.title}
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-ng-secondary">{active.description}</p>
          </div>

          <DashboardView />
        </div>
      </main>
    </div>
  );
}
