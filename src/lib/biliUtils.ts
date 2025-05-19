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
}

// Helper to format large numbers
export function formatNumber(num: number): string {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + '万';
  }
  return num.toString();
}

// Function to extract bvid from URL
export function extractBvid(url: string): string | null {
  if (!url) return null;
  // Regex to find BV id like BV1QL411M7r3, or av id like av170001, or video page like /video/BV1QL411M7r3
  const bvidMatch = url.match(/BV([a-zA-Z0-9]+)/);
  if (bvidMatch && bvidMatch[0]) {
    return bvidMatch[0];
  }
  // If no BV, try to find common video links and then extract from path
  const urlPattern = /bilibili\.com\/(?:video\/|bangumi\/play\/ep|bangumi\/play\/ss)(BV[a-zA-Z0-9]+|av[0-9]+|ep[0-9]+|ss[0-9]+)/;
  const pathMatch = url.match(urlPattern);
  if (pathMatch && pathMatch[1] && pathMatch[1].startsWith('BV')) {
      return pathMatch[1];
  }
  return null;
}

// Helper function to call the SvelteKit proxy, used by getVideoInfo
async function fetchViaProxy(targetApiUrl: string, fetchFn: typeof fetch): Promise<any> {
  // This internal proxyUrl is for calls from the server-side (e.g. /api/parse)
  // If called from client-side, fetchFn would be window.fetch which hits /api/bili correctly.
  // If called from server-side, fetchFn would be SvelteKit's fetch, which can hit /api/bili.
  const proxyUrl = `/api/bili?apiUrl=${encodeURIComponent(targetApiUrl)}`;
  const response = await fetchFn(proxyUrl); // Use the passed fetch function
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`Proxied API request to ${targetApiUrl} failed (${response.status}): ${errorData.message || response.statusText}`);
  }
  return response.json();
}


export async function getVideoInfo(bvid: string, fetchFn: typeof fetch): Promise<VideoInfoShape> {
  const videoInfo: Partial<VideoInfoShape> = { bvid, watchingWeb: 'N/A' };

  // 1. Fetch video details (view API)
  const targetViewApiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
  const viewData = await fetchViaProxy(targetViewApiUrl, fetchFn);

  if (viewData.code !== 0) {
    throw new Error(`Bilibili View API error for ${bvid}: ${viewData.message}`);
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
      const relationData = await fetchViaProxy(targetRelationApiUrl, fetchFn);
      if (relationData.code === 0) {
        videoInfo.upFans = formatNumber(relationData.data.follower);
      } else {
        console.warn(`Bilibili Relation API warning for mid ${videoInfo.upMid}:`, relationData.message);
        videoInfo.upFans = 'N/A';
      }
    } catch (relationError: any) {
      console.warn(`Failed to fetch fan count for mid ${videoInfo.upMid}:`, relationError.message);
      videoInfo.upFans = 'N/A';
    }
  } else {
    videoInfo.upFans = 'N/A';
  }

  // 3. Fetch online viewers (player/online/total API)
  if (videoInfo.cid && bvid) {
    const targetOnlineApiUrl = `https://api.bilibili.com/x/player/online/total?bvid=${bvid}&cid=${videoInfo.cid}`;
    try {
      const onlineData = await fetchViaProxy(targetOnlineApiUrl, fetchFn);
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