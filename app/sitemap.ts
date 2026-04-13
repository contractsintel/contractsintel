import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://contractsintel.com";
  const now = new Date().toISOString();

  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${base}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/security`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
