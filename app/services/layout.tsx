import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Penetration Testing & Secure Web Services",
  description:
    "Explore Bitwise Security services for web applications, Active Directory, Azure, mobile apps, source code, hardware and secure website development.",
  path: "/services",
});

export default function ServicesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
