import { Suspense } from "react";
import { Checkout } from "./checkout";

export const metadata = { title: "TezCheck to'lov | Botir AI" };

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
