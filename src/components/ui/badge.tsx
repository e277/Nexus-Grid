import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../../lib/utils";

/**
 * Status variants are drawn from the semantic tokens, never the categorical
 * chart palette — a status must not be mistaken for a data series.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
  {
    variants: {
      variant: {
        default: "bg-ng-accent-lit text-ng-accent",
        success: "border border-ng-success-bd bg-ng-success-bg text-ng-success-tx",
        warning: "border border-ng-warning-bd bg-ng-warning-bg text-ng-warning-tx",
        danger: "border border-ng-danger-bd bg-ng-danger-bg text-ng-danger-tx",
        info: "border border-ng-muted-bd bg-ng-info-bg text-ng-info-tx",
        muted: "border border-ng-muted-bd bg-ng-muted text-ng-muted-tx",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
