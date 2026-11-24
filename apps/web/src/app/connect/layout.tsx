import { RequireBusiness } from "@/components/require-role";

export default function ConnectLayout({ children }: { children: React.ReactNode }) {
  return <RequireBusiness>{children}</RequireBusiness>;
}
