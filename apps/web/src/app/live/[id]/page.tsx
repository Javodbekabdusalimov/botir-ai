import { Suspense } from "react";
import { LiveView } from "./live-view";

async function Loader({ params }: PageProps<"/live/[id]">) {
  const { id } = await params;
  return <LiveView id={id} />;
}

export default function LivePage(props: PageProps<"/live/[id]">) {
  return (
    <Suspense fallback={<p className="p-8 text-center text-muted-foreground">Yuklanmoqda...</p>}>
      <Loader {...props} />
    </Suspense>
  );
}
