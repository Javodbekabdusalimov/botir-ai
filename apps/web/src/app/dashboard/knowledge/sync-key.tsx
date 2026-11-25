"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/states";
import { createSyncKey } from "@/lib/api";

/** Kassa / 1C sinxron kaliti: faqat bir marta ko'rsatiladi. */
export function SyncKey({ businessId }: { businessId: string }) {
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Panel title="Kassa / 1C sinxron">
      <p className="mb-3 text-sm text-muted-foreground">iiko, 1C yoki o&apos;z skriptingiz <code className="rounded bg-muted px-1">POST /sync/catalog</code> ga narx va qoldiqni yuborsin. Kalit faqat bir marta ko&apos;rsatiladi.</p>
      {key ? (
        <div className="space-y-2">
          <code className="block break-all rounded-lg bg-muted p-2 text-xs">{key}</code>
          <Button variant="outline" onClick={() => navigator.clipboard?.writeText(key)}>Nusxa olish</Button>
          <p className="text-xs font-semibold text-amber-700">Hozir saqlab qo&apos;ying: sahifadan chiqsangiz qayta ko&apos;rinmaydi.</p>
        </div>
      ) : (
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              setKey((await createSyncKey(businessId)).key);
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Xatolik");
            } finally {
              setBusy(false);
            }
          }}
        >
          <KeyRound className="size-4" aria-hidden="true" /> Kalit yaratish
        </Button>
      )}
      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
    </Panel>
  );
}
