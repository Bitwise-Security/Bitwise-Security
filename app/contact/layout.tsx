import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Request a Pentest or Website Project",
  description:
    "Contact Bitwise Security to discuss a penetration test, security assessment, secure file exchange or professional website development project.",
  path: "/contact",
});

export default function ContactLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
