import * as React from "react";

import { cn } from "../../lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-8 w-full rounded-md border border-ng-border bg-ng-bg px-2.5 text-ng-sm text-ng-primary placeholder:text-ng-disabled focus:outline-none focus-visible:border-ng-accent focus-visible:ring-2 focus-visible:ring-ng-accent",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-md border border-ng-border bg-ng-bg px-2.5 py-2 text-ng-sm leading-relaxed text-ng-primary placeholder:text-ng-disabled focus:outline-none focus-visible:border-ng-accent focus-visible:ring-2 focus-visible:ring-ng-accent",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
