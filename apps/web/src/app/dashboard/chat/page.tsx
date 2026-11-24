import { TestAgent } from "./test-agent";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Agentni sinash", description: "Agentni sinash.", path: "/dashboard/chat", noindex: true });

export default function Page() {
  return <TestAgent />;
}
