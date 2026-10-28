import { PipelineNav } from "@/components/admin/pipeline-nav";
import { requireAdmin } from "@/lib/admin/dal";

// Navigation only. As in app/admin/layout.tsx, every page and every query
// below checks admin itself; this layout is not the gate.
export default async function PipelineLayout({ children }: LayoutProps<"/admin/pipeline">) {
  await requireAdmin();
  return (
    <>
      <PipelineNav />
      {children}
    </>
  );
}
