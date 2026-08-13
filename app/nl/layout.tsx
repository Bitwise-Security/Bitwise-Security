import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Pentesten en veilige websites in Nederland",
  description:
    "OSCP-, OSWE- en OSEP-gecertificeerde pentesten voor webapplicaties, Active Directory, Azure, mobiele apps, broncode en hardware.",
  path: "/",
  locale: "nl",
});

export default function DutchLayout({ children }: { children: ReactNode }) {
  return children;
}

