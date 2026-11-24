import { Suspense } from "react";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { LiveView } from "./live-view";

/** Ommaviy demo muzokara indekslanadi; haqiqiy foydalanuvchi muzokaralari (shaxsiy) noindex. */
const PUBLIC_DEMO_ID = "demo-chorsu";

export async function generateMetadata({ params }: PageProps<"/live/[id]">): Promise<Metadata> {
  const { id } = await params;
  const isDemo = id === PUBLIC_DEMO_ID;
  return pageMeta({
    title: isDemo ? "Agentlar muzokarasi: jonli namuna" : "Muzokara",
    description: "Ikki AI agent jonli muzokara qiladi: so'rov, taklif, qarshi taklif, bitim. Narx katalogdan, chegirma biznes limitidan oshmaydi.",
    path: `/live/${PUBLIC_DEMO_ID}`,
    noindex: !isDemo,
  });
}

async function Loader({ params }: PageProps<"/live/[id]">) {
  const { id } = await params;
  return <LiveView id={id} />;
}

export default function LivePage(props: PageProps<"/live/[id]">) {
  return (
    <Suspense fallback={<p className="p-8 text-center text-muted-foreground">Yuklanmoqda...</p>}>
      <Loader {...props} />
    </Suspense>
  );
}
