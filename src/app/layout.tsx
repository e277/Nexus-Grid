import type { Metadata } from "next";

import "../index.css";

export const metadata: Metadata = {
  title: "Nexus-Grid · Operator Console",
  description: "Autonomous Caribbean Food Supply Chain AI",
};

/**
 * Applies the stored theme before first paint.
 *
 * The stylesheet's bare `:root` is dark, so an unstamped document is already
 * the mode the console is designed for and there is nothing to correct. This
 * only matters for a reader who has chosen light: that value lives in
 * localStorage, is unknowable during the server render, and without an inline
 * stamp the page would paint dark and then snap.
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
