import { pageMeta } from "@/lib/seo";
import { AdminPanel } from "./admin-panel";

/** Faqat egalar uchun (ADMIN_PHONES): menyu/footerda havola yo'q, qidiruvdan yopiq (robots.ts + noindex). */
export const metadata = pageMeta({ title: "Admin", description: "Life Assistant egalari paneli: mijozlar va to'lovlar.", path: "/admin", noindex: true });

export default function AdminPage() {
  return <AdminPanel />;
}
