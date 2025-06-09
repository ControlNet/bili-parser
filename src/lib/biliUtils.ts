export interface VideoInfoShape {
  title: string;
  upName: string;
  upMid: string | number;
  upFans: string;
  pic: string;
  views: string;
  danmaku: string;
  likes: string;
  coins: string;
  favorites: string;
  shares: string;
  description: string;
  watchingTotal: string;
  watchingWeb: string;
  cleanedUrl: string;
  cid: string | number;
  bvid: string;
  subtitles?: SubtitleData;
}

export interface SubtitleData {
  text: string;
  segments: SubtitleSegment[];
}

export interface SubtitleSegment {
  start: number;
  end: number;
  text: string;
  words?: SubtitleWord[];
}

export interface SubtitleWord {
  start: number;
  end: number;
  word: string;
  probability: number;
}

// Helper to format large numbers
export function formatNumber(num: number): string {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + '万';
  }
  return num.toString();
}

// Function to extract bvid from URL. Expects a full Bilibili video URL.
export function extractBvid(url: string): string | null {
  if (!url) return null;
  // Try to match /BVxxxxxxxxxx/ or /BVxxxxxxxxxx? or /BVxxxxxxxxxx directly
  const bvidMatch = url.match(/BV([a-zA-Z0-9]+)/);
  if (bvidMatch && bvidMatch[0]) {
    return bvidMatch[0]; // Returns the full BV ID, e.g., "BV1QL411M7r3"
  }
  // Fallback for av numbers if needed in the future, though BV is primary
  // const avMatch = url.match(/av([0-9]+)/);
  // if (avMatch && avMatch[0]) { /* convert AV to BV if necessary */ }
  return null;
}

// Helper function to call the SvelteKit proxy for Bilibili API, used by getVideoInfo parts
async function fetchBiliApiViaProxy(targetApiUrl: string, fetchFn: typeof fetch): Promise<any> {
  const proxyUrl = `/api/bili?url=${encodeURIComponent(targetApiUrl)}`;
  const response = await fetchFn(proxyUrl);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`Proxied Bilibili API request to ${targetApiUrl} failed (${response.status}): ${errorData.message || response.statusText}`);
  }
  return response.json();
}

