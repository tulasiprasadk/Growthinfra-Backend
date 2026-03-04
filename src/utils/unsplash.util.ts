// Unsplash image search utility
// Usage: await searchUnsplashImages(query)

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function withNonce(url: string): string {
  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}sig=${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function fallbackByQuery(query: string, perPage: number): string[] {
  const fallbackImages: { [key: string]: string[] } = {
    business: [
      'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1200&h=800&fit=crop',
      'https://images.unsplash.com/photo-1553531088-189a29e18e4d?w=1200&h=800&fit=crop',
      'https://images.unsplash.com/photo-1552581234-26160f608093?w=1200&h=800&fit=crop',
    ],
    product: [
      'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=1200&h=800&fit=crop',
      'https://images.unsplash.com/photo-1556740738-b6a63e27c4df?w=1200&h=800&fit=crop',
      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1200&h=800&fit=crop',
    ],
    shop: [
      'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=1200&h=800&fit=crop',
      'https://images.unsplash.com/photo-1488459716781-e1a2d2f5ce55?w=1200&h=800&fit=crop',
      'https://images.unsplash.com/photo-1556740738-b6a63e27c4df?w=1200&h=800&fit=crop',
    ],
    service: [
      'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1200&h=800&fit=crop',
      'https://images.unsplash.com/photo-1552581234-26160f608093?w=1200&h=800&fit=crop',
      'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=1200&h=800&fit=crop',
    ],
    default: [
      'https://images.unsplash.com/photo-1556742393-d75f468bfcb0?w=1200&h=800&fit=crop',
      'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1200&h=800&fit=crop',
      'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=1200&h=800&fit=crop',
    ],
  };

  const lowerQuery = String(query || '').toLowerCase();
  for (const [key, urls] of Object.entries(fallbackImages)) {
    if (key !== 'default' && lowerQuery.includes(key)) {
      return shuffle(uniq(urls)).slice(0, perPage).map(withNonce);
    }
  }
  return shuffle(uniq(fallbackImages.default)).slice(0, perPage).map(withNonce);
}

export async function searchUnsplashImages(query: string, perPage = 3): Promise<string[]> {
  const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
  if (!UNSPLASH_ACCESS_KEY) return fallbackByQuery(query, perPage);

  const randomPage = Math.floor(Math.random() * 10) + 1;
  const desired = Math.max(perPage, perPage * 3);
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${desired}&page=${randomPage}&orientation=landscape`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
    },
  });
  if (!res.ok) throw new Error('Unsplash API error: ' + res.statusText);
  const data = await res.json() as { results?: any[] };

  const urls = uniq(
    (data.results || [])
      .map((img: any) => img?.urls?.regular || img?.urls?.small || img?.urls?.thumb || img?.urls?.raw)
      .filter(Boolean),
  );

  if (!urls.length) return fallbackByQuery(query, perPage);
  return shuffle(urls).slice(0, perPage).map(withNonce);
}
