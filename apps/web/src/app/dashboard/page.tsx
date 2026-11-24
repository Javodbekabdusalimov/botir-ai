import { Overview } from "./overview";

export const metadata = { title: "Panel | Botir AI" };

export default function DashboardPage() {
  return <Overview />;
}

// Sahifa auth-guard ichida: kirishdan oldin render qilinmaydi
export const instant = false;
