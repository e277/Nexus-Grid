import type { Metadata } from "next";

import "../index.css";

export const metadata: Metadata = {
  title: "Nexus-Grid · Operator Console",
  description: "Autonomous Caribbean Food Supply Chain AI",
};

/**
 * Applies the stored theme before first paint.
 *
 * Without this the page renders in the system theme and then snaps to the
 * stored one — and because the value comes from localStorage, it cannot be
 * known during the server render. Setting the attribute inline is what keeps
 * that flash from happening.
 */
const THEME_SCRIPT = `
try {
  var stored = localStorage.getItem("nexus_grid_theme");
  if (stored === "light" || stored === "dark") {
    document.documentElement.dataset.theme = stored;
  }
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
