"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../../lib/utils";

/**
 * Variants map onto the design tokens, so both themes are covered without a
 * per-variant dark override.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-ng-accent text-ng-accent-fg hover:bg-ng-accent-hov",
        outline: "border border-ng-border bg-ng-surface text-ng-primary hover:bg-ng-bg",
        ghost: "text-ng-secondary hover:bg-ng-bg hover:text-ng-primary",
        success: "bg-ng-success text-white hover:opacity-90",
        danger:
          "border border-ng-danger-bd bg-ng-surface text-ng-danger-tx hover:bg-ng-danger-bg",
        link: "text-ng-accent underline decoration-dotted underline-offset-2 hover:decoration-solid",
      },
      size: {
        default: "h-9 px-3.5 py-2",
        sm: "h-8 px-3 text-[13px]",
        icon: "h-8 w-8",
        full: "h-10 w-full px-4",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