async function resolveB23Url(shortUrlInput: string, fetchFn: typeof fetch, isFromServerContext: boolean): Promise<string | null> {
    let targetB23Url = shortUrlInput;
    // Ensure it's a full URL for fetching, default to https
    if (!targetB23Url.match(/^https?:\/\//)) {
        targetB23Url = 'https://' + targetB23Url.replace(/^b23.tv\//, ''); // Handle cases like b23.tv/xxxx
        if (!targetB23Url.startsWith('https://b23.tv')) { // if original was just code, prepend host
             targetB23Url = 'https://b23.tv/' + shortUrlInput.split('/').pop();
        }
    }
    if (!targetB23Url.includes('b23.tv/')) {
        console.warn("resolveB23Url called with non-b23.tv URL:", targetB23Url);
        return shortUrlInput; // Return original if it doesn't seem like a b23.tv link to be resolved
    }

    try {
        let resolvedLocation: string | null = null;
        if (isFromServerContext) {
            const response = await fetchFn(targetB23Url, { redirect: 'manual' });
            if (response.status === 301 || response.status === 302) {
                resolvedLocation = response.headers.get('Location');
            } else {
                console.error(`b23.tv direct fetch did not redirect. Status: ${response.status} for ${targetB23Url}`);
                return null;
            }
        } else {
            // Client-side uses the /api/b23 proxy with 'url' parameter
            const proxyResolveUrl = `/api/b23?url=${encodeURIComponent(targetB23Url)}`; // Updated path and parameter
            const response = await fetchFn(proxyResolveUrl);
            if (!response.ok) {
                const errorText = await response.text().catch(() => `Resolve proxy failed with status ${response.status}`);
                console.error(`Error resolving b23.tv link via /api/b23 for ${targetB23Url}: ${errorText}`); // Updated path in log
                return null;
            }
            const data = await response.json();
            resolvedLocation = data.location;
        }
        return resolvedLocation || null;
    } catch (error) {
        console.error(`Failed to resolve b23.tv link ${targetB23Url}:`, error);
        return null;
    }
}

export async function getVideoInfo(initialUrl: string, fetchFn: typeof fetch, isFromServerContext: boolean): Promise<VideoInfoShape> {
  let urlToParse = initialUrl;

  // Check for b23.tv short link pattern or if it's a full b23.tv URL
  if (initialUrl.includes('b23.tv/') || initialUrl.match(/^b23.tv\/[a-zA-Z0-9]+$/) || initialUrl.match(/^[a-zA-Z0-9]+$/) && initialUrl.length < 15 ) { // Heuristic for short b23 codes
    // Attempt to make it a full URL if just a code like `4d0kOyh` was passed, assuming it's from b23.tv
    let potentialB23Url = initialUrl;
    if (!initialUrl.includes('b23.tv/')) {
        potentialB23Url = `https://b23.tv/${initialUrl}`;
    }
    const resolved = await resolveB23Url(potentialB23Url, fetchFn, isFromServerContext);
    if (resolved) {
        urlToParse = resolved;
    } else {
        // If resolution fails but it looked like a b23 link, throw an error.
        // If it didn't look like one, urlToParse remains initialUrl and extractBvid will handle it.
        if (initialUrl.includes('b23.tv/')) {
             throw new Error(`Failed to resolve b23.tv short link: ${initialUrl}`);
        }
        // Otherwise, proceed with initialUrl, extractBvid will try its best
    }
  }

  const bvid = extractBvid(urlToParse);

  if (!bvid) {
    throw new Error(`Could not extract BVID from URL: ${urlToParse} (original input: ${initialUrl})`);
  }

  const videoInfo: Partial<VideoInfoShape> = { bvid, watchingWeb: 'N/A' };

  // 1. Fetch video details (view API)
  const targetViewApiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
  const viewData = await fetchBiliApiViaProxy(targetViewApiUrl, fetchFn);

  if (viewData.code !== 0) {
    throw new Error(`Bilibili View API error for ${bvid} (${urlToParse}): ${viewData.message}`);
  }
  const data = viewData.data;
  videoInfo.title = data.title;
  videoInfo.description = data.desc;
  videoInfo.pic = data.pic;
  videoInfo.upName = data.owner.name;
  videoInfo.upMid = data.owner.mid;
  videoInfo.cid = data.cid;
  videoInfo.views = formatNumber(data.stat.view);
  videoInfo.danmaku = formatNumber(data.stat.danmaku);
  videoInfo.likes = formatNumber(data.stat.like);
  videoInfo.coins = formatNumber(data.stat.coin);
  videoInfo.favorites = formatNumber(data.stat.favorite);
  videoInfo.shares = formatNumber(data.stat.share);
  videoInfo.cleanedUrl = `https://www.bilibili.com/video/${bvid}`;

  // 2. Fetch UP主粉丝数 (relation API)
  if (videoInfo.upMid) {
    const targetRelationApiUrl = `https://api.bilibili.com/x/relation/stat?vmid=${videoInfo.upMid}`;
    try {
      const relationData = await fetchBiliApiViaProxy(targetRelationApiUrl, fetchFn);
      if (relationData.code === 0) {
        videoInfo.upFans = formatNumber(relationData.data.follower);
      } else {
        console.warn(`Bilibili Relation API warning for mid ${videoInfo.upMid} (bvid ${bvid}):`, relationData.message);
        videoInfo.upFans = 'N/A';
      }
    } catch (relationError: any) {
      console.warn(`Failed to fetch fan count for mid ${videoInfo.upMid} (bvid ${bvid}):`, relationError.message);
      videoInfo.upFans = 'N/A';
    }
  } else {
    videoInfo.upFans = 'N/A';
  }

  // 3. Fetch online viewers (player/online/total API)
  if (videoInfo.cid && bvid) {
    const targetOnlineApiUrl = `https://api.bilibili.com/x/player/online/total?bvid=${bvid}&cid=${videoInfo.cid}`;
    try {
      const onlineData = await fetchBiliApiViaProxy(targetOnlineApiUrl, fetchFn);
      if (onlineData.code === 0 && onlineData.data) {
        videoInfo.watchingTotal = formatNumber(onlineData.data.total);
        videoInfo.watchingWeb = onlineData.data.web_online ? formatNumber(onlineData.data.web_online) : (onlineData.data.count || 'N/A');
      } else {
        console.warn(`Bilibili Online API warning for bvid ${bvid}:`, onlineData.message);
        videoInfo.watchingTotal = 'N/A';
      }
    } catch (onlineError: any) {
      console.warn(`Failed to fetch online count for bvid ${bvid}:`, onlineError.message);
      videoInfo.watchingTotal = 'N/A';
    }
  } else {
    videoInfo.watchingTotal = 'N/A';
  }
  return videoInfo as VideoInfoShape;
}

// Function to fetch subtitles for a video
export async function fetchSubtitles(bvid: string, cid: string | number, fetchFn: typeof fetch): Promise<SubtitleData> {
  const response = await fetchFn('/api/subtitles', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ bvid, cid: cid.toString() })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`Failed to fetch subtitles (${response.status}): ${errorData.message || response.statusText}`);
  }

  const data = await response.json();
  
  // Transform the Whisper ASR response to our format
  return {
    text: data.subtitles.text || '',
    segments: data.subtitles.segments?.map((segment: any) => ({
      start: segment.start,
      end: segment.end,
      text: segment.text,
      words: segment.words?.map((word: any) => ({
        start: word.start,
        end: word.end,
        word: word.word,
        probability: word.probability
      }))
    })) || []
  };
}

export function formatVideoInfoForCopy(videoInfo: VideoInfoShape): string {
  if (!videoInfo || !videoInfo.title) {
    return 'No video information available to format.';
  }

  const upFansText = (videoInfo.upFans && videoInfo.upFans !== 'N/A' && videoInfo.upFans !== '') ? ` 粉丝: ${videoInfo.upFans}` : '';
  const watchingWebText = (videoInfo.watchingWeb && videoInfo.watchingWeb !== 'N/A' && videoInfo.watchingWeb !== '') ? `，${videoInfo.watchingWeb} 人在网页端观看` : '';
  const watchingTotalText = (videoInfo.watchingTotal && videoInfo.watchingTotal !== 'N/A' && videoInfo.watchingTotal !== '') ? `🏄‍♂️ 总共 ${videoInfo.watchingTotal} 人在观看${watchingWebText}` : '';

  const textToCopy = `
标题: ${videoInfo.title}
UP主: ${videoInfo.upName}${upFansText}
👀播放: ${videoInfo.views} 💬弹幕: ${videoInfo.danmaku}
👍点赞: ${videoInfo.likes} 💰投币: ${videoInfo.coins}
📁收藏: ${videoInfo.favorites} 🔗分享: ${videoInfo.shares}
📝简介: ${videoInfo.description || '无'}
${watchingTotalText}
${videoInfo.cleanedUrl}
  `.trim();
  return textToCopy;
} 