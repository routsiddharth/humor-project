import type { Metadata } from "next";

import { Nav } from "@/components/admin/nav";
import { Tooltips } from "@/components/admin/tooltips";
import { requireAdmin } from "@/lib/admin/dal";

import "./admin.css";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// The admin panel is a section of the site, under the same header. This
// layout calls requireAdmin() so nothing renders for anyone else, but it is
// NOT the gate on its own — layouts do not re-run on client navigation. Every
// page below calls requireAdmin() itself, every data function and Server
// Action calls assertAdmin(), and proxy.ts checks before any of them.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return (
    <div className="ad-root">
      <div className="ad-main">
        <Nav />
        {children}
      </div>
      <Tooltips />
    </div>
  );
}
