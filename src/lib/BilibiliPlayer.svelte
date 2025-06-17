<script>
  export let bvid = '';
  export let aid = '';
  export let page = 1;
  export let width = '100%';
  export let height = '600px';
  export let aspectRatio = '16:9';
  export let highQuality = true;
  export let danmaku = false;
  export let autoplay = false;
  export let responsive = true;

  // Convert BVID to proper format if needed
  $: videoId = bvid || aid;
  $: bvidParam = bvid ? `bvid=${bvid}` : `aid=${aid}`;
  
  // Build iframe src URL
  $: iframeSrc = `https://player.bilibili.com/player.html?${bvidParam}&page=${page}&high_quality=${highQuality ? 1 : 0}&danmaku=${danmaku ? 1 : 0}&autoplay=${autoplay ? 1 : 0}`;

  // Calculate responsive padding based on aspect ratio
  $: [ratioW, ratioH] = aspectRatio.split(':').map(Number);
  $: paddingBottom = responsive ? `${(ratioH / ratioW) * 100}%` : '0';
</script>

{#if videoId}
  <div class="bilibili-player" class:responsive>
    {#if responsive}
      <div class="responsive-container" style="padding-bottom: {paddingBottom};">
        <iframe
          src={iframeSrc}
          title="Bilibili Video Player"
          frameborder="0"
          scrolling="no"
          allowfullscreen
          class="responsive-iframe"
        ></iframe>
      </div>
    {:else}
      <iframe
        src={iframeSrc}
        title="Bilibili Video Player"
        {width}
        {height}
        frameborder="0"
        scrolling="no"
        allowfullscreen
        class="fixed-iframe"
      ></iframe>
    {/if}
  </div>
{:else}
  <div class="error">
    <p>❌ No video ID provided. Please provide either bvid or aid.</p>
  </div>
{/if}

<style>
  .bilibili-player {
    width: 100%;
    margin: 1rem 0;
  }

  .responsive-container {
    position: relative;
    width: 100%;
    height: 0;
    overflow: hidden;
  }

  .responsive-iframe {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: none;
  }

  .fixed-iframe {
    border: none;
    max-width: 100%;
  }

  .error {
    padding: 2rem;
    background: #fee;
    border: 1px solid #fcc;
    border-radius: 8px;
    text-align: center;
    color: #c33;
  }

  /* Mobile optimizations */
  @media (max-width: 768px) {
    .bilibili-player {
      margin: 0.5rem 0;
    }
    
    .responsive-container {
      /* 16:9 aspect ratio for mobile */
      padding-bottom: 56.25%;
    }
  }
</style> 