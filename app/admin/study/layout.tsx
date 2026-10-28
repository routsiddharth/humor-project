import { StudyNav } from "@/components/admin/study-nav";
import { requireAdmin } from "@/lib/admin/dal";

// Navigation only. As in app/admin/layout.tsx, every page and every query
// below checks admin itself; this layout is not the gate.
export default async function StudyLayout({ children }: LayoutProps<"/admin/study">) {
  await requireAdmin();
  return (
    <>
      <StudyNav />
      {children}
    </>
  );
}
