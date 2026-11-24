import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Loading({ label = "Yuklanmoqda..." }: { label?: string }) {
  return (
    <div role="status" className="animate-pulse space-y-2" aria-label={label}>
      <div className="h-4 w-2/3 rounded bg-muted" />
      <div className="h-4 w-1/2 rounded bg-muted" />
      <div className="h-4 w-3/5 rounded bg-muted" />
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
  return <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">{children}</p>;
}

export function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card/60 p-4 sm:p-5", className)}>
      <h2 className="mb-3 font-display text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}
