import { error, json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url: requestUrlObject, fetch: serverFetch }) => {
  const targetUrl = requestUrlObject.searchParams.get('url');

  if (!targetUrl) {
    throw error(400, 'Missing url parameter');
  }

  try {
    const parsedTargetUrl = new URL(targetUrl);
    if (parsedTargetUrl.hostname !== 'b23.tv') {
      throw error(400, 'Invalid url parameter: hostname must be b23.tv');
    }
  } catch (e) {
    throw error(400, 'Invalid url parameter: not a valid URL');
  }

  try {
    const response = await serverFetch(targetUrl, { redirect: 'manual' });

    if (response.status === 301 || response.status === 302) {
      let locationHeader = response.headers.get('Location');
      if (locationHeader) {
        // Clean the URL: remove query parameters
        const queryIndex = locationHeader.indexOf('?');
        if (queryIndex !== -1) {
          locationHeader = locationHeader.substring(0, queryIndex);
        }
        // Also remove trailing slash if present, for consistency
        if (locationHeader.endsWith('/')) {
          locationHeader = locationHeader.substring(0, locationHeader.length - 1);
        }
        return json({ location: locationHeader });
      } else {
        console.error(
          `b23.tv redirect for ${targetUrl} missing Location header. Status: ${response.status}`
        );
        throw error(500, 'b23.tv redirect response missing Location header.');
      }
    } else {
      const responseText = await response.text().catch(() => 'Could not read response body');
      console.warn(
        `b23.tv did not redirect for ${targetUrl}. Status: ${response.status}. Body: ${responseText}`
      );
      throw error(
        response.status,
        `b23.tv did not redirect as expected. Status: ${response.status}`
      );
    }
  } catch (e: any) {
    if (e.status && e.body) {
      throw e;
    }
    console.error(`Error resolving b23.tv link ${targetUrl} in /api/b23:`, e);
    throw error(500, e.message || 'Failed to resolve b23.tv link on server');
  }
};
