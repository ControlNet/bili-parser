import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';

// Define a list of allowed Bilibili API base paths to prevent open proxy vulnerabilities
const ALLOWED_API_HOSTS = ['api.bilibili.com'];

export const GET: RequestHandler = async ({ url }) => {
  const apiUrlToProxy = url.searchParams.get('url');

  if (!apiUrlToProxy) {
    throw error(400, 'Missing apiUrl parameter');
  }

  let parsedProxyUrl;
  try {
    parsedProxyUrl = new URL(apiUrlToProxy);
  } catch (e) {
    throw error(400, 'Invalid apiUrl parameter');
  }

  if (!ALLOWED_API_HOSTS.includes(parsedProxyUrl.hostname)) {
    throw error(
      403,
      `Host not allowed: ${parsedProxyUrl.hostname}. Only Bilibili APIs are permitted.`
    );
  }

  try {
    const response = await fetch(apiUrlToProxy);
    if (!response.ok) {
      // Forward the status and statusText from the Bilibili API response
      // Also send back the Bilibili API's response body if available, for debugging
      const errorBody = await response.text();
      console.error(`Bilibili API error: ${response.status} ${response.statusText}`, errorBody);
      throw error(
        response.status,
        `Bilibili API Error (${response.status}): ${response.statusText}. Response: ${errorBody}`
      );
    }

    const data = await response.json();
    return json(data);
  } catch (e: any) {
    console.error('Proxy request failed:', e);
    // If it's already an error from @sveltejs/kit, rethrow it
    if (e.status && e.body) {
      throw e;
    }
    throw error(500, e.message || 'Proxy request failed');
  }
};
