import { error, json, type RequestHandler } from '@sveltejs/kit';
import { getVideoInfo, type VideoInfoShape } from '$lib/biliUtils';

export const GET: RequestHandler = async ({ url: requestUrl, fetch: serverFetch }) => {
  const targetUrl = requestUrl.searchParams.get('url');

  if (!targetUrl) {
    throw error(400, 'Missing url parameter');
  }

  try {
    // Pass true for isFromServerContext
    const videoDetails: VideoInfoShape = await getVideoInfo(targetUrl, serverFetch, true);
    return json(videoDetails);
  } catch (e: any) {
    // Log with targetUrl for better context, bvid is not available here anymore if getVideoInfo fails early
    console.error(`Error in /api/parse for URL ${targetUrl}:`, e);
    const message = e.message || 'Failed to parse Bilibili URL';
    const statusMatch = message.match(/\((\d{3})\)/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : (e.status || 500); // Use e.status if available
    throw error(status, message);
  }
}; 