import { ImproveView } from "./improve-view";

export const metadata = { title: "Yaxshilash | Botir AI" };

export default function ImprovePage() {
  return <ImproveView />;
}

// Sahifa auth-guard ichida: kirishdan oldin render qilinmaydi
export const instant = false;
