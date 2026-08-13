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

  const englishPages = [...corePages, ...servicePages];
  const dutchPages = englishPages.map((path) =>
    path === "" ? "/nl" : `/nl${path}`,
  );

  return [...englishPages, ...dutchPages].map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: path === "" || path === "/nl" ? "monthly" : "yearly",
    priority:
      path === "" || path === "/nl"
        ? 1
        : path === "/services" || path === "/nl/services"
          ? 0.9
          : 0.7,
  }));
}
