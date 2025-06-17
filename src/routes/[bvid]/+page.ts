import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load = (({ params }) => {
    const bvid = params.bvid;
    
    // Validate BV ID format - should start with BV and contain alphanumeric characters
    if (!bvid.match(/^BV[a-zA-Z0-9]+$/)) {
        error(404, 'Invalid BV ID format');
    }
    
    return {
        bvid: bvid
    };
}) satisfies PageLoad; 