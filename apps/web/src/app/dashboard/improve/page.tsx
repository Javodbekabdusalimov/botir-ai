import { ImproveView } from "./improve-view";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Yaxshilash", description: "Agentni yaxshilash.", path: "/dashboard/improve", noindex: true });

export default function ImprovePage() {
  return <ImproveView />;
}

// Sahifa auth-guard ichida: kirishdan oldin render qilinmaydi
export const instant = false;
