import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";
import reporterData from "@/data/reporter.nl.json";

export const metadata = createPageMetadata({
  title: "Pentest-rapportage en klantportaal",
  description: reporterData.seo.description,
  path: "/reporter",
  locale: "nl",
});

export default function DutchReporterLayout({ children }: { children: ReactNode }) {
  return children;
}

