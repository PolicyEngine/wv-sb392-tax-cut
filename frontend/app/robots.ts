import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: 'https://policyengine.org/us/nj-ctc-eitc-expansion/sitemap.xml',
  };
}
