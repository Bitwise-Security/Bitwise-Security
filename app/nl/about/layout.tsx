import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Over de beveiligingsspecialist",
  description:
    "Maak kennis met de OSCP-, OSWE- en OSEP-gecertificeerde specialist achter Bitwise Security en de praktische aanpak van beveiligingsonderzoek.",
  path: "/about",
  locale: "nl",
});

export default function DutchAboutLayout({ children }: { children: ReactNode }) {
  return children;
}

