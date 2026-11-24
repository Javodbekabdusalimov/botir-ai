import { Overview } from "./overview";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Panel", description: "Biznes paneli.", path: "/dashboard", noindex: true });

export default function DashboardPage() {
  return <Overview />;
}

// Sahifa auth-guard ichida: kirishdan oldin render qilinmaydi
export const instant = false;
