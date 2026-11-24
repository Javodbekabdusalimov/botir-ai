import { RequireUser } from "@/components/require-role";

export default function MeLayout({ children }: { children: React.ReactNode }) {
  return <RequireUser>{children}</RequireUser>;
}
