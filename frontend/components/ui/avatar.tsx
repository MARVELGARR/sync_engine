import * as React from "react";
import { cn } from "@/lib/utils";

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  // Stable hue from name, constrained to blues for the design system
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const shades = ["bg-brand-600", "bg-brand-500", "bg-brand-700", "bg-sky-600", "bg-indigo-600"];
  const shade = shades[hash % shades.length];
  return (
    <span
      title={name}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ring-2 ring-white",
        shade,
        className
      )}
    >
      {initials || "?"}
    </span>
  );
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-brand-100", className)} {...props} />;
}

export function Separator({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-brand-100", className)} />;
}

export function Alert({
  variant = "default",
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "destructive" }) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-md border px-4 py-3 text-sm",
        variant === "destructive"
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-brand-200 bg-brand-50 text-brand-800",
        className
      )}
      {...props}
    />
  );
}
