<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '@fontsource-variable/roboto/wght.css';
	import Navbar from './navbar.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Navbar></Navbar>

<main>
	{@render children()}
</main>

<style>
	:global(html),
	:global(body) {
		margin: 0;
		width: 100%;
		height: 100%;
		font-family: 'Roboto Variable', sans-serif;
	}

	:global(*),
	:global(*::before),
	:global(*::after) {
		box-sizing: border-box;
	}

	main {
		width: 100%;
		height: 100%;
	}

	:global(:root) {
		--futuristic-blue: #2563eb;
		--futuristic-purple: #7c3aed;
	}
</style>
