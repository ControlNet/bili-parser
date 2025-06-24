import { error, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url: requestUrl, fetch: serverFetch }) => {
  const imageUrl = requestUrl.searchParams.get('url');

  if (!imageUrl) {
    throw error(400, 'Missing url parameter');
  }

  try {
    // Fetch the image with appropriate headers to avoid blocking
    const response = await serverFetch(imageUrl, {
      headers: {
        Referer: 'https://www.bilibili.com/',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw error(response.status, `Failed to fetch image: ${response.statusText}`);
    }

    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    // Return the image with proper CORS headers
    return new Response(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
      }
    });
  } catch (e: any) {
    console.error(`Error proxying image ${imageUrl}:`, e);
    const status = e.status || 500;
    const message = e.message || 'Failed to proxy image';
    throw error(status, message);
  }
};
