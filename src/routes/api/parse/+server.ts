import { error, json, type RequestHandler } from '@sveltejs/kit';
import { extractBvid, getVideoInfo, type VideoInfoShape } from '$lib/biliUtils';

export const GET: RequestHandler = async ({ url: requestUrl, fetch: serverFetch }) => {
  const targetUrl = requestUrl.searchParams.get('url');

  if (!targetUrl) {
    throw error(400, 'Missing url parameter');
  }

  const bvid = extractBvid(targetUrl);

  if (!bvid) {
    throw error(400, 'Invalid Bilibili URL or unable to extract BV ID from the provided url parameter');
  }

  try {
    // serverFetch here is SvelteKit's server-side fetch, which can call our /api/bili proxy
    const videoDetails: VideoInfoShape = await getVideoInfo(bvid, serverFetch);
    return json(videoDetails);
  } catch (e: any) {
    console.error(`Error in /api/parse for bvid ${bvid} (source url: ${targetUrl}):`, e);
    // Pass through specific error messages if available
    const message = e.message || 'Failed to parse Bilibili URL';
    // Try to parse a status code if the error is an HTTP error from the proxy or Bili API
    const statusMatch = message.match(/\((\d{3})\)/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 500;
    throw error(status, message);
  }
}; 