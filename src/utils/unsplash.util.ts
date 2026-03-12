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

export async function searchUnsplashImages(query: string, perPage = 3): Promise<string[]> {
  const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
  if (!UNSPLASH_ACCESS_KEY) return [];

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

  if (!urls.length) return [];
  return shuffle(urls).slice(0, perPage).map(withNonce);
}
