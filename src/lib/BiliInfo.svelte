<script lang="ts">
  import {
    getVideoInfo,
    formatVideoInfoForCopy,
    type VideoInfoShape
  } from '$lib/biliUtils';

  let biliUrl = '';
  let videoInfo: Partial<VideoInfoShape> = {};
  let loading = false;
  let error = '';
  let copyButtonText = '复制信息';

  async function fetchAndSetVideoInfo() {
    if (!biliUrl.trim()) {
      error = '请输入Bilibili链接或BV/b23代码';
      videoInfo = {};
      return;
    }

    loading = true;
    error = '';
    videoInfo = {};

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

</style> 