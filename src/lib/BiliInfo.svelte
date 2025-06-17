<script lang="ts">
  import {
    getVideoInfo,
    formatVideoInfoForCopy,
    fetchSubtitles,
    generateVideoSummary,
    type VideoInfoShape,
    type SubtitleData,
    extractBvid
  } from '$lib/biliUtils';
  import { Chat } from '@ai-sdk/svelte';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import BilibiliPlayer from './BilibiliPlayer.svelte';

  export let initialBvid: string | undefined = undefined;

  let biliUrl = '';
  let videoInfo: Partial<VideoInfoShape> = {};
  let loading = false;
  let subtitleLoading = false;
  let summaryLoading = false;
  let error = '';
  let subtitleError = '';
  let summaryError = '';
  let copyButtonText = '复制信息';
  let showSubtitles = false;
  let showSummary = false;
  let showChat = false;
  let chatMessagesContainer: HTMLElement;
  let chatLoading = false;

  // Initialize chat functionality
  const chat = new Chat({
    api: '/api/chat',
    body: {
      get videoInfo() { return videoInfo; },
      get subtitles() { return videoInfo.subtitles; }
    },
    onFinish: () => {
      // Auto-scroll to bottom when message finishes
      if (chatMessagesContainer) {
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
      }
      chatLoading = false;
    },
    onError: () => {
      // Reset loading state on error
      chatLoading = false;
    }
  });

  // Override the handleSubmit to track loading state
  const originalHandleSubmit = chat.handleSubmit;
  chat.handleSubmit = (event?: { preventDefault?: () => void } | undefined, options?: any) => {
    chatLoading = true;
    return originalHandleSubmit(event, options);
  };

  // Auto-scroll when messages update or when streaming
  $: if (chat.messages.length > 0 && chatMessagesContainer) {
    setTimeout(() => {
      chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }, 50);
  }

  // Handle initial BV ID from URL
  onMount(() => {
    if (initialBvid) {
      biliUrl = initialBvid;
      fetchAndSetVideoInfo();
    }
    
    // Handle browser back/forward navigation
    const handlePopState = (event: PopStateEvent) => {
      if (browser) {
        const currentPath = window.location.pathname;
        if (currentPath === '/') {
          // User navigated back to root - clear the current video info
          videoInfo = {};
          biliUrl = '';
          error = '';
          showSubtitles = false;
          showSummary = false;
          showChat = false;
          document.title = 'Bilibili Info Parser';
        } else if (currentPath.startsWith('/BV')) {
          // User navigated to a BV ID URL - extract and load the video
          const bvidFromUrl = currentPath.substring(1); // Remove leading '/'
          if (bvidFromUrl.match(/^BV[a-zA-Z0-9]+$/)) {
            // Valid BV ID format - load the video info
            biliUrl = bvidFromUrl;
            fetchAndSetVideoInfo();
          }
        }
      }
    };
    
    if (browser) {
      window.addEventListener('popstate', handlePopState);
      
      // Cleanup
      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }
  });

  async function fetchAndSetVideoInfo() {
    if (!biliUrl.trim()) {
      error = '请输入Bilibili链接或BV/b23代码';
      videoInfo = {};
      return;
    }

    loading = true;
    error = '';
    subtitleError = '';
    videoInfo = {};
    showSubtitles = false;

    try {
      const fetchedInfo = await getVideoInfo(biliUrl, fetch, false);
      videoInfo = fetchedInfo;
      
      // Update URL if we have a valid BV ID (only in browser)
      if (videoInfo.bvid && browser) {
        const expectedPath = `/${videoInfo.bvid}`;
        const currentPath = window.location.pathname;
        
        if (currentPath !== expectedPath) {
          // Use pushState when navigating from root to create browser history
          // Use replaceState when already on a BV ID route to avoid duplicate entries
          if (currentPath === '/') {
            // Coming from root URL - create new history entry so back button works
            window.history.pushState({ bvid: videoInfo.bvid }, '', expectedPath);
          } else {
            // Already on a BV ID route - just update current entry
            window.history.replaceState({ bvid: videoInfo.bvid }, '', expectedPath);
          }
          
          // Update document title to reflect the BV ID
          document.title = `Bilibili Info Parser - ${videoInfo.bvid}`;
        }
      }
    } catch (e: any) {
      console.error('Error in fetchAndSetVideoInfo:', e);
      error = e.message || '获取信息时发生未知错误';
      videoInfo = {};
    } finally {
      loading = false;
      copyButtonText = '复制信息';
    }
  }

  let subtitleJobId: string | null = null;
  let subtitleStatus: string = '';

  async function generateSubtitles() {
    if (!videoInfo.bvid || !videoInfo.cid) {
      subtitleError = '缺少视频信息，无法生成字幕';
      return;
    }

    subtitleLoading = true;
    subtitleError = '';
    subtitleStatus = '正在提交任务...';

    try {
      // Step 1: Submit the job
      const submitResponse = await fetch('/api/subtitles_submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bvid: videoInfo.bvid,
          cid: videoInfo.cid
        })
      });

      if (!submitResponse.ok) {
        const errorData = await submitResponse.json();
        throw new Error(errorData.message || '提交字幕生成任务失败');
      }

      const submitResult = await submitResponse.json();
      subtitleJobId = submitResult.job_id;

      console.log(submitResult);

      // Check if it's a cache hit (immediate result)
      if (submitResult.status === 'completed' && submitResult.cached) {
        // Cache hit - process result immediately
        subtitleStatus = '处理成功';
        
        // Parse the result if it's a string
        let subtitleData;
        if (typeof submitResult.result === 'string') {
          try {
            subtitleData = JSON.parse(submitResult.result);
          } catch {
            subtitleData = { text: submitResult.result };
          }
        } else {
          subtitleData = submitResult.result;
        }

        videoInfo.subtitles = subtitleData;
        showSubtitles = true;
        subtitleLoading = false;
        setTimeout(() => { subtitleStatus = ''; }, 3000);
      } else {
        // No cache hit - start polling
        subtitleStatus = '任务已提交，正在处理...';
        await pollForSubtitleResult();
      }

    } catch (e: any) {
      console.error('Error generating subtitles:', e);
      subtitleError = e.message || '生成字幕时发生错误';
      subtitleLoading = false;
      subtitleStatus = '';
    }
  }

  async function pollForSubtitleResult() {
    if (!subtitleJobId) return;

    const pollInterval = 10000; // Poll every 10 seconds
    const maxAttempts = 1000;
    let attempts = 0;

    const poll = async () => {
      try {
        attempts++;
        
        const response = await fetch('/api/subtitles_get', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: subtitleJobId })
        });

        if (!response.ok) {
          throw new Error('检查任务状态失败');
        }

        const result = await response.json();

        switch (result.status) {
          case 'completed':
            videoInfo.subtitles = result.subtitles;
            showSubtitles = true;
            subtitleLoading = false;
            subtitleStatus = '字幕生成完成！';
            setTimeout(() => { subtitleStatus = ''; }, 3000);
            return;

          case 'failed':
            throw new Error(result.error || '字幕生成失败');

          case 'processing':
            subtitleStatus = '正在处理音频文件...';
            break;

          case 'pending':
            subtitleStatus = '任务排队中...';
            break;
        }

        // Continue polling if job is not complete and we haven't exceeded max attempts
        if (attempts < maxAttempts) {
          setTimeout(poll, pollInterval);
        } else {
          throw new Error('字幕生成超时，请稍后重试');
        }

      } catch (e: any) {
        console.error('Error polling for subtitle result:', e);
        subtitleError = e.message || '检查字幕生成状态时发生错误';
        subtitleLoading = false;
        subtitleStatus = '';
      }
    };

    // Start polling
    setTimeout(poll, pollInterval);
  }

  async function generateSummary() {
    if (!videoInfo.title) {
      summaryError = '请先获取视频信息';
      return;
    }

    summaryLoading = true;
    summaryError = '';
    videoInfo.summary = ''; // Clear previous summary
    showSummary = true; // Show the summary section immediately

    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoInfo: videoInfo,
          subtitles: videoInfo.subtitles
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body for streaming');
      }

      // Handle streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let summary = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('0:')) {
              // Parse the streaming data format
              const data = line.slice(2);
              if (data) {
                try {
                  // Parse JSON-encoded string to remove quotes and unescape characters
                  const parsedData = JSON.parse(data);
                  summary += parsedData;
                  videoInfo.summary = summary;
                } catch {
                  // Fallback: use raw data if JSON parsing fails
                  summary += data;
                  videoInfo.summary = summary;
                }
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

    } catch (e: any) {
      console.error('Error generating summary:', e);
      summaryError = e.message || '生成摘要时发生错误';
      showSummary = false;
    } finally {
      summaryLoading = false;
    }
  }

  function formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  async function copyCurrentInfoToClipboard() {
    if (!videoInfo.title) {
      alert('没有可复制的信息。');
      return;
    }
    const textToCopy = formatVideoInfoForCopy(videoInfo as VideoInfoShape);

    try {
      await navigator.clipboard.writeText(textToCopy);
      copyButtonText = '已复制!';
      setTimeout(() => {
        copyButtonText = '复制信息';
      }, 2000);
    } catch (err) {
      console.error('无法复制文本: ', err);
      alert('复制失败，请检查浏览器权限或手动复制。');
      copyButtonText = '复制失败';
      setTimeout(() => {
        copyButtonText = '复制信息';
      }, 2000);
    }
  }
