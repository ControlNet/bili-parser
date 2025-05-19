<script lang="ts">
  import {
    extractBvid,
    getVideoInfo,
    formatVideoInfoForCopy,
    type VideoInfoShape
  } from '$lib/biliUtils';

  let biliUrl = '';
  // Initialize with a structure that matches VideoInfoShape but with empty values
  let videoInfo: Partial<VideoInfoShape> = {}; // Use Partial as it might not be fully populated initially
  let loading = false;
  let error = '';
  let copyButtonText = '复制信息';

  async function fetchAndSetVideoInfo() {
    const bvid = extractBvid(biliUrl);
    if (!bvid) {
      error = '无效的Bilibili链接或无法提取BV号';
      videoInfo = {}; // Clear previous info
      return;
    }

    loading = true;
    error = '';
    videoInfo = {}; // Clear previous info

    try {
      // 'fetch' here is the browser's native fetch, which will correctly hit our /api/bili proxy setup
      const fetchedInfo = await getVideoInfo(bvid, fetch);
      videoInfo = fetchedInfo;
    } catch (e: any) {
      console.error(e);
      error = e.message || '获取信息时发生未知错误';
      videoInfo = {}; // Clear info on error
    } finally {
      loading = false;
      copyButtonText = '复制信息';
    }
  }

  async function copyCurrentInfoToClipboard() {
    if (!videoInfo.title) {
      alert('没有可复制的信息。');
      return;
    }
    // videoInfo is already populated, so we cast it to VideoInfoShape for the formatter
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
    <input type="text" bind:value={biliUrl} placeholder="输入Bilibili链接 (例如: https://www.bilibili.com/video/BVxxxxxx)" />
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
    max-height: 150px; /* Added max-height */
    overflow-y: auto;   /* Added scroll for overflow */
  }

  .description p {
    white-space: pre-wrap; /* Allow wrapping for long descriptions */
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
    padding: 10px 15px; /* Adjusted padding to match fetch button if desired */
    font-size: 16px;    /* Adjusted font size to match fetch button if desired */
    background-color: #28a745; /* Green */
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

</style> 