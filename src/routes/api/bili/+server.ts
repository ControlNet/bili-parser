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

  // Forward only specific, safe headers. Avoid forwarding all client headers.
  const requestHeaders = new Headers();
  requestHeaders.append('Accept', 'application/json, text/plain, */*');
  requestHeaders.append(
    'User-Agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  ); // A common user agent
  // Bilibili API might require Referer for some endpoints
  requestHeaders.append('Referer', 'https://www.bilibili.com/');

  try {
    const response = await fetch(apiUrlToProxy, {
      method: 'GET', // Assuming GET, adjust if other methods are needed
      headers: requestHeaders
    });

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
