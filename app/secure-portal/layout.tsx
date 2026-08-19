import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";
import portalData from "@/data/secure-portal.json";

export const metadata = createPageMetadata({
  title: "Secure File Transfer for Pentest Clients",
  description: portalData.seo.description,
  path: "/secure-portal",
});

export default function SecurePortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
