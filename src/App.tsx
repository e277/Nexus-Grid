"use client";

import { useCallback, useEffect, useState } from "react";

import { api } from "./api";
import { Sidebar } from "./components/shell/Sidebar";
import { TopBar } from "./components/shell/TopBar";
import { usePoll } from "./hooks";
import { findPage, type PageId } from "./navigation";
import { DashboardView } from "./views/DashboardView";
import { DomainView } from "./views/DomainView";
import { ImpactView } from "./views/ImpactView";

const COLLAPSE_KEY = "nexus_grid_sidebar_collapsed";

export default function App() {
  const [page, setPage] = useState<PageId>("dashboard");
  const [collapsed, setCollapsed] = useState(false);

  // Read after mount: the server render has no localStorage, and the sidebar
  // width is not worth an inline script the way the theme is.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // Private browsing: the rail just starts expanded.
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // Ignored — the preference simply does not persist.
      }
      return next;
    });
  }, []);

  const { data: health } = usePoll(() => api.health(), 30_000);

  const active = findPage(page);

  return (
    <div className="flex h-screen overflow-hidden bg-ng-bg">
      <Sidebar
        page={page}
        onNavigate={setPage}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        health={health}
      />


      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar page={page} />

        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {/* Page heading: what this screen is, before any numbers. */}
          <div className="mb-5">
            <h1 className="text-ng-2xl font-bold tracking-tight text-ng-primary">
              {active.title}
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-ng-secondary">{active.description}</p>
          </div>

          {page === "dashboard" ? <DashboardView /> : null}
          {page === "impact" ? <ImpactView /> : null}
          {/* The four specialist readings are one component: they differ in
              which agent produced them, not in how a reading is presented.
              `key` remounts on navigation so a cell selected on one page does
              not carry over to the next. */}
          {active.domain ? (
            <DomainView key={active.domain} domain={active.domain} title={active.label} />
          ) : null}
        </main>

      </div>
    </div>
  );
}
