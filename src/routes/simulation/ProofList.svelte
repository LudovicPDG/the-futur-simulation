<script lang="ts">
	import type { ProofData } from '$lib/simulation/Proof';
	import { parseEvolutionValue, type EvolutionValue } from '$lib/simulation/event/EvolutionFunction';
	import { addProofTarget, addRelationTarget, addValueTarget, debateTarget } from '$lib/stores/debate';
	import * as m from '$lib/paraglide/messages';
	import EvolutionChart from './EvolutionChart.svelte';
	import ProofList from './ProofList.svelte';

	const PAGE_SIZE = 5;

	type StoredProof = ProofData & { id: string };

	let {
		proofs,
		roots = [],
		parentId = null,
		format,
		existence,
		accent
	}: {
		/** Every proof, to find the sub-proofs. */
		proofs: StoredProof[];
		/** The top-level proofs of the value (newest first), listed when there is no parent. */
		roots?: StoredProof[];
		parentId?: string | null;
		format: (value: unknown) => string;
		/** Existence of the element and color of the value: an evolution of a proof is drawn like the value. */
		existence?: unknown;
		accent?: { dark: string; light: string };
	} = $props();

	let visibleCount = $state(PAGE_SIZE);
	let expanded = $state<Record<string, boolean>>({});
	let paramsShown = $state<Record<string, boolean>>({});

	const siblings = $derived(
		parentId === null ? roots : proofs.filter((proof) => proof.parent_proof_id === parentId)
	);
	const visible = $derived(siblings.slice(0, visibleCount));
	// The founding proof is the oldest top-level proof of the value (proofs come newest first): it was made when creating the element.
	const foundingId = $derived(parentId === null ? siblings.at(-1)?.id : undefined);

	function subProofCount(proofId: string) {
		return proofs.filter((proof) => proof.parent_proof_id === proofId).length;
	}

	const URL_PATTERN = /(https?:\/\/[^\s<>"')\]]+|www\.[^\s<>"')\]]+)/gi;

	/** Splits a source string into plain text and clickable link parts. */
	function splitLinks(source: string): { text: string; href?: string }[] {
		return source
			.split(URL_PATTERN)
			.filter(Boolean)
			.map((text) => {
				if (!/^(https?:\/\/|www\.)/i.test(text)) return { text };
				const clean = text.replace(/[.,;:!?]+$/, '');
				const href = /^www\./i.test(clean) ? `https://${clean}` : clean;
				return { text: clean, href };
			});
	}

	/** The text fields a desired value can give, in display order; the methods get the accent of their parameter. */
	const TEXT_FIELDS: [string, () => string, string?][] = [
		['value', m.simulation_field_value],
		['name', m.simulation_field_name],
		['description', m.simulation_field_description],
		['verification_method', m.simulation_field_verification_method, 'verification'],
		['falsifiability_method', m.simulation_field_falsifiability_method, 'falsification']
	];

	/** The scores a desired value gives, each shown as a gauge from 0 to 100. */
	const SCORE_FIELDS: [string, () => string, (value: number) => string][] = [
		['veracity', m.proof_veracity, (value) => `${Math.round(value)}%`],
		['uncertainty', m.simulation_evolution_uncertainty, (value) => `±${Math.round(value)}%`],
		['impact', m.simulation_field_impact, (value) => `${Math.round(value)}`],
		['originality', m.simulation_field_originality, (value) => `${Math.round(value)}%`]
	];

	type ScoreView = { key: string; label: string; value: number; text: string; changed: boolean };

	/** The own scores of the proof, shown like the scores of its desired value. */
	function proofScores(proof: StoredProof): ScoreView[] {
		return SCORE_FIELDS.flatMap(([key, label, text]) => {
			const value = Number(proof[key as keyof StoredProof]);
			if (!Number.isFinite(value)) return [];
			return [{ key, label: label(), value, text: text(value), changed: false }];
		});
	}

	type DesiredView = {
		/** Whether the fields are compared with a debated proof (only for a sub-proof). */
		compared: boolean;
		texts: {
			key: string;
			label: string;
			text: string;
			accent?: string;
			changed: boolean;
			/** The content of the value when it is an evolution: drawn instead of its text. */
			evolution: EvolutionValue | null;
		}[];
		sources: { list: string[]; changed: boolean } | null;
		scores: ScoreView[];
	};

	/**
	 * The desired value of the proof, split into texts, sources and scores. The fields the proof really changed (the
	 * only ones that vote) stand out; the founding proof and the original proof copy give every field, so none does.
	 */
	function desiredView(proof: StoredProof): DesiredView {
		const desired = proof.desired_value as Record<string, unknown>;
		const compared = proof.id !== foundingId && !proof.original_proof_id && !!proof.edited_fields;
		const changed = (key: string) => compared && !!proof.edited_fields?.includes(key);

		const texts = TEXT_FIELDS.flatMap(([key, label, accent]) => {
			const value = desired[key];
			if (value === null || value === undefined) return [];
			const evolution = key === 'value' ? parseEvolutionValue(value) : null;
			return [{ key, label: label(), text: format(value), accent, changed: changed(key), evolution }];
		});
		const source = desired.source;
		const sources = Array.isArray(source) ? { list: source.map(String), changed: changed('source') } : null;
		const scores = SCORE_FIELDS.flatMap(([key, label, text]) => {
			const value = Number(desired[key]);
			if (desired[key] === null || !Number.isFinite(value)) return [];
			return [{ key, label: label(), value, text: text(value), changed: changed(key) }];
		});
		return { compared, texts, sources, scores };
	}

	function debate(proof: StoredProof) {
		addValueTarget.set(null);
		addProofTarget.set(null);
		addRelationTarget.set(null);
		debateTarget.set({ id: proof.id, name: format(proof.name) });
	}
</script>

{#snippet scoreGrid(scores: ScoreView[])}
	{#if scores.length > 0}
		<dl class="desired-scores">
			{#each scores as score (score.key)}
				<div class="score {score.key}" class:changed={score.changed}>
					<dt>{score.label}</dt>
					<dd>
						<strong>{score.text}</strong>
						<span class="gauge" aria-hidden="true">
							<span style:width="{Math.min(100, Math.max(0, score.value))}%"></span>
						</span>
					</dd>
				</div>
			{/each}
		</dl>
	{/if}
{/snippet}

<ul class="proof-list" class:nested={parentId !== null}>
	{#each visible as proof (proof.id)}
		{@const count = subProofCount(proof.id)}
		{@const desired = desiredView(proof)}
		<li class="proof-item">
			<h4>
				{format(proof.name)}
				{#if proof.id === foundingId}
					<span class="founding-badge" title={m.proof_founding_hint()}>✦ {m.proof_founding()}</span>
				{:else if proof.original_proof_id}
					<span class="founding-badge" title={m.proof_original_hint()}>✦ {m.proof_original()}</span>
				{/if}
			</h4>
			<p class="proof-description">{format(proof.description)}</p>
			{#if desired.texts.length > 0 || desired.sources || desired.scores.length > 0}
				<section class="desired-value">
					<span class="desired-label">{m.proof_desired_value()}</span>
					{#each desired.texts as field (field.key)}
						<div
							class="desired-field {field.accent ?? ''}"
							class:main={field.key === 'value' || field.key === 'name'}
							class:kept={desired.compared && !field.changed}
						>
							<span class="field-label">
								{field.label}
								{#if field.changed}
									<span class="changed-tag" title={m.proof_edit_changed_hint()}>{m.proof_edit_changed()}</span>
								{/if}
							</span>
							{#if field.evolution && proof.value_name === 'existence'}
								<!-- A proof of the existence: drawn like the existence itself, as a percentage on its whole axis. -->
								<EvolutionChart
									evolution={field.evolution.evolution}
									unit={field.evolution.unit}
									existence={field.evolution.evolution}
									clipToExistence={false}
									bounds={[0, 100]}
								/>
							{:else if field.evolution}
								<EvolutionChart
									evolution={field.evolution.evolution}
									unit={field.evolution.unit}
									{existence}
									{accent}
								/>
							{:else}
								<span class="field-text">{field.text}</span>
							{/if}
						</div>
					{/each}
					{#if desired.sources}
						<div class="desired-field" class:kept={desired.compared && !desired.sources.changed}>
							<span class="field-label">
								{m.simulation_field_source()}
								{#if desired.sources.changed}
									<span class="changed-tag" title={m.proof_edit_changed_hint()}>{m.proof_edit_changed()}</span>
								{/if}
							</span>
							{#if desired.sources.list.length > 0}
								<ul class="sources">
									{#each desired.sources.list as source}
										<li>
											{#each splitLinks(source) as part}
												{#if part.href}
													<a href={part.href} target="_blank" rel="noopener noreferrer">{part.text}</a>
												{:else}
													{part.text}
												{/if}
											{/each}
										</li>
									{/each}
								</ul>
							{:else}
								<span class="field-text">—</span>
							{/if}
						</div>
					{/if}
					{#if desired.scores.length > 0}
						{@render scoreGrid(desired.scores)}
					{/if}
				</section>
			{/if}
			<div class="proof-actions">
				<button
					type="button"
					class="proof-button"
					aria-expanded={!!paramsShown[proof.id]}
					onclick={() => (paramsShown[proof.id] = !paramsShown[proof.id])}
				>
					{paramsShown[proof.id] ? m.proof_hide_params() : m.proof_show_params()}
				</button>
				<!-- The original proof is only a copy of the debated proof: it is not debated itself. -->
				{#if !proof.original_proof_id}
					<button
						type="button"
						class="proof-button"
						aria-expanded={!!expanded[proof.id]}
						onclick={() => (expanded[proof.id] = !expanded[proof.id])}
					>
						{expanded[proof.id] ? m.proof_hide_sub() : m.proof_show_sub()} ({count})
					</button>
					<button
						type="button"
						class="proof-button debate"
						class:active={$debateTarget?.id === proof.id}
						onclick={() => debate(proof)}
					>
						{m.proof_debate()}
					</button>
				{/if}
			</div>
			{#if paramsShown[proof.id]}
				<div class="proof-params">
					<dl>
						<div class="param-row verification">
							<dt>{m.simulation_field_verification_method()}</dt>
							<dd>{format(proof.verification_method)}</dd>
						</div>
						<div class="param-row falsification">
							<dt>{m.simulation_field_falsifiability_method()}</dt>
							<dd>{format(proof.falsifiability_method)}</dd>
						</div>
						<div class="param-row">
							<dt>{m.simulation_field_source()}</dt>
							<dd>
								{#if proof.source?.length}
									<ul class="sources">
										{#each proof.source as source}
											<li>
												{#each splitLinks(source) as part}
													{#if part.href}
														<a href={part.href} target="_blank" rel="noopener noreferrer">{part.text}</a>
													{:else}
														{part.text}
													{/if}
												{/each}
											</li>
										{/each}
									</ul>
								{:else}
									—
								{/if}
							</dd>
						</div>
					</dl>
					{@render scoreGrid(proofScores(proof))}
				</div>
			{/if}
			{#if expanded[proof.id]}
				{#if count > 0}
					<ProofList {proofs} parentId={proof.id} {format} {existence} {accent} />
				{:else}
					<p class="proof-empty">{m.proof_no_sub()}</p>
				{/if}
			{/if}
		</li>
	{/each}
</ul>
{#if siblings.length > visibleCount}
	<button type="button" class="proof-button more" onclick={() => (visibleCount += PAGE_SIZE)}>
		{m.proof_show_more()}
	</button>
{/if}

<style>
	.proof-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.proof-list.nested {
		margin: 8px 0 4px 6px;
		padding-left: 10px;
		border-left: 2px solid rgb(148 163 184 / 30%);
	}

	.proof-item {
		padding: 10px 0;
		border-bottom: 1px solid rgb(148 163 184 / 14%);
	}

	.proof-item:last-child {
		border-bottom: 0;
	}

	h4 {
		margin: 0 0 4px;
		font-size: 13px;
		line-height: 1.35;
		overflow-wrap: anywhere;
	}

	.founding-badge {
		display: inline-block;
		margin-left: 6px;
		padding: 1px 8px;
		color: #fbbf24;
		background: rgb(251 191 36 / 12%);
		border: 1px solid rgb(251 191 36 / 45%);
		border-radius: 999px;
		font-size: 10px;
		font-weight: 700;
		vertical-align: middle;
		white-space: nowrap;
	}

	:global(body.light) .founding-badge {
		color: #a16207;
		border-color: rgb(161 98 7 / 45%);
	}

	.proof-description {
		margin: 0 0 8px;
		color: #cbd5e1;
		font-size: 12px;
		line-height: 1.5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.desired-value {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 0 0 8px;
		padding: 8px 10px 10px;
		border-left: 3px solid #7dd3fc;
		border-radius: 4px;
		background: rgb(125 211 252 / 8%);
		overflow-wrap: anywhere;
	}

	.desired-label {
		color: #94a3b8;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.desired-field {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.desired-field.verification,
	.desired-field.falsification {
		padding: 4px 8px;
		border-left: 2px solid var(--accent);
		border-radius: 3px;
		background: color-mix(in srgb, var(--accent) 8%, transparent);
	}

	.desired-field.verification {
		--accent: #22c55e;
	}

	.desired-field.falsification {
		--accent: #ef4444;
	}

	/* For a sub-proof, the fields it keeps from the debated proof step back. */
	.desired-field.kept {
		opacity: 0.55;
	}

	.field-label {
		display: flex;
		align-items: center;
		gap: 6px;
		color: #94a3b8;
		font-size: 10px;
		font-weight: 600;
	}

	.desired-field.verification .field-label,
	.desired-field.falsification .field-label {
		color: var(--accent);
	}

	.field-text {
		color: #e2e8f0;
		font-size: 12px;
		line-height: 1.5;
		white-space: pre-wrap;
	}

	.desired-field.main .field-text {
		color: #f1f5f9;
		font-size: 13px;
		font-weight: 600;
	}

	.changed-tag {
		padding: 0 6px;
		color: #fbbf24;
		background: rgb(251 191 36 / 12%);
		border: 1px solid rgb(251 191 36 / 40%);
		border-radius: 999px;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.desired-scores {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
		gap: 6px;
		margin: 2px 0 0;
	}

	.score {
		--accent: #7dd3fc;
		padding: 6px 8px;
		border: 1px solid rgb(148 163 184 / 18%);
		border-radius: 6px;
		background: rgb(15 23 42 / 30%);
	}

	.score.veracity {
		--accent: #22c55e;
	}

	.score.uncertainty {
		--accent: #f59e0b;
	}

	.score.impact {
		--accent: #a78bfa;
	}

	.score.originality {
		--accent: #38bdf8;
	}

	.score.changed {
		border-color: rgb(251 191 36 / 55%);
	}

	.score dt {
		color: #94a3b8;
		font-size: 10px;
		font-weight: 600;
	}

	.score dd {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin: 2px 0 0;
	}

	.score strong {
		color: #f1f5f9;
		font-size: 15px;
		font-variant-numeric: tabular-nums;
	}

	.gauge {
		height: 4px;
		overflow: hidden;
		border-radius: 999px;
		background: rgb(148 163 184 / 20%);
	}

	.gauge span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--accent);
	}

	:global(body.light) .desired-value {
		border-left-color: #087e8b;
		background: rgb(8 126 139 / 8%);
	}

	:global(body.light) .desired-label,
	:global(body.light) .field-label,
	:global(body.light) .score dt {
		color: #64748b;
	}

	:global(body.light) .field-text {
		color: #334155;
	}

	:global(body.light) .desired-field.main .field-text,
	:global(body.light) .score strong {
		color: #0f172a;
	}

	:global(body.light) .desired-field.verification {
		--accent: #16a34a;
	}

	:global(body.light) .desired-field.falsification {
		--accent: #dc2626;
	}

	:global(body.light) .desired-field.verification .field-label,
	:global(body.light) .desired-field.falsification .field-label {
		color: var(--accent);
	}

	:global(body.light) .changed-tag {
		color: #a16207;
		border-color: rgb(161 98 7 / 45%);
	}

	:global(body.light) .score {
		background: rgb(255 255 255 / 60%);
	}

	.proof-params {
		margin: 8px 0 0;
		padding: 8px 10px;
		background: rgb(148 163 184 / 8%);
		border-radius: 6px;
	}

	.proof-params > dl {
		margin: 0;
	}

	.proof-params > .desired-scores {
		margin-top: 8px;
	}

	.param-row {
		padding: 6px 0;
		border-bottom: 1px solid rgb(148 163 184 / 14%);
	}

	.param-row:last-child {
		border-bottom: 0;
	}

	.param-row dt {
		margin-bottom: 2px;
		color: #94a3b8;
		font-size: 11px;
		font-weight: 600;
	}

	.param-row dd {
		margin: 0;
		font-size: 12px;
		line-height: 1.5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.param-row.impossibility dt,
	.param-row.impossibility dd {
		color: #f87171;
	}

	.param-row.verification,
	.param-row.falsification {
		margin: 4px 0;
		padding: 6px 10px;
		border-left: 3px solid var(--accent);
		border-bottom: 0;
		border-radius: 4px;
		background: color-mix(in srgb, var(--accent) 10%, transparent);
	}

	.param-row.verification {
		--accent: #22c55e;
	}

	.param-row.falsification {
		--accent: #ef4444;
	}

	.param-row.verification dt,
	.param-row.falsification dt {
		color: var(--accent);
	}

	.sources {
		margin: 0;
		padding-left: 16px;
		white-space: normal;
	}

	.sources a {
		color: #7dd3fc;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.sources a:hover {
		color: #bae6fd;
	}

	:global(body.light) .param-row.verification {
		--accent: #16a34a;
	}

	:global(body.light) .param-row.falsification {
		--accent: #dc2626;
	}

	:global(body.light) .param-row.verification dt,
	:global(body.light) .param-row.falsification dt {
		color: var(--accent);
	}

	:global(body.light) .sources a {
		color: #087e8b;
	}

	:global(body.light) .param-row dt {
		color: #64748b;
	}

	:global(body.light) .param-row.impossibility dt,
	:global(body.light) .param-row.impossibility dd {
		color: #dc2626;
	}

	.proof-empty {
		margin: 8px 0 0;
		color: #94a3b8;
		font-size: 12px;
	}

	.proof-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.proof-button {
		padding: 4px 10px;
		color: #7dd3fc;
		background: transparent;
		border: 1px solid rgb(125 211 252 / 40%);
		border-radius: 999px;
		font-size: 11px;
		font-weight: 600;
		cursor: pointer;
	}

	.proof-button:hover {
		background: rgb(125 211 252 / 12%);
	}

	.proof-button.debate {
		color: #fbbf24;
		border-color: rgb(251 191 36 / 45%);
	}

	.proof-button.debate:hover,
	.proof-button.debate.active {
		background: rgb(251 191 36 / 14%);
	}

	.proof-button.more {
		display: block;
		margin: 8px auto 0;
	}

	:global(body.light) .proof-description,
	:global(body.light) .proof-empty {
		color: #475569;
	}

	:global(body.light) .proof-button {
		color: #087e8b;
		border-color: rgb(8 126 139 / 40%);
	}

	:global(body.light) .proof-button.debate {
		color: #a16207;
		border-color: rgb(161 98 7 / 45%);
	}
</style>
