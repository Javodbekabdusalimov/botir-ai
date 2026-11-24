import { Suspense } from "react";
import { LockKeyhole } from "lucide-react";
import { shortId } from "@/lib/format";

export const metadata = { title: "TezCheck to'lov | Botir AI" };

async function Body({ params }: PageProps<"/pay/[orderId]">) {
  const { orderId } = await params;
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="rounded-3xl border border-border bg-card p-6 text-center shadow-soft">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-tint-2 text-green-800">
          <LockKeyhole className="size-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-2xl font-extrabold">TezCheck</h1>
        <p className="mt-1 text-sm text-muted-foreground">Buyurtma #{shortId(orderId)} · demo to&apos;lov sahifasi</p>
        <div className="mt-5 flex justify-center gap-2 text-sm">
          {["Payme", "Click", "Uzum"].map((n) => (
            <span key={n} className="rounded-lg border border-border px-3 py-1.5 font-medium">
              {n}
            </span>
          ))}
        </div>
        <p className="mt-5 rounded-xl bg-tint-1 p-3 text-sm text-green-900">To&apos;lov qabul qilinmoqda. Bu oynani yopib, Botir AI sahifasiga qaytishingiz mumkin: holat o&apos;zi yangilanadi.</p>
      </div>
    </div>
  );
}

export default function PayPage(props: PageProps<"/pay/[orderId]">) {
  return (
    <Suspense fallback={<div className="mx-auto h-64 max-w-md animate-pulse rounded-3xl bg-muted" />}>
      <Body {...props} />
    </Suspense>
  );
}
