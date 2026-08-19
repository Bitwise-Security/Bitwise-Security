import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "OSCP, OSWE & OSEP Security Specialist",
  description:
    "Meet the Bitwise Security specialist behind hands-on penetration testing, practical remediation guidance and secure delivery in the Netherlands.",
  path: "/about",
});

export default function AboutLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
