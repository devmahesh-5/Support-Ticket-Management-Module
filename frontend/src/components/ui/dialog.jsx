import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "./utils";
import { Button } from "./button";

export function Dialog({ open, onOpenChange, children, className }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onOpenChange?.(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
        onClick={() => onOpenChange?.(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl",
          className
        )}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

export function DialogHeader({ children, className }) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-4", className)}>
      <div>{children}</div>
    </div>
  );
}

export function DialogTitle({ children, className }) {
  return <h2 className={cn("text-lg font-semibold text-slate-900", className)}>{children}</h2>;
}

export function DialogDescription({ children, className }) {
  return <p className={cn("mt-1 text-sm text-slate-500", className)}>{children}</p>;
}

export function DialogClose({ onClick, children, ...props }) {
  return (
    <Button variant="secondary" onClick={onClick} {...props}>
      {children}
    </Button>
  );
}
