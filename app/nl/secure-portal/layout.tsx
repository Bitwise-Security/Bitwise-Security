import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";
import portalData from "@/data/secure-portal.nl.json";

export const metadata = createPageMetadata({
  title: "Veilige bestandsoverdracht voor pentestklanten",
  description: portalData.seo.description,
  path: "/secure-portal",
  locale: "nl",
});

export default function DutchPortalLayout({ children }: { children: ReactNode }) {
  return children;
}

