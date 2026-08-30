<script lang="ts">
	import { navbarVisible } from '$lib/stores/navbar';
	import CrystalBall from '../Crystal-ball.svelte';
	import OrganisationGraph, {
		type OrganisationData
	} from '$lib/components/OrganisationGraph.svelte';
	import { onMount } from 'svelte';

	navbarVisible.set(true);

	let organisations = $state<OrganisationData[]>([]);

	async function loadOrganisations() {
		try {
			const res = await fetch('/api/organisations');
			const data = await res.json();
			if (data.organisations) {
				organisations = data.organisations;
			}
		} catch (err) {
			console.error('Error loading organisations:', err);
		}
	}

	onMount(() => {
		loadOrganisations();
	});

	let prompt = $state('');
	let promptPrefix = $state<{ mode: 'argument' | 'counter_argument'; targetName: string; targetId?: string } | null>(null);
	let feedbackMessage = $state<{ text: string; type: 'success' | 'error' } | null>(null);

	function handleAddArgument(mode: 'argument' | 'counter_argument', targetName: string, targetId?: string) {
		promptPrefix = { mode, targetName, targetId };
	}

	function clearPromptPrefix() {
		promptPrefix = null;
	}

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
	let isLoading = $state(false);

	async function submit() {
		if (!prompt.trim() || isLoading) return;

		let fullPrompt = prompt;
		if (promptPrefix) {
			const actionLabel = promptPrefix.mode === 'argument' ? 'Ajouter un argument' : 'Ajouter un contre-argument';
			fullPrompt = `[Action: ${actionLabel} sur "${promptPrefix.targetName}" (id: ${promptPrefix.targetId || ''})] : ${prompt}`;
		}

		const userPrompt = fullPrompt;
		prompt = '';
		promptPrefix = null;
		isLoading = true;
		feedbackMessage = null;

		try {
			const response = await fetch('/api/genie', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ prompt: userPrompt })
			});

			const data = await response.json();
			if (!response.ok || data.error) {
				console.error('Genie error:', data.error);
				feedbackMessage = { text: data.error || 'Erreur lors du traitement', type: 'error' };
			} else {
				console.log('Genie result:', data.result);
				if (data.result?.action === 'create_organisation' && data.result?.organisation) {
					const newOrg = data.result.organisation;
					if (!organisations.some((o) => o.name === newOrg.name)) {
						organisations = [...organisations, newOrg];
					}
					feedbackMessage = { text: 'Organisation créée avec succès !', type: 'success' };
				} else if (data.result?.proof) {
					feedbackMessage = {
						text: `Preuve enregistrée avec succès (Crédibilité: ${data.result.proof.credibility}%, Impact: ${data.result.proof.impact}) !`,
						type: 'success'
					};
					await loadOrganisations();
				} else {
					feedbackMessage = { text: 'Action effectuée avec succès !', type: 'success' };
					await loadOrganisations();
				}
			}
		} catch (error) {
			console.error('Failed to call Genie.ask:', error);
			feedbackMessage = { text: 'Erreur de communication avec le Génie', type: 'error' };
		} finally {
			isLoading = false;
			setTimeout(() => {
				feedbackMessage = null;
			}, 5000);
		}
	}

	let displayedPlaceholder = $state('');

	const placeholderTexts = [
		'Ajoute telle organisation dans la simulation',
		'Ajoute un argument ou une preuve pour modifier la satisfaction',
		'Conteste une valeur en apportant un contre-argument'
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
		<OrganisationGraph {organisations} onAddArgument={handleAddArgument} />
	</main>

	<!-- Feedback Notification -->
	{#if feedbackMessage}
		<div class="feedback-toast" class:error={feedbackMessage.type === 'error'} class:success={feedbackMessage.type === 'success'}>
			{feedbackMessage.text}
		</div>
	{/if}

	<!-- Prompt -->
	<form
		class="prompt-container"
		onsubmit={(e) => {
			e.preventDefault();
			submit();
		}}
	>
		{#if promptPrefix}
			<div class="prompt-intent-tag" class:counter={promptPrefix.mode === 'counter_argument'}>
				<span class="tag-label">
					{promptPrefix.mode === 'argument' ? 'Ajouter un argument' : 'Ajouter un contre-argument'}
				</span>
				<span class="target-name">({promptPrefix.targetName})</span>
				<button type="button" class="tag-close-btn" onclick={clearPromptPrefix} title="Annuler le ciblage">
					✕
				</button>
			</div>
		{/if}

		<input
			bind:value={prompt}
			placeholder={promptPrefix ? 'Saisissez votre argument ici...' : displayedPlaceholder}
			aria-label="Prompt"
		/>
		<button id="submit" type="submit" aria-label="Envoyer" disabled={isLoading}>
			{isLoading ? '⏳' : '➤'}
		</button>
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

	.feedback-toast {
		position: absolute;
		top: calc(10vh + 24px);
		left: 50%;
		transform: translateX(-50%);
		z-index: 100;
		padding: 10px 18px;
		border-radius: 12px;
		font-size: 13px;
		font-weight: 600;
		backdrop-filter: blur(10px);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
		animation: fadeIn 0.25s ease;
	}

	.feedback-toast.success {
		background: rgba(34, 197, 94, 0.9);
		color: white;
		border: 1px solid rgba(255, 255, 255, 0.3);
	}

	.feedback-toast.error {
		background: rgba(239, 68, 68, 0.9);
		color: white;
		border: 1px solid rgba(255, 255, 255, 0.3);
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translate(-50%, -10px);
		}
		to {
			opacity: 1;
			transform: translate(-50%, 0);
		}
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

	.prompt-intent-tag {
		display: flex;
		align-items: center;
		gap: 6px;
		background: #fee2e2;
		border: 1px solid #f87171;
		color: #b91c1c;
		padding: 6px 10px;
		border-radius: 10px;
		font-size: 13px;
		font-weight: 600;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.prompt-intent-tag.counter {
		background: #ffedd5;
		border-color: #fb923c;
		color: #c2410c;
	}

	.tag-label {
		color: #dc2626;
		font-weight: 700;
	}

	.target-name {
		font-size: 11px;
		color: #64748b;
		max-width: 140px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tag-close-btn {
		background: transparent;
		border: none;
		color: #ef4444;
		font-size: 12px;
		font-weight: bold;
		cursor: pointer;
		padding: 0 2px;
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
		display: flex;
		align-items: center;
		justify-content: center;
	}

	#submit:hover:not(:disabled) {
		background: #1d4ed8;
	}

	#submit:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>

