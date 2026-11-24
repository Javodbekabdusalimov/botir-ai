import { ConnectForm } from "./connect-form";

export const metadata = { title: "Biznesni ulash | Botir AI" };

export default function ConnectPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <p className="text-sm font-medium text-biz">Biznes uchun</p>
      <h1 className="mt-1 text-3xl font-bold sm:text-5xl">Biznesingizni ulang, agent tayyor bo'ladi</h1>
      <p className="mt-3 text-muted-foreground">
        Ma'lumot va katalogni kiriting. Agent narxlar va chegirma chegarasini o'zi biladi.
      </p>
      <ConnectForm />
    </div>
  );
}
