// YouTube short-video utility.
// Returns embeddable links filtered by duration range when possible.

const FALLBACK_SHORT_REELS = [
  'https://samplelib.com/lib/preview/mp4/sample-15s.mp4',
  'https://samplelib.com/lib/preview/mp4/sample-20s.mp4',
];

function parseIsoDurationToSeconds(value: string): number {
  const m = String(value || '').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const h = Number(m[1] || 0);
  const min = Number(m[2] || 0);
  const sec = Number(m[3] || 0);
  return (h * 3600) + (min * 60) + sec;
}

async function fetchWithTimeout(url: string, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function searchYouTubeShortVideos(
  query: string,
  minSeconds = 15,
  maxSeconds = 20,
  maxResults = 2,
): Promise<string[]> {
  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
  if (!YOUTUBE_API_KEY) return [];

  const safeMax = Math.max(1, Math.min(10, maxResults));
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=short&q=${encodeURIComponent(query)}&maxResults=${safeMax * 5}&key=${YOUTUBE_API_KEY}`;
  const searchRes = await fetchWithTimeout(searchUrl);
  if (!searchRes.ok) throw new Error('YouTube API error: ' + searchRes.statusText);
  const searchData = await searchRes.json() as { items?: any[] };
  const ids = (searchData.items || []).map((item: any) => item?.id?.videoId).filter(Boolean);
  if (!ids.length) return [];

  const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${encodeURIComponent(ids.join(','))}&key=${YOUTUBE_API_KEY}`;
  const detailsRes = await fetchWithTimeout(detailsUrl);
  if (!detailsRes.ok) throw new Error('YouTube videos API error: ' + detailsRes.statusText);
  const detailsData = await detailsRes.json() as { items?: any[] };

  const accepted: string[] = [];
  for (const item of (detailsData.items || [])) {
    const id = item?.id;
    const seconds = parseIsoDurationToSeconds(item?.contentDetails?.duration);
    if (!id || !seconds) continue;
    if (seconds < minSeconds || seconds > maxSeconds) continue;
    accepted.push(`https://www.youtube.com/embed/${id}?start=0&end=${seconds}`);
    if (accepted.length >= safeMax) break;
  }

  return accepted;
}

export function getFallbackShortReels(maxResults = 2): string[] {
  return FALLBACK_SHORT_REELS.slice(0, Math.max(1, maxResults));
}
