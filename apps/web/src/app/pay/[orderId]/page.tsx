import { Suspense } from "react";
import { Checkout } from "./checkout";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "TezCheck to'lov", description: "TezCheck orqali xavfsiz to'lov: Payme, Click yoki Uzum.", path: "/pay", noindex: true });

async function Body({ params }: PageProps<"/pay/[orderId]">) {
  const { orderId } = await params;
  return <Checkout orderId={orderId} />;
}

export default function PayPage(props: PageProps<"/pay/[orderId]">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-10 h-64 max-w-[1100px] animate-pulse rounded-3xl bg-muted" />}>
      <Body {...props} />
    </Suspense>
  );
}
