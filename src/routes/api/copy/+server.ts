import { error, type RequestHandler } from '@sveltejs/kit';
import {
  getVideoInfo,
  formatVideoInfoForCopy,
  type VideoInfoShape
} from '$lib/biliUtils';

export const GET: RequestHandler = async ({ url: requestUrl, fetch: serverFetch }) => {
  const targetUrl = requestUrl.searchParams.get('url');

  if (!targetUrl) {
    throw error(400, 'Missing url parameter');
  }

  try {
    const videoDetails: VideoInfoShape = await getVideoInfo(targetUrl, serverFetch, true);
    const formattedString = formatVideoInfoForCopy(videoDetails);
    return new Response(formattedString, {
      headers: { 'Content-Type': 'text/plain' }
    });
  } catch (e: any) {
    console.error(`Error in /api/copy for URL ${targetUrl}:`, e);
    const message = e.message || 'Failed to format Bilibili URL info for copying';
    const statusMatch = message.match(/\((\d{3})\)/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : (e.status || 500);
    throw error(status, message);
  }
}; 