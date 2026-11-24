import { InboxView } from "./inbox-view";

export const metadata = { title: "Inbox | Botir AI" };

export default function InboxPage() {
  return <InboxView />;
}

// Sahifa auth-guard ichida: kirishdan oldin render qilinmaydi
export const instant = false;
