import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";
import reporterData from "@/data/reporter.json";

export const metadata = createPageMetadata({
  title: "Pentest Reporting & Client Portal",
  description: reporterData.seo.description,
  path: "/reporter",
});

export default function ReporterLayout({ children }: { children: ReactNode }) {
  return children;
}

