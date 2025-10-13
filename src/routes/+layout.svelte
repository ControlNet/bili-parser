<script lang="ts">
  import '../app.css';

  let { children } = $props();
</script>

<svelte:head>
  {#if import.meta.env.PROD}
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-YQQ8ZW96YX"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());

      gtag('config', 'G-YQQ8ZW96YX');
    </script>
  {/if}
  
</svelte:head>

{@render children()}
