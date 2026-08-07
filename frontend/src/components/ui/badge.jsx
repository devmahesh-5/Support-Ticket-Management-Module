import React from "react";
import { cn } from "./utils";

const badgeVariants = {
  default: "bg-brand-100 text-brand-700 border-transparent",
  success: "bg-emerald-100 text-emerald-700 border-transparent",
  warning: "bg-amber-100 text-amber-700 border-transparent",
  danger: "bg-rose-100 text-rose-700 border-transparent",
  info: "bg-slate-100 text-slate-700 border-transparent",
  outline: "text-slate-700 border-slate-300",
};

export const Badge = React.forwardRef(
  ({ className, variant = "default", ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
        badgeVariants[variant],
        className
      )}
      {...props}
    />
  )
);
Badge.displayName = "Badge";
