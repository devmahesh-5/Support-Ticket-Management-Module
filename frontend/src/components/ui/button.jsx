import React from "react";
import { cn } from "./utils";

const buttonVariants = {
  default:
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
  secondary:
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:pointer-events-none disabled:opacity-50 bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 shadow-sm",
  outline:
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:pointer-events-none disabled:opacity-50 border border-slate-300 text-slate-700 hover:bg-slate-100",
  ghost:
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 text-slate-600 hover:bg-slate-100",
  destructive:
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:pointer-events-none disabled:opacity-50 bg-rose-600 text-white hover:bg-rose-700 shadow-sm",
  link: "text-sm font-medium text-brand-600 underline-offset-4 hover:underline",
};

const buttonSizes = {
  default: "h-9 px-4 py-2",
  sm: "h-8 rounded-md px-3 text-xs",
  lg: "h-10 rounded-md px-6",
  icon: "h-9 w-9",
};

export const Button = React.forwardRef(
  ({ className, variant = "default", size = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants[variant], buttonSizes[size], className)}
      {...props}
    />
  )
);
Button.displayName = "Button";
