import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { toSimplified } from 'chinese-simple2traditional';

// Define allowed Bilibili API hosts for security
const ALLOWED_API_HOSTS = ['api.bilibili.com'];

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

// Helper function to call Bilibili API via proxy
async function fetchBiliApiViaProxy(targetApiUrl: string, fetchFn: typeof fetch): Promise<any> {
  const proxyUrl = `/api/bili?url=${encodeURIComponent(targetApiUrl)}`;
  const response = await fetchFn(proxyUrl);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`Proxied Bilibili API request to ${targetApiUrl} failed (${response.status}): ${errorData.message || response.statusText}`);
  }
  return response.json();
}

// Helper function to get audio URL from Bilibili playurl API
async function getAudioUrl(bvid: string, cid: string, fetchFn: typeof fetch): Promise<string> {
  // Use the playurl API to get stream URLs
  const playurlApiUrl = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=6&fnval=1&platform=html5`;
  
  try {
    const playurlData = await fetchBiliApiViaProxy(playurlApiUrl, fetchFn);
    
    if (playurlData.code !== 0) {
      throw new Error(`Bilibili Playurl API error: ${playurlData.message}`);
    }

    // Look for audio in dash format first
    if (playurlData.data?.dash?.audio && playurlData.data.dash.audio.length > 0) {
      // Get the highest quality audio stream
      const audioStreams = playurlData.data.dash.audio;
      const highestQualityAudio = audioStreams.reduce((prev: any, current: any) => 
        (prev.bandwidth > current.bandwidth) ? prev : current
      );
      return highestQualityAudio.baseUrl || highestQualityAudio.base_url;
    }

    // Fallback to legacy format if dash is not available
    if (playurlData.data?.durl && playurlData.data.durl.length > 0) {
      return playurlData.data.durl[0].url;
    }

    throw new Error('No audio stream found in Bilibili API response');
  } catch (e: any) {
    console.error('Error fetching audio URL:', e);
    throw new Error(`Failed to get audio URL: ${e.message}`);
  }
}

// Helper function to call Whisper ASR service
async function generateSubtitles(audioUrl: string): Promise<any> {
  const WHISPER_ASR_URL = env.WHISPER_ASR_URL;
  
  if (!WHISPER_ASR_URL) {
    throw new Error('WHISPER_ASR_URL environment variable is not configured');
  }

  // Prepare query parameters for the new API format
  const params = new URLSearchParams({
    audio_url: audioUrl,
    output: 'json',
    task: 'transcribe',
    language: 'auto',
    word_timestamps: 'true',
    vad_filter: 'true'
  });

  try {
    const response = await fetch(`${WHISPER_ASR_URL}/asr?${params}`, {
      method: 'POST',
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
    console.error('Error calling Whisper ASR service:', e);
    throw new Error(`Failed to generate subtitles: ${e.message}`);
  }
}

export const POST: RequestHandler = async ({ request, fetch }) => {
  try {
    const { bvid, cid } = await request.json();

    if (!bvid || !cid) {
      throw error(400, 'Missing bvid or cid parameter');
    }

    // Step 1: Get audio URL from Bilibili API
    console.log(`Getting audio URL for bvid: ${bvid}, cid: ${cid}`);
    const audioUrl = await getAudioUrl(bvid, cid, fetch);
    console.log(`Audio URL obtained: ${audioUrl}`);

    // Step 2: Send audio URL to Whisper ASR service
    console.log('Sending to Whisper ASR service...');
    const rawSubtitleData = await generateSubtitles(audioUrl);

    // Step 3: Convert traditional Chinese to simplified Chinese
    console.log('Converting traditional Chinese to simplified Chinese...');
    const subtitleData = convertSubtitlesToSimplified(rawSubtitleData);

    return json({
      success: true,
      audioUrl,
      subtitles: subtitleData
    });

  } catch (e: any) {
    console.error('Subtitle generation error:', e);
    throw error(500, e.message || 'Failed to generate subtitles');
  }
}; 