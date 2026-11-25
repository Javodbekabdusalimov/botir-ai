import { RegisterForm } from "./register-form";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Ro'yxatdan o'tish", description: "Life Assistant'da bepul ro'yxatdan o'ting: biznes uchun AI sotuvchi yoki mijoz uchun shaxsiy yordamchi. Free tarifi bepul.", path: "/register" });

export default function RegisterPage() {
  return <RegisterForm />;
}
