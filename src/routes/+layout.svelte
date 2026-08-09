<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '@fontsource-variable/roboto/wght.css';
	import Navbar from './Navbar.svelte';
	import Footer from './Footer.svelte';

	let { data, children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Navbar></Navbar>

<main>
	{@render children()}
</main>

<Footer></Footer>

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
