import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../../lib/utils";

/**
 * Status variants are drawn from the semantic tokens, never the categorical
 * chart palette — a status must not be mistaken for a data series.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full font-semibold leading-normal",
  {
    variants: {
      variant: {
        default: "bg-ng-accent-lit text-ng-accent",
        success: "border border-ng-success-bd bg-ng-success-bg text-ng-success-tx",
        warning: "border border-ng-warning-bd bg-ng-warning-bg text-ng-warning-tx",
        danger: "border border-ng-danger-bd bg-ng-danger-bg text-ng-danger-tx",
        info: "border border-ng-info-bd bg-ng-info-bg text-ng-info-tx",
        /** Model output, as opposed to anything the projection computed. */
        ai: "border border-ng-ai-bd bg-ng-ai-bg text-ng-ai-tx",
        muted: "border border-ng-muted-bd bg-ng-muted text-ng-muted-tx",
        outline: "border border-ng-border text-ng-secondary",
      },
      size: {
        default: "px-2 py-0.5 text-ng-xs",
        sm: "px-1.5 py-0 text-ng-2xs",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { badgeVariants };
