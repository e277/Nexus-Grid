"use client";

import { createContext, useContext } from "react";

export type ViewerRole = "viewer" | "operator" | "admin";

/** The signed-in person, as the console needs to know them. */
export interface Viewer {
  name: string | null;
  email: string;
  role: ViewerRole;
}

const ViewerContext = createContext<Viewer | null>(null);

export const ViewerProvider = ViewerContext.Provider;

export function useViewer(): Viewer | null {
  return useContext(ViewerContext);
}

/**
 * Whether the viewer may start runs and decide gates. A hint for the UI only:
 * the API enforces the same rule, so a control left enabled by mistake is
 * refused there rather than obeyed.
 */
export function useCanOperate(): boolean {
  const role = useViewer()?.role;
  return role === "operator" || role === "admin";
}
