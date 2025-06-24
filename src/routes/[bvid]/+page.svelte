<script lang="ts">
  import BiliInfo from '$lib/BiliInfo.svelte';
  import type { PageData } from './$types';

  export let data: PageData;
</script>

<svelte:head>
  <title>Bilibili Info Parser - {data.bvid}</title>
  <meta name="description" content="Parse Bilibili video {data.bvid} and display information" />
</svelte:head>

<BiliInfo initialBvid={data.bvid} />
