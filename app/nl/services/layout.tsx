import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Pentesten en veilige websiteontwikkeling",
  description:
    "Handmatige beveiligingstests voor web, Active Directory, Azure, mobiele apps, broncode en hardware, plus veilige websiteontwikkeling.",
  path: "/services",
  locale: "nl",
});

export default function DutchServicesLayout({ children }: { children: ReactNode }) {
  return children;
}

