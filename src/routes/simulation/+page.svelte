<script lang="ts">
	import { navbarVisible } from '$lib/stores/navbar';
	import CrystalBall from '../Crystal-ball.svelte';
	import { onMount } from 'svelte';

	navbarVisible.set(true);

	let prompt = $state('');

	let agitation_level = $state(4);
	let ballSize = $state(100);

	let isHovered = $state(false);
	let isClicked = $state(false);

	let clickTimeout: ReturnType<typeof setTimeout>;

	function handleMouseEnter() {
		isHovered = true;

		if (!isClicked) {
			agitation_level = 7;
			ballSize = 105;
		}
	}

	function handleMouseLeave() {
		isHovered = false;

		if (!isClicked) {
			agitation_level = 4;
			ballSize = 100;
		}
	}

	function handleClick() {
		isClicked = true;

		// Forte agitation
		agitation_level = 10;
		ballSize = 105;

		// Annule le précédent timer s'il existe
		clearTimeout(clickTimeout);

		// Retour à la normale après 2 secondes
		clickTimeout = setTimeout(() => {
			isClicked = false;

			if (isHovered) {
				// La souris est toujours dessus
				agitation_level = 7;
				ballSize = 105;
			} else {
				// La souris n'est plus dessus
				agitation_level = 4;
				ballSize = 100;
			}
		}, 500);
	}
	function submit() {
		if (!prompt.trim()) return;

		console.log(prompt);
		prompt = '';
	}

	let displayedPlaceholder = $state('');

	const placeholderTexts = [
		'Ajoute telle organisation dans la simulation',
		'Ajoute tel événement',
		'Que se passe-t-il si telle organisation fait tel événement ?'
	];

	let placeholderIndex = 0;
	let placeholderSession = 0;

	function sleep(ms: number) {
		return new Promise<void>((resolve) => setTimeout(resolve, ms));
	}

	function stopPlaceholderAnimation() {
		placeholderSession++;
		displayedPlaceholder = '';
	}

	async function animatePlaceholder() {
		const session = ++placeholderSession;

		placeholderIndex = 0;

		while (session === placeholderSession) {
			const text = placeholderTexts[placeholderIndex];

			// Écriture
			for (let i = 0; i < text.length; i++) {
				if (session !== placeholderSession) return;

				displayedPlaceholder = text.slice(0, i + 1);
				await sleep(45);
			}

			// Pause
			await sleep(1800);

			if (session !== placeholderSession) return;

			// Effacement
			for (let i = text.length; i > 0; i--) {
				if (session !== placeholderSession) return;

				displayedPlaceholder = text.slice(0, i - 1);
				await sleep(30);
			}

			await sleep(400);

			placeholderIndex = (placeholderIndex + 1) % placeholderTexts.length;
		}
	}

	let placeholderRestartTimeout: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		if (placeholderRestartTimeout) {
			clearTimeout(placeholderRestartTimeout);
		}

		if (prompt.length > 0) {
			stopPlaceholderAnimation();
		} else {
			placeholderRestartTimeout = setTimeout(() => {
				if (prompt.length === 0) {
					animatePlaceholder();
				}
			}, 1000);
		}

		return () => {
			if (placeholderRestartTimeout) {
				clearTimeout(placeholderRestartTimeout);
			}
		};
	});
</script>

<div class="page">
	<!-- Personnage -->
	<button
		class="character"
		style={`width: ${ballSize}px; height: ${ballSize}px;`}
		onmouseenter={handleMouseEnter}
		onmouseleave={handleMouseLeave}
		onclick={handleClick}
	>
		<CrystalBall {agitation_level} />
	</button>

	<main class="content">
		<!-- Ton contenu ici -->
	</main>

	<!-- Prompt -->
	<form
		class="prompt-container"
		onsubmit={(e) => {
			e.preventDefault();
			submit();
		}}
	>
		<input bind:value={prompt} placeholder={displayedPlaceholder} aria-label="Prompt" />
		<button id="submit" type="submit" aria-label="Envoyer"> ➤ </button>
	</form>
</div>

<style>
	.page {
		padding-top: 10vh;
		width: 100%;
		height: 90vh;
		overflow: hidden;
		position: relative;
	}

	.content {
		width: 100%;
		height: 100%;
	}

	.character {
		position: absolute;
		top: calc(10vh + 24px);
		right: 24px;

		display: flex;
		align-items: center;
		justify-content: center;

		z-index: 10;
		cursor: pointer;

		background-color: transparent;
		border: none;

		transition:
			width 0.3s ease,
			height 0.3s ease;
	}

	.prompt-container {
		position: absolute;
		bottom: 24px;
		left: 50%;
		transform: translateX(-50%);

		display: flex;
		align-items: center;
		gap: 8px;

		width: min(700px, calc(100% - 32px));
		padding: 8px;

		background: white;
		border: 1px solid #e2e8f0;
		border-radius: 18px;

		box-shadow: 0 8px 30px rgb(0 0 0 / 10%);

		z-index: 20;
	}

	input {
		flex: 1;
		min-width: 0;

		padding: 14px 16px;

		border: none;
		outline: none;
		background: transparent;

		font-size: 16px;
	}

	#submit {
		width: 44px;
		height: 44px;

		border: none;
		border-radius: 12px;

		background: #2563eb;
		color: white;

		font-size: 20px;
		cursor: pointer;
	}

	#submit:hover {
		background: #1d4ed8;
	}
</style>
