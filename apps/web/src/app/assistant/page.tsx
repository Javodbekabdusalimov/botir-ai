import { AssistantChat } from "./assistant-chat";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Shaxsiy yordamchi", description: "Shaxsiy AI yordamchiga yozing: \"Ertaga 6 kishilik osh joy band qil\". Agent bizneslar bilan muzokara qiladi, siz faqat tasdiqlaysiz.", path: "/assistant" });

export default function AssistantPage() {
  return <AssistantChat />;
}
