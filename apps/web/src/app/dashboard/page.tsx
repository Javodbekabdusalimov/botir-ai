import { Overview } from "./overview";
import { AgentRoom } from "./agent-room";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Panel", description: "Biznes paneli.", path: "/dashboard", noindex: true });

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <AgentRoom />
      <Overview />
    </div>
  );
}

// Sahifa auth-guard ichida: kirishdan oldin render qilinmaydi
export const instant = false;
