import { error, type RequestHandler } from '@sveltejs/kit';
import {
  extractBvid,
  getVideoInfo,
  formatVideoInfoForCopy,
  type VideoInfoShape
} from '$lib/biliUtils';

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
    const videoDetails: VideoInfoShape = await getVideoInfo(bvid, serverFetch);
    const formattedString = formatVideoInfoForCopy(videoDetails);
    return new Response(formattedString, {
      headers: { 'Content-Type': 'text/plain' }
    });
  } catch (e: any) {
    console.error(`Error in /api/copy for bvid ${bvid} (source url: ${targetUrl}):`, e);
    const message = e.message || 'Failed to format Bilibili URL info for copying';
    const statusMatch = message.match(/\((\d{3})\)/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 500;
    throw error(status, message);
  }
}; 