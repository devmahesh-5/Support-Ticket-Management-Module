import React, { createContext, useContext } from "react";
import { Controller, useForm as useRHF } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "./utils";
import { Label } from "./label";

export { useRHF, Controller };

export function useForm({ schema, defaultValues, resolver, ...options }) {
  return useRHF({
    defaultValues,
    ...options,
    resolver: resolver || (schema ? zodResolver(schema) : undefined),
  });
}

const FormContext = createContext(null);

export function Form({ form, onSubmit, className, children }) {
  return (
    <FormContext.Provider value={form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className={cn("space-y-4", className)} noValidate>
        {children}
      </form>
    </FormContext.Provider>
  );
}

/**
 * FormField renders a labelled, controlled form row.
 * children is a render function: ({ field, error }) => <Input {...field} />
 */
export function FormField({ name, label, description, children }) {
  const form = useContext(FormContext);
  if (!form) return null;
  const error = form?.formState?.errors?.[name];

  return (
    <Controller
      name={name}
      control={form.control}
      render={({ field }) => (
        <div className="space-y-1.5">
          {label && <Label htmlFor={name}>{label}</Label>}
          {typeof children === "function" ? children({ field, error }) : children}
          {description && !error && (
            <p className="text-xs text-slate-500">{description}</p>
          )}
          {error && <p className="text-xs text-rose-600">{error.message}</p>}
        </div>
      )}
    />
  );
}

export function useFormContext() {
  return useContext(FormContext);
}
