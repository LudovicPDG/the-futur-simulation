<script lang="ts">
	import { navbarVisible } from '$lib/stores/navbar';

	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { localizeHref, getLocale, setLocale } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { clickOutside } from '$lib/actions/clickOutside';

	import { slide } from 'svelte/transition';
	import { MediaQuery } from 'svelte/reactivity';

	let langMenuOpen = $state(false);
	import { browser } from '$app/environment';

	const initialTheme: 'light' | 'dark' =
		browser && localStorage.getItem('theme')
			? (localStorage.getItem('theme') as 'light' | 'dark')
			: browser && window.matchMedia('(prefers-color-scheme: dark)').matches
				? 'dark'
				: 'light';

	let theme = $state<'light' | 'dark'>(initialTheme);

	function toggleLightMode() {
		theme = theme === 'dark' ? 'light' : 'dark';
	}

	let {
		toggleBurgerMenu = () => {},
		onTheHeader = false,
		burgerMenuOpen = false
	}: {
		toggleBurgerMenu?: (event: MouseEvent) => void;
		onTheHeader?: boolean;
		burgerMenuOpen?: boolean;
	} = $props();

	let toggleLangMenu = () => {
		langMenuOpen = !langMenuOpen;
	};

	const languages = [
		{ code: 'en', name: 'English' },
		{ code: 'es', name: 'Español' },
		{ code: 'fr', name: 'Français' },
		{ code: 'de', name: 'Deutsch' }
	] as const;

	function selectLanguage(locale: (typeof languages)[number]['code']) {
		setLocale(locale, { reload: false });
	}

	$effect(() => {
		if (!browser) return;

		document.body.classList.remove('light', 'dark');
		document.body.classList.add(theme);
		localStorage.setItem('theme', theme);
	});

	console.log(getLocale());
</script>

<header class:visible={$navbarVisible}>
	<nav>
		<a href={resolve(localizeHref('/', { locale: getLocale() }) as Pathname)}
			>The Future Simulation</a
		>
	</nav>
	<div class="left-elements {onTheHeader ? 'onTheHeader' : 'notOnTheHeader'}">
		{#if !(burgerMenuOpen && onTheHeader)}
			<div id="lang-dropdown" use:clickOutside={() => (langMenuOpen = false)}>
				<button class="left-btn" id="lang-flag-btn" onclick={toggleLangMenu}>
					<img id="lang-flag" src="/icon/flag/{getLocale()}.svg" alt="English flag" />
				</button>

				{#if langMenuOpen && $navbarVisible}
					<div id="lang-menu" transition:slide={{ duration: 300 }}>
						{#each languages as lang (lang.code)}
							<a
								data-sveltekit-reload
								class="lang-option"
								onclick={() => selectLanguage(lang.code)}
								href={resolve(
									(lang.code === 'en'
										? '/en'
										: localizeHref(page.url.pathname, { locale: lang.code })) as Pathname
								)}
							>
								<img src="/icon/flag/{lang.code}.svg" alt="{lang.name} flag" />

								<span>{lang.name}</span>
							</a>
						{/each}
					</div>
				{/if}
			</div>
			<button class="left-btn" id="light-mode" onclick={toggleLightMode}>
				<img src="/icon/{theme}-mode.svg" alt="change the color theme" />
			</button>
		{/if}
		{#if onTheHeader}
			<button class="left-btn" id="burger-menu-btn" onclick={toggleBurgerMenu}>
				<img id="burger-menu" src="/icon/burger-menu.svg" alt="Burger menu icon" />
			</button>
		{/if}
	</div>
</header>

<style>
	header {
		position: fixed;
		top: 0;
		z-index: 1000;
		width: 100%;
		height: 10vh;
		padding: 0.5rem 1.5rem;
		display: flex;
		align-items: center;
		background-color: var(--futuristic-blue);
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
		transform: translateY(-100%);
		transition: transform 0.3s ease;
	}

	header.visible {
		transform: translateY(0);
	}

	nav {
		flex: 1;
		min-width: 0;
	}

	a {
		color: white;
		text-decoration: none;
		font-weight: 600;
		font-size: 1.1rem;
	}

	:global(body.dark) {
		background-color: black;
		color: white;
		transition:
			background-color 0.3s,
			color 0.3s;
	}

	:global(body.light) {
		background-color: white;
		color: black;
		transition:
			background-color 0.5s,
			color 0.5s;
	}

	img {
		height: 2rem;
		width: auto;
	}

	.left-elements {
		width: auto;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.75rem;
	}

	.left-elements.onTheHeader {
		height: 100%;
	}

	.left-btn {
		width: 3.25rem;
		height: 3.25rem;
		border: 1px solid rgba(0, 0, 0, 0.24);
		border-radius: 0.75rem;
		padding: 0.8rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: rgba(0, 0, 0, 0.15);
		color: #17202a;
		transition:
			background-color 0.2s ease,
			transform 0.2s ease,
			box-shadow 0.2s ease;
	}

	.left-btn:hover {
		background-color: rgba(0, 0, 0, 0.3);
		box-shadow: 0 6px 16px rgba(0, 0, 0, 0.24);
		transform: translateY(-2px);
		cursor: pointer;
	}

	#burger-menu-btn {
		display: none;
	}

	#lang-menu {
		position: absolute;
		top: calc(100% + 0.5rem);
		inset-inline-end: 0;
		width: 12rem;
		background: white;
		border: 1px solid rgba(23, 32, 42, 0.15);
		border-radius: 0.75rem;
		padding: 0.75rem;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
		z-index: 1000;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		left: 50%;
		transform: translateX(-50%);
	}

	.lang-option {
		width: 100%;
		color: #17202a;
		display: flex;
		align-items: center;
		justify-content: left;
		gap: 0.5rem;
		cursor: pointer;
		transition: all 0.2s ease;
		border-radius: 4px;
		padding: 0.5rem;
	}

	.lang-option:hover {
		background-color: var(--futuristic-blue);
		transform: translateX(-4px);
	}

	.lang-option img {
		height: 2rem;
	}

	#lang-dropdown {
		position: relative;
		height: auto;
	}

	#light-mode {
		padding: 0.4rem;
	}

	@media (max-width: 1000px) {
		header {
			height: max(10vh, 5.25rem);
			padding-inline: 0.5rem;
		}

		.left-elements.onTheHeader #lang-flag-btn {
			display: none;
		}
		#burger-menu-btn {
			display: block;
		}
		.left-elements {
			padding: 0;
		}
		.left-elements.onTheHeader #light-mode {
			display: none;
		}

		.left-elements.notOnTheHeader {
			height: auto;
			margin-inline-start: auto;
			margin-bottom: 0;
			margin-inline-end: 0.25rem;
			gap: 0.35rem;
		}

		.left-elements.notOnTheHeader .left-btn,
		.left-elements.onTheHeader #burger-menu-btn {
			width: clamp(4rem, 8vw, 5rem);
			height: clamp(4rem, 8vw, 5rem);
			padding: 0.35rem;
		}

		.left-elements.notOnTheHeader .left-btn img,
		.left-elements.onTheHeader #burger-menu-btn img {
			height: clamp(2.75rem, 5vw, 3.5rem);
		}
	}
</style>
