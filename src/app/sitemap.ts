import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://localhost:3000";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/gallery`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/pricing`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/auth`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];

  try {
    const res = await fetch(`${API_BASE_URL}/gallery?page=1&pageSize=100`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data = await res.json();
      const modelRoutes: MetadataRoute.Sitemap = (
        data.models as Array<{ id: string; createdAt: string }>
      ).map((model) => ({
        url: `${SITE_URL}/models/${model.id}/public`,
        lastModified: new Date(model.createdAt),
        changeFrequency: "monthly" as const,
        priority: 0.6,
      }));
      return [...staticRoutes, ...modelRoutes];
    }
  } catch {
    // noop — return static routes only
  }

  return staticRoutes;
}
