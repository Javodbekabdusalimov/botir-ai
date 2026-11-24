import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Loading({ label = "Yuklanmoqda..." }: { label?: string }) {
  return (
    <div role="status" className="space-y-2" aria-label={label}>
      <div className="shimmer h-4 w-2/3 rounded" />
      <div className="shimmer h-4 w-1/2 rounded" />
      <div className="shimmer h-4 w-3/5 rounded" />
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
      <AlertTriangle className="size-4 text-destructive" aria-hidden="true" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <Button variant="outline" className="h-11 px-4" onClick={onRetry}>
          <RotateCw className="size-4" aria-hidden="true" /> Qayta urinish
        </Button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-tint-3 bg-tint-1/50 p-5 text-center text-sm text-muted-foreground">{children}</p>;
}

export function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5", className)}>
      <h2 className="mb-3 font-display text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}
