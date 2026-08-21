<script lang="ts">
	import { navbarVisible } from '$lib/stores/navbar';
	import CrystalBall from '../Crystal-ball.svelte';

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
			ballSize = 110;
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
		ballSize = 110;

		// Annule le précédent timer s'il existe
		clearTimeout(clickTimeout);

		// Retour à la normale après 2 secondes
		clickTimeout = setTimeout(() => {
			isClicked = false;

			if (isHovered) {
				// La souris est toujours dessus
				agitation_level = 7;
				ballSize = 110;
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
		<input bind:value={prompt} placeholder="Que voulez-vous faire ?" aria-label="Prompt" />

		<button id="submit" type="submit" aria-label="Envoyer"> ➤ </button>
	</form>
</div>

<style>
	.page {
		margin-top: 10vh;
		position: relative;
		width: 100%;
		height: 100dvh;
		overflow: hidden;
	}

	.content {
		width: 100%;
		height: 100%;
	}

	.character {
		position: absolute;
		top: 24px;
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
