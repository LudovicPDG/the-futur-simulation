<script lang="ts">
	import { navbarVisible } from '$lib/stores/navbar';
	import { simulationStore } from '$lib/stores/simulation';
	import { addProofTarget, addRelationTarget, addValueTarget, debateTarget } from '$lib/stores/debate';
	import * as m from '$lib/paraglide/messages';
	import CrystalBall from '../Crystal-ball.svelte';
	import MainBackground from './Main-background.svelte';
	import TimeMachine from './TimeMachine.svelte';
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { form, data }: { form: ActionData; data: PageData } = $props();

	navbarVisible.set(true);

	$effect(() => {
		simulationStore.init(data?.all_data);
	});

	let prompt = $state('');
	let promptEl: HTMLTextAreaElement | undefined = $state();

	// Adapte la hauteur du textarea au contenu (le CSS max-height gère le scroll)
	$effect(() => {
		prompt;
		if (!promptEl) return;
		promptEl.style.height = 'auto';
		promptEl.style.height = `${promptEl.scrollHeight}px`;
	});

	// Entrée envoie, Maj+Entrée saute une ligne
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			(e.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
		}
	}

	let simulationDate = $state(new Date());

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

	let genieMessage = $state<string | null>(null);
	let lastGenieIndex = -1;
	let genieMessageTimeout: ReturnType<typeof setTimeout>;

	function sayMessage(text: string, duration = 5000) {
		genieMessage = text;
		clearTimeout(genieMessageTimeout);
		genieMessageTimeout = setTimeout(() => {
			genieMessage = null;
		}, duration);
	}

	function sayRandomMessage() {
		const messages = [m.genie_say_1(), m.genie_say_2(), m.genie_say_3()];
		let index = Math.floor(Math.random() * messages.length);
		if (messages.length > 1 && index === lastGenieIndex) {
			index = (index + 1) % messages.length;
		}
		lastGenieIndex = index;
		sayMessage(messages[index]);
	}

	// The genie refused a relation: it tells why in its bubble
	$effect(() => {
		const refusal = form?.refusal;
		if (refusal === 'not_relatable') sayMessage(m.genie_relation_not_relatable(), 8000);
		else if (refusal === 'symmetry_conflict') sayMessage(m.genie_relation_symmetry_conflict(), 8000);
	});

	function handleClick() {
		isClicked = true;
		sayRandomMessage();

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

		console.log('submit', prompt);
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

	{#if genieMessage}
		<div class="genie-cloud" style={`right: ${ballSize + 40}px;`} role="status">
			{#key genieMessage}
				<span>{genieMessage}</span>
			{/key}
			<i class="tail tail-1"></i>
			<i class="tail tail-2"></i>
		</div>
	{/if}

	<TimeMachine bind:date={simulationDate} />

	<MainBackground new_element={form?.result} simulation_data={$simulationStore.all_elements} date={simulationDate} />

	<!-- Prompt -->
	<form
		method="POST"
		action="?/askGenie"
		use:enhance={() => {
			const submittedPrompt = prompt;
			prompt = '';
			debateTarget.set(null);
			addValueTarget.set(null);
			addProofTarget.set(null);
			addRelationTarget.set(null);
			return async ({ update }) => {
				await update({ reset: false });
			};
		}}
		class="prompt-container"
	>
		{#if $debateTarget}
			<input type="hidden" name="debate_proof_id" value={$debateTarget.id} />
			<div class="debate-chip" title={$debateTarget.name}>
				<span aria-hidden="true">⚖️</span>
				<span class="debate-label">{m.proof_debate_chip()} « {$debateTarget.name} »</span>
				<button
					type="button"
					class="debate-remove"
					aria-label={m.proof_debate_remove()}
					onclick={() => debateTarget.set(null)}
				>
					×
				</button>
			</div>
		{/if}
		{#if $addValueTarget}
			<input type="hidden" name="add_value_fact_id" value={$addValueTarget.factId} />
			<input type="hidden" name="add_value_field" value={$addValueTarget.field} />
			<div class="debate-chip add-value-chip" title={$addValueTarget.name}>
				<span aria-hidden="true">➕</span>
				<span class="debate-label">{m.value_add_chip()} « {$addValueTarget.name} »</span>
				<button
					type="button"
					class="debate-remove"
					aria-label={m.value_add_remove()}
					onclick={() => addValueTarget.set(null)}
				>
					×
				</button>
			</div>
		{/if}
		{#if $addProofTarget}
			<input type="hidden" name="add_proof_id" value={$addProofTarget.id} />
			<input type="hidden" name="add_proof_kind" value={$addProofTarget.kind} />
			<input type="hidden" name="add_proof_value_name" value={JSON.stringify($addProofTarget.valueName)} />
			<div class="debate-chip add-value-chip" title={$addProofTarget.name}>
				<span aria-hidden="true">📎</span>
				<span class="debate-label">{m.proof_add_chip()} « {$addProofTarget.name} »</span>
				<button
					type="button"
					class="debate-remove"
					aria-label={m.proof_add_remove()}
					onclick={() => addProofTarget.set(null)}
				>
					×
				</button>
			</div>
		{/if}
		{#if $addRelationTarget}
			<input type="hidden" name="add_relation_element_id" value={$addRelationTarget.elementId} />
			<input type="hidden" name="add_relation_value_name" value={JSON.stringify($addRelationTarget.valueName)} />
			<div class="debate-chip add-value-chip" title={$addRelationTarget.name}>
				<span aria-hidden="true">🔗</span>
				<span class="debate-label">{m.relation_add_chip()} « {$addRelationTarget.name} »</span>
				<button
					type="button"
					class="debate-remove"
					aria-label={m.relation_add_remove()}
					onclick={() => addRelationTarget.set(null)}
				>
					×
				</button>
			</div>
		{/if}
		<textarea
			name="prompt"
			rows="1"
			bind:this={promptEl}
			bind:value={prompt}
			onkeydown={handleKeydown}
			placeholder={displayedPlaceholder}
			aria-label="Prompt"
		></textarea>
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

	.genie-cloud {
		position: absolute;
		top: calc(10vh + 20px);
		z-index: 11;
		max-width: 260px;
		padding: 16px 24px;
		background: #fff;
		color: #222;
		border: 3px solid #222;
		border-radius: 50% / 45%;
		font-size: 0.95rem;
		font-weight: 600;
		line-height: 1.3;
		text-align: center;
		box-shadow: 3px 4px 0 rgba(0, 0, 0, 0.25);
		animation: cloud-pop 0.25s ease-out;
		transform-origin: right center;
		pointer-events: none;
	}

	/* Petites bulles qui relient le nuage à la boule (style bande dessinée) */
	.genie-cloud .tail {
		position: absolute;
		background: #fff;
		border: 3px solid #222;
		border-radius: 50%;
	}

	.genie-cloud .tail-1 {
		width: 16px;
		height: 16px;
		right: -22px;
		top: 50%;
	}

	.genie-cloud .tail-2 {
		width: 9px;
		height: 9px;
		right: -36px;
		top: calc(50% + 14px);
	}

	@keyframes cloud-pop {
		from {
			opacity: 0;
			transform: scale(0.6);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	.prompt-container {
		position: absolute;
		bottom: 24px;
		left: 50%;
		transform: translateX(-50%);

		display: flex;
		align-items: flex-end;
		gap: 8px;

		width: min(700px, calc(100% - 32px));
		padding: 8px;

		background: white;
		border: 1px solid #e2e8f0;
		border-radius: 18px;

		box-shadow: 0 8px 30px rgb(0 0 0 / 10%);

		z-index: 20;
	}

	.debate-chip {
		flex: 0 1 auto;
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		max-width: 45%;
		padding: 6px 8px 6px 10px;
		color: #92400e;
		background: #fef3c7;
		border: 1px solid #fcd34d;
		border-radius: 12px;
		font-size: 13px;
		font-weight: 600;
	}

	.add-value-chip {
		color: #065f46;
		background: #d1fae5;
		border-color: #6ee7b7;
	}

	.debate-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.debate-remove {
		flex: 0 0 auto;
		padding: 0 4px;
		color: inherit;
		background: transparent;
		border: none;
		font-size: 18px;
		line-height: 1;
		cursor: pointer;
	}

	textarea[name='prompt'] {
		flex: 1;
		min-width: 0;
		box-sizing: border-box;

		padding: 12px 16px;
		line-height: 20px;
		max-height: 164px; /* ~7 lignes, puis scroll */

		border: none;
		outline: none;
		background: transparent;
		resize: none;
		overflow-y: auto;

		font-family: inherit;
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

	.prompt-container:focus-within {
		border-color: #2563eb;
		box-shadow:
			0 0 0 3px rgb(37 99 235 / 15%),
			0 8px 30px rgb(37 99 235 / 15%);
	}

	#submit:hover {
		background: #1d4ed8;
	}
</style>
