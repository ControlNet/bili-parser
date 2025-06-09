<script lang="ts">
  import {
    getVideoInfo,
    formatVideoInfoForCopy,
    fetchSubtitles,
    type VideoInfoShape,
    type SubtitleData
  } from '$lib/biliUtils';

  let biliUrl = '';
  let videoInfo: Partial<VideoInfoShape> = {};
  let loading = false;
  let subtitleLoading = false;
  let error = '';
  let subtitleError = '';
  let copyButtonText = '复制信息';
  let showSubtitles = false;

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
    } catch (e: any) {
      console.error('Error in fetchAndSetVideoInfo:', e);
      error = e.message || '获取信息时发生未知错误';
      videoInfo = {};
    } finally {
      loading = false;
      copyButtonText = '复制信息';
    }
  }

  async function generateSubtitles() {
    if (!videoInfo.bvid || !videoInfo.cid) {
      subtitleError = '缺少视频信息，无法生成字幕';
      return;
    }

    subtitleLoading = true;
    subtitleError = '';

    try {
      const subtitleData = await fetchSubtitles(videoInfo.bvid, videoInfo.cid, fetch);
      videoInfo.subtitles = subtitleData;
      showSubtitles = true;
    } catch (e: any) {
      console.error('Error generating subtitles:', e);
      subtitleError = e.message || '生成字幕时发生错误';
    } finally {
      subtitleLoading = false;
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
                    生成AI字幕中...
                  {:else}
                    生成AI字幕
                  {/if}
                </button>
              </div>
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
    min-width: 120px;
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

</style> 