import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Vraag een pentest of websiteproject aan",
  description:
    "Neem contact op met Bitwise Security voor een pentest, beveiligingsaudit of professionele website.",
  path: "/contact",
  locale: "nl",
});

export default function DutchContactLayout({ children }: { children: ReactNode }) {
  return children;
}

