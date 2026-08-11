import type { ReactNode } from "react";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

interface PanelProps {
  title: string;
  subtitle?: string;
  action?: { label: string; onClick?: () => void };
  children: ReactNode;
  noPad?: boolean;
}

/** A titled section — a thin wrapper over Card so callers keep one shape. */
export function Panel({ title, subtitle, action, children, noPad }: PanelProps) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
        </div>
        {action ? (
          <Button variant="link" size="sm" onClick={action.onClick} className="shrink-0 px-0">
            {action.label}
          </Button>
        ) : null}
      </CardHeader>
      {noPad ? children : <CardContent>{children}</CardContent>}
    </Card>
  );
}
