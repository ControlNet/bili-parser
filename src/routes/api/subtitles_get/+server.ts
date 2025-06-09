import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { toSimplified } from 'chinese-simple2traditional';

// Helper function to convert traditional Chinese to simplified Chinese in subtitle data
function convertSubtitlesToSimplified(subtitleData: any): any {
  if (!subtitleData) return subtitleData;

  const converted = { ...subtitleData };

  // Convert main text
  if (converted.text) {
    converted.text = toSimplified(converted.text);
  }

  // Convert segments
  if (converted.segments && Array.isArray(converted.segments)) {
    converted.segments = converted.segments.map((segment: any) => ({
      ...segment,
      text: segment.text ? toSimplified(segment.text) : segment.text,
      // Convert words if they exist
      words: segment.words && Array.isArray(segment.words) 
        ? segment.words.map((word: any) => ({
            ...word,
            word: word.word ? toSimplified(word.word) : word.word
          }))
        : segment.words
    }));
  }

  return converted;
}

// Helper function to get job result from Whisper ASR service
async function getJobResult(jobId: string): Promise<any> {
  const WHISPER_ASR_URL = env.WHISPER_ASR_URL;
  
  if (!WHISPER_ASR_URL) {
    throw new Error('WHISPER_ASR_URL environment variable is not configured');
  }

  try {
    const response = await fetch(`${WHISPER_ASR_URL}/get/${jobId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorMessage = errorData?.detail || `HTTP ${response.status}`;
      throw new Error(`Whisper ASR service error: ${errorMessage}`);
    }

    return await response.json();
  } catch (e: any) {
    console.error('Error getting job result from Whisper ASR service:', e);
    throw new Error(`Failed to get job result: ${e.message}`);
  }
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { jobId } = await request.json();

    if (!jobId) {
      throw error(400, 'Missing jobId parameter');
    }

    console.log(`Checking job status for ID: ${jobId}`);
    const jobResult = await getJobResult(jobId);

    // Handle different job statuses
    switch (jobResult.status) {
      case 'completed':
        console.log('Job completed, processing result...');
        
        // Parse the result if it's a string
        let subtitleData;
        if (typeof jobResult.result === 'string') {
          try {
            subtitleData = JSON.parse(jobResult.result);
          } catch {
            // If it's not JSON, treat as plain text
            subtitleData = { text: jobResult.result };
          }
        } else {
          subtitleData = jobResult.result;
        }

        // Convert traditional Chinese to simplified Chinese
        const convertedSubtitles = convertSubtitlesToSimplified(subtitleData);

        return json({
          success: true,
          status: 'completed',
          subtitles: convertedSubtitles,
          jobId,
          completedAt: jobResult.completed_at
        });

      case 'failed':
        console.log(`Job failed: ${jobResult.error}`);
        return json({
          success: false,
          status: 'failed',
          error: jobResult.error || 'Job processing failed',
          jobId
        });

      case 'processing':
        console.log('Job is still processing...');
        return json({
          success: true,
          status: 'processing',
          message: 'Job is currently being processed',
          jobId,
          startedAt: jobResult.started_at
        });

      case 'pending':
      default:
        console.log('Job is pending...');
        return json({
          success: true,
          status: 'pending',
          message: 'Job is queued for processing',
          jobId,
          createdAt: jobResult.created_at
        });
    }

  } catch (e: any) {
    console.error('Subtitle job status check error:', e);
    throw error(500, e.message || 'Failed to check subtitle generation job status');
  }
}; 