</script>

<div class="bili-info-container">
  <div class="input-area">
    <input type="text" bind:value={biliUrl} placeholder="输入Bilibili链接、BV号或b23.tv短链/代码" />
    <button on:click={fetchAndSetVideoInfo} disabled={loading}>
      {loading ? '加载中...' : '获取信息'}
    </button>
    {#if videoInfo.title} 
      <button on:click={copyCurrentInfoToClipboard} class="copy-button" disabled={copyButtonText !== '复制信息'}>
        {copyButtonText}
      </button>
    {/if}
  </div>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  {#if subtitleError}
    <p class="error">{subtitleError}</p>
  {/if}

  {#if summaryError}
    <p class="error">{summaryError}</p>
  {/if}

  <!-- Welcome Placeholder -->
  {#if !videoInfo.title && !error}
    <div class="welcome-section" class:loading={loading}>
      <div class="welcome-content">
        <div class="welcome-icon">
          🎬
        </div>
        <h2 class="welcome-title">欢迎使用 Bilibili 解析器</h2>
        <p class="welcome-description">
          解析 Bilibili 视频信息，生成 AI 字幕和摘要，与 AI 聊天视频内容
        </p>
        
        <div class="feature-grid">
          <div class="feature-item">
            <span class="feature-icon">📊</span>
            <span class="feature-text">视频信息</span>
          </div>
          <div class="feature-item">
            <span class="feature-icon">🎵</span>
            <span class="feature-text">AI字幕</span>
          </div>
          <div class="feature-item">
            <span class="feature-icon">🤖</span>
            <span class="feature-text">AI摘要</span>
          </div>
          <div class="feature-item">
            <span class="feature-icon">💬</span>
            <span class="feature-text">AI对话</span>
          </div>
          <div class="feature-item">
            <span class="feature-icon">🎬</span>
            <span class="feature-text">在线播放</span>
          </div>
          <div class="feature-item">
            <span class="feature-icon">📋</span>
            <span class="feature-text">一键复制</span>
          </div>
        </div>

        <div class="github-section">
          <p>
            <span class="github-icon">💻</span>
            开源项目：<a href="https://github.com/ControlNet/bili-parser" target="_blank" rel="noopener noreferrer">github.com/ControlNet/bili-parser</a>
          </p>
        </div>
      </div>

      <!-- Loading Overlay -->
      {#if loading}
        <div class="loading-overlay">
          <div class="loading-content">
            <div class="loading-spinner-large"></div>
            <p class="loading-text">正在获取视频信息...</p>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  {#if videoInfo.title} 
    <div class="info-display">
      {#if videoInfo.pic}
        <img src={videoInfo.pic} alt="Video Thumbnail" class="thumbnail" referrerpolicy="no-referrer" />
      {/if}
      <h2>标题: {videoInfo.title}</h2>
      <p>UP主: {videoInfo.upName} {#if videoInfo.upFans && videoInfo.upFans !== 'N/A'}粉丝: {videoInfo.upFans}{/if}</p>
      <div class="stats">
        <span>👀播放: {videoInfo.views}</span>
        <span>💬弹幕: {videoInfo.danmaku}</span>
      </div>
      <div class="stats">
        <span>👍点赞: {videoInfo.likes}</span>
        <span>💰投币: {videoInfo.coins}</span>
      </div>
      <div class="stats">
        <span>📁收藏: {videoInfo.favorites}</span>
        <span>🔗分享: {videoInfo.shares}</span>
      </div>
      <div class="description">
        <p>📝简介: {videoInfo.description || '无'}</p>
      </div>
      {#if videoInfo.watchingTotal && videoInfo.watchingTotal !== 'N/A'}
        <p>🏄‍♂️ 总共 {videoInfo.watchingTotal} 人在观看{#if videoInfo.watchingWeb && videoInfo.watchingWeb !== 'N/A'}，{videoInfo.watchingWeb} 人在网页端观看{/if}</p>
      {/if}
      {#if videoInfo.cleanedUrl}
         <p><a href={videoInfo.cleanedUrl} target="_blank" rel="noopener noreferrer">{videoInfo.cleanedUrl}</a></p>
      {/if}

      <!-- Video Player Section -->
      {#if videoInfo.bvid}
        <div class="video-player-section">
          <h3>🎬 视频播放器</h3>
          <div class="player-container">
            <BilibiliPlayer 
              bvid={videoInfo.bvid} 
              highQuality={true}
              danmaku={false}
              responsive={true}
              aspectRatio="16:9"
            />
          </div>
        </div>
      {/if}

      <!-- Subtitle Section -->
      {#if videoInfo.title}
        <div class="subtitles-section">
          <h3>🎵 字幕内容</h3>
          
          {#if showSubtitles && videoInfo.subtitles && videoInfo.subtitles.segments && videoInfo.subtitles.segments.length > 0}
            <!-- Show subtitles, button removed after generation -->
            <div class="subtitle-segments">
              <div class="segments-container">
                {#each videoInfo.subtitles.segments as segment}
                  <div class="segment">
                    <span class="timestamp">{formatTime(segment.start)} - {formatTime(segment.end)}</span>
                    <span class="segment-text">{segment.text}</span>
                  </div>
                {/each}
              </div>
            </div>
          {:else}
            <!-- Show button in the middle -->
            <div class="subtitle-content-center">
              <!-- Subtitle Generation Button in the middle -->
              <div class="subtitle-button-container">
                <button on:click={generateSubtitles} class="subtitle-button" disabled={subtitleLoading}>
                  {#if subtitleLoading}
                    <span class="loading-spinner"></span>
                    生成AI字幕
                  {:else}
                    生成AI字幕
                  {/if}
                </button>
                {#if subtitleStatus}
                  <p class="subtitle-status">{subtitleStatus}</p>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/if}

      <!-- AI Summary Section - Always visible when video exists -->
      {#if videoInfo.title}
        <div class="ai-section" class:disabled={!videoInfo.subtitles || !videoInfo.subtitles.segments || videoInfo.subtitles.segments.length === 0}>
          <h3>🤖 AI视频摘要</h3>
          
          {#if showSummary && (videoInfo.summary || summaryLoading)}
            <!-- Show summary content -->
            <div class="summary-content">
              <pre>{videoInfo.summary}</pre>
              {#if summaryLoading && videoInfo.summary}
                <span class="typing-indicator">AI正在继续生成...</span>
              {/if}
            </div>
          {:else}
            <!-- Show generate summary button -->
            <div class="ai-button-container">
              {#if !videoInfo.subtitles || !videoInfo.subtitles.segments || videoInfo.subtitles.segments.length === 0}
                <button class="ai-button summary-button" disabled>
                  需要先生成字幕
                </button>
              {:else}
                <button on:click={generateSummary} class="ai-button summary-button" disabled={summaryLoading}>
                  {#if summaryLoading}
                    <span class="loading-spinner"></span>
                    生成AI摘要
                  {:else}
                    生成AI摘要
                  {/if}
                </button>
              {/if}
            </div>
          {/if}
        </div>
      {/if}

      <!-- AI Chat Section - Always visible when video exists -->
      {#if videoInfo.title}
        <div class="ai-section" class:disabled={!videoInfo.subtitles || !videoInfo.subtitles.segments || videoInfo.subtitles.segments.length === 0}>
          <h3>💬 与AI聊天视频内容</h3>
          
          {#if showChat && videoInfo.subtitles && videoInfo.subtitles.segments && videoInfo.subtitles.segments.length > 0}
            <!-- Show chat interface -->
            <div class="chat-container">
              <div class="chat-messages" bind:this={chatMessagesContainer}>
                {#each chat.messages as message, i}
                  <div class="message {message.role}">
                    <div class="message-content">
                      {#each message.parts as part}
                        {#if part.type === 'text'}
                          <span class="message-text">{part.text}</span>
                        {/if}
                      {/each}
                      {#if message.role === 'assistant' && i === chat.messages.length - 1 && chatLoading}
                        <span class="typing-indicator">▋</span>
                      {/if}
                    </div>
                  </div>
                {/each}
                
                {#if chatLoading && chat.messages.length === 0}
                  <div class="message assistant">
                    <div class="message-content">
                      <span class="typing-indicator">AI正在思考...</span>
                    </div>
                  </div>
                {/if}
              </div>
              
              <form on:submit={chat.handleSubmit} class="chat-form">
                <input
                  bind:value={chat.input}
                  placeholder="问问AI关于这个视频的任何问题..."
                  class="chat-input"
                  disabled={chatLoading}
                />
                <button type="submit" class="chat-send" disabled={chatLoading || !chat.input.trim()}>
                  {#if chatLoading}
                    <span class="loading-spinner"></span>
                    发送中
                  {:else}
                    发送
                  {/if}
                </button>
              </form>
            </div>
          {:else}
            <!-- Show start chat button -->
            <div class="ai-button-container">
              {#if !videoInfo.subtitles || !videoInfo.subtitles.segments || videoInfo.subtitles.segments.length === 0}
                <button class="ai-button chat-button" disabled>
                  需要先生成字幕
                </button>
              {:else}
                <button on:click={() => showChat = true} class="ai-button chat-button">
                  与AI聊天
                </button>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .bili-info-container {
    max-width: 800px;
    margin: 20px auto;
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    border: 1px solid #ccc;
    border-radius: 8px;
    background-color: #f9f9f9;
  }

  .video-player-section {
    margin-top: 25px;
    padding: 20px;
    background-color: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 8px;
  }

  .video-player-section h3 {
    margin-top: 0;
    margin-bottom: 15px;
    color: #495057;
  }

  .player-container {
    margin: 15px 0;
  }

  .player-note {
    margin-top: 15px;
    font-size: 0.9rem;
    color: #6c757d;
    background-color: #e9ecef;
    padding: 10px 12px;
    border-radius: 4px;
    border-left: 3px solid #17a2b8;
    margin-bottom: 0;
  }

  .input-area {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
  }

  .input-area input[type="text"] {
    flex-grow: 1;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 16px;
  }

  .input-area button {
    padding: 10px 15px;
    font-size: 16px;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .input-area button:hover {
    background-color: #0056b3;
  }

  .input-area button:disabled {
    background-color: #aaa;
    cursor: not-allowed;
  }

  .error {
    color: red;
    margin-bottom: 15px;
  }

  .info-display h2 {
    font-size: 1.5em;
    margin-bottom: 0.5em;
    color: #333;
  }

  .info-display p {
    margin: 0.5em 0;
    line-height: 1.6;
    color: #555;
  }

  .info-display .stats {
    display: flex;
    gap: 20px;
    margin: 10px 0;
    flex-wrap: wrap;
  }

  .info-display .stats span {
    background-color: #e9e9e9;
    padding: 5px 10px;
    border-radius: 4px;
    font-size: 0.9em;
  }
  
  .description {
    margin-top: 15px;
    padding: 10px;
    background-color: #fff;
    border: 1px solid #eee;
    border-radius: 4px;
    max-height: 150px;
    overflow-y: auto;
  }

  .description p {
    white-space: pre-wrap;
    word-break: break-word;
  }

  .info-display a {
    color: #007bff;
    text-decoration: none;
  }

  .info-display a:hover {
    text-decoration: underline;
  }

  .thumbnail {
    max-width: 100%;
    height: auto;
    border-radius: 6px;
    margin-bottom: 15px;
    border: 1px solid #eee;
  }

  .copy-button {
    padding: 10px 15px;
    font-size: 16px;
    background-color: #28a745;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .copy-button:hover {
    background-color: #218838;
  }

  .copy-button:disabled {
    background-color: #aaa;
    cursor: not-allowed;
  }

  .subtitle-button {
    padding: 12px 24px;
    font-size: 16px;
    background-color: #17a2b8;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.3s ease;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 240px;
    justify-content: center;
  }

  .subtitle-button:hover:not(:disabled) {
    background-color: #138496;
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
  }

  .subtitle-button:disabled {
    background-color: #6c757d;
    cursor: not-allowed;
    opacity: 0.8;
  }

  .loading-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid transparent;
    border-top: 2px solid white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    display: inline-block;
    margin-right: 8px;
    vertical-align: middle;
  }

  .ai-button .loading-spinner {
    border-top-color: white;
  }

  .subtitle-button .loading-spinner {
    border-top-color: white;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .subtitles-section {
    margin-top: 25px;
    padding: 20px;
    background-color: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    height: 300px;
    display: flex;
    flex-direction: column;
  }

  .subtitles-section h3 {
    margin-top: 0;
    margin-bottom: 15px;
    color: #495057;
    flex-shrink: 0;
  }

  .subtitle-content-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    padding: 20px;
  }

  .subtitle-button-container {
    text-align: center;
  }

  .subtitle-status {
    margin-top: 10px;
    font-size: 14px;
    color: #17a2b8;
    font-style: italic;
    margin-bottom: 0;
  }

  .subtitle-segments {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .segments-container {
    flex: 1;
    overflow-y: auto;
    background-color: white;
    border: 1px solid #e9ecef;
    border-radius: 6px;
  }

  .segment {
    display: flex;
    align-items: flex-start;
    padding: 6px 12px;
    border-bottom: 1px solid #f1f3f4;
  }

  .segment:last-child {
    border-bottom: none;
  }

  .segment:hover {
    background-color: #f8f9fa;
  }

  .timestamp {
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 0.85em;
    color: #6c757d;
    background-color: #e9ecef;
    padding: 4px 8px;
    border-radius: 4px;
    margin-right: 12px;
    white-space: nowrap;
    min-width: 80px;
    text-align: center;
  }

  .segment-text {
    flex: 1;
    line-height: 1.6;
    color: #495057;
  }

  .summary-button {
    padding: 10px 15px;
    font-size: 16px;
    background-color: #6f42c1;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .summary-button:hover:not(:disabled) {
    background-color: #5a2d9b;
  }

  .summary-button:disabled {
    background-color: #aaa;
    cursor: not-allowed;
  }

  .chat-button {
    padding: 10px 15px;
    font-size: 16px;
    background-color: #e83e8c;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .chat-button:hover {
    background-color: #d91a72;
  }

  .ai-section {
    margin-top: 25px;
    padding: 20px;
    background-color: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 8px;
  }

  .ai-button-container {
    display: flex;
    justify-content: center;
    padding: 20px;
  }

  .ai-button {
    padding: 12px 24px;
    font-size: 16px;
    font-weight: 500;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 240px;
    text-align: center;
  }

  .ai-button.summary-button {
    background-color: #6f42c1;
    color: white;
  }

  .ai-button.summary-button:hover:not(:disabled) {
    background-color: #5a2d9b;
    transform: translateY(-1px);
  }

  .ai-button.chat-button {
    background-color: #e83e8c;
    color: white;
  }

  .ai-button.chat-button:hover {
    background-color: #d91a72;
    transform: translateY(-1px);
  }

  .ai-button:disabled {
    background-color: #aaa;
    cursor: not-allowed;
    transform: none;
  }

  .ai-section.disabled {
    opacity: 0.6;
    background-color: #f1f1f1;
  }

  .ai-section.disabled h3 {
    color: #999;
  }

  .ai-requirement-note {
    margin-top: 10px;
    font-size: 14px;
    color: #6c757d;
    text-align: center;
    font-style: italic;
    margin-bottom: 0;
  }

  .ai-section h3 {
    margin-top: 0;
    margin-bottom: 15px;
    color: #495057;
  }

  .summary-content {
    background-color: white;
    padding: 15px;
    border-radius: 6px;
    border: 1px solid #e9ecef;
  }

  .summary-content pre {
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    font-family: inherit;
    line-height: 1.6;
    min-height: 20px; /* Prevent layout shift */
  }

  .summary-content .typing-indicator {
    display: block;
    margin-top: 10px;
    font-style: italic;
    color: #6c757d;
    font-size: 14px;
    animation: pulse 1.5s ease-in-out infinite alternate;
  }

  @keyframes pulse {
    0% { opacity: 0.6; }
    100% { opacity: 1; }
  }

  .chat-container {
    display: flex;
    flex-direction: column;
    height: 400px;
  }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 15px;
    background-color: white;
    border: 1px solid #e9ecef;
    border-radius: 6px 6px 0 0;
    margin-bottom: 0;
  }

  .message {
    margin-bottom: 15px;
    display: flex;
  }

  .message.user {
    justify-content: flex-end;
  }

  .message.assistant {
    justify-content: flex-start;
  }

  .message-content {
    max-width: 80%;
    padding: 10px 15px;
    border-radius: 12px;
    line-height: 1.5;
    position: relative;
  }

  .message-text {
    display: inline;
  }

  .message.user .message-content {
    background-color: #007bff;
    color: white;
  }

  .message.assistant .message-content {
    background-color: #f1f3f4;
    color: #333;
  }

  .typing-indicator {
    font-style: italic;
    color: #6c757d;
    animation: blink 1s infinite;
  }

  .message-content .typing-indicator {
    display: inline;
    margin-left: 2px;
    font-size: 16px;
    font-weight: bold;
    color: #007bff;
    animation: cursor-blink 1s infinite;
  }

  @keyframes cursor-blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }

  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0.3; }
  }

  .chat-form {
    display: flex;
    background-color: white;
    border: 1px solid #e9ecef;
    border-top: none;
    border-radius: 0 0 6px 6px;
  }

  .chat-input {
    flex: 1;
    padding: 12px;
    border: none;
    outline: none;
    font-size: 16px;
  }

  .chat-send {
    padding: 12px 20px;
    background-color: #007bff;
    color: white;
    border: none;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .chat-send:hover:not(:disabled) {
    background-color: #0056b3;
  }

  .chat-send:disabled {
    background-color: #aaa;
    cursor: not-allowed;
  }

  /* Welcome Section Styles */
  .welcome-section {
    margin-top: 25px;
    padding: 20px;
    background-color: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    text-align: center;
    position: relative;
    transition: filter 0.3s ease;
  }

  .welcome-section.loading .welcome-content {
    filter: blur(2px);
    opacity: 0.6;
    pointer-events: none;
  }

  .welcome-content {
    max-width: 600px;
    margin: 0 auto;
  }

  .welcome-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
    animation: float 3s ease-in-out infinite;
  }

  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-8px); }
  }

  .welcome-title {
    font-size: 1.8rem;
    margin: 0 0 0.8rem 0;
    font-weight: 600;
    color: #495057;
  }

  .welcome-description {
    font-size: 1rem;
    margin: 0 0 2rem 0;
    color: #6c757d;
    line-height: 1.5;
  }

  .feature-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 0.8rem;
    margin: 2rem 0;
  }

  .feature-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: white;
    border: 1px solid #e9ecef;
    border-radius: 6px;
    padding: 0.8rem 0.4rem;
  }

  .feature-icon {
    font-size: 1.5rem;
    margin-bottom: 0.4rem;
  }

  .feature-text {
    font-size: 0.8rem;
    font-weight: 500;
    color: #495057;
    text-align: center;
  }

  .github-section {
    margin-top: 2rem;
    padding: 1rem;
    background: white;
    border: 1px solid #e9ecef;
    border-radius: 6px;
  }

  .github-section p {
    margin: 0;
    color: #6c757d;
    font-size: 0.95rem;
  }

  .github-icon {
    font-size: 1.2rem;
    margin-right: 0.5rem;
  }

  .github-section a {
    color: #007bff;
    text-decoration: none;
    font-weight: 500;
  }

  .github-section a:hover {
    text-decoration: underline;
  }

  /* Loading Overlay Styles */
  .loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(1px);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
  }

  .loading-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .loading-spinner-large {
    width: 40px;
    height: 40px;
    border: 4px solid #e9ecef;
    border-top: 4px solid #007bff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .loading-text {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 500;
    color: #495057;
    text-align: center;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .welcome-section {
      padding: 15px;
    }
    
    .welcome-title {
      font-size: 1.5rem;
    }
    
    .welcome-description {
      font-size: 0.95rem;
    }
    
    .feature-grid {
      grid-template-columns: repeat(3, 1fr);
      gap: 0.6rem;
    }
    
    .feature-item {
      padding: 0.6rem 0.3rem;
    }

    .feature-icon {
      font-size: 1.3rem;
    }

    .feature-text {
      font-size: 0.75rem;
    }
  }

  @media (max-width: 480px) {
    .feature-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

</style> 