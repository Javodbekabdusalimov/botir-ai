import { KnowledgeView } from "./knowledge-view";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Bilimlar", description: "Biznes bilimi: manbalar, faktlar, ochiq savollar.", path: "/dashboard/knowledge", noindex: true });

export default function KnowledgePage() {
  return <KnowledgeView />;
}

// Sahifa auth-guard ichida: kirishdan oldin render qilinmaydi
export const instant = false;
