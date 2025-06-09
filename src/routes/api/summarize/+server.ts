import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { env } from '$env/dynamic/private';

// Configure available LLM providers
function getAvailableModel() {
  const OPENAI_API_KEY = env.OPENAI_API_KEY;
  const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
  const GOOGLE_GENERATIVE_AI_API_KEY = env.GOOGLE_GENERATIVE_AI_API_KEY;

  if (OPENAI_API_KEY && OPENAI_API_KEY !== 'your_openai_api_key_here') {
    const openai = createOpenAI({ apiKey: OPENAI_API_KEY });
    return openai('gpt-4o-mini');
  }
  if (ANTHROPIC_API_KEY && ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here') {
    const anthropic = createAnthropic({ apiKey: ANTHROPIC_API_KEY });
    return anthropic('claude-3-haiku-20240307');
  }
  if (GOOGLE_GENERATIVE_AI_API_KEY && GOOGLE_GENERATIVE_AI_API_KEY !== 'your_google_ai_api_key_here') {
    const google = createGoogleGenerativeAI({ apiKey: GOOGLE_GENERATIVE_AI_API_KEY });
    return google('gemma-3-27b-it');
  }
  throw new Error('No LLM API key configured. Please set up at least one API key in environment variables.');
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { videoInfo, subtitles } = await request.json();

    if (!videoInfo || !videoInfo.title) {
      throw error(400, 'Missing video information');
    }

    // Prepare the content for summarization
    const videoMetadata = `
标题: ${videoInfo.title}
UP主: ${videoInfo.upName}
播放量: ${videoInfo.views}
点赞数: ${videoInfo.likes}
简介: ${videoInfo.description || '无'}
`.trim();

    const subtitleText = subtitles?.text || '暂无字幕内容';

    // Create the prompt for summarization
    const prompt = `
请基于以下哔哩哔哩视频的元数据和字幕内容，生成一个简洁而全面的视频总结。

视频元数据:
${videoMetadata}

字幕内容:
${subtitleText}

请提供:
1. 视频主要内容概括 (2-3句话)
2. 关键要点 (3-5个要点)
3. 视频类型/风格
4. 推荐观看人群

请用中文回复，格式清晰易读。
`;

    // Get the configured model
    const model = getAvailableModel();

    // Generate the summary
    const { text: summary } = await generateText({
      model,
      prompt,
      maxTokens: 1000,
      temperature: 0.7,
    });

    return json({
      success: true,
      summary,
      provider: model.provider,
    });

  } catch (e: any) {
    console.error('Video summarization error:', e);
    throw error(500, e.message || 'Failed to generate video summary');
  }
}; 