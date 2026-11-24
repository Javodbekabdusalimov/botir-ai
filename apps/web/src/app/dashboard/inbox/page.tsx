import { InboxView } from "./inbox-view";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Inbox", description: "Mijozlar suhbatlari.", path: "/dashboard/inbox", noindex: true });

export default function InboxPage() {
  return <InboxView />;
}

// Sahifa auth-guard ichida: kirishdan oldin render qilinmaydi
export const instant = false;
