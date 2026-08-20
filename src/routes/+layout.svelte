<script lang="ts">
	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { locales, localizeHref } from '$lib/paraglide/runtime';
	import '@fontsource-variable/roboto/wght.css';
	import Navbar from './navbar.svelte';
	import Footer from './Footer.svelte';

	let { data, children } = $props();
</script>

<Navbar />
<main>{@render children()}</main>
<Footer />

<div style="display:none">
	{#each locales as locale (locale)}
		<a href={resolve(localizeHref(page.url.pathname, { locale }) as Pathname)}>{locale}</a>
	{/each}
</div>

<style>
	:global(html),
	:global(body) {
		margin: 0;
		width: 100%;
		min-height: 100%;
		font-family: 'Roboto Variable', sans-serif;
	}

	:global(*),
	:global(*::before),
	:global(*::after) {
		box-sizing: border-box;
	}

	:global(body) {
		display: flex;
		flex-direction: column;
	}

	:global(:root) {
		--futuristic-blue: #2563eb;
		--futuristic-purple: #7c3aed;
	}

	main {
		flex: 1;
		width: 100%;
		min-height: 100vh;
	}
</style>
