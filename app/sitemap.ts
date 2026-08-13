import type { MetadataRoute } from "next";
import servicesData from "@/data/services.json";
import { SITE_URL } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const corePages = [
    "",
    "/services",
    "/reporter",
    "/secure-portal",
    "/about",
    "/contact",
    "/privacy",
  ];

  const servicePages = servicesData.services.map(
    (service) => `/services/${service.id}`,
  );

  return [...corePages, ...servicePages].map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: path === "" ? "monthly" : "yearly",
    priority: path === "" ? 1 : path === "/services" ? 0.9 : 0.7,
  }));
}
