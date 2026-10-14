import { redirect } from "next/navigation";

import { HOME } from "@/lib/routes";

// The joke list is public, so there is no separate pitch page to show first.
export default function Root() {
  redirect(HOME);
}
