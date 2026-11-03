<script lang="ts">
	import type { ProofData } from '$lib/simulation/Proof';
	import type { RelationData } from '$lib/simulation/Relation';
	import * as m from '$lib/paraglide/messages';
	import ProofList from './ProofList.svelte';
	import ScoreFunction from './ScoreFunction.svelte';

	/** A change made by a relation on the value: the property it comes from, its impact and, when it adds the value, the value. */
	export interface RelationInfluenceEntry {
		from: string;
		to: string;
		impact: number;
		value?: unknown;
		added: boolean;
	}

	export interface ValueInfluence {
		/** Veracity now and its uncertainty, already formatted. */
		veracity: string | null;
		uncertainty: string | null;
		/** True for an evolution: it has no general uncertainty, only the one above and below its function. */
		hideUncertainty?: boolean;
		/** Originality of the relation (for its values) or of the latest proof of the value. */
		originality: string | null;
		/** Impact of the value: the one of its relation, or of its latest proof. */
		impact?: string | null;
		/** Every proof, to find the sub-proofs, and the top-level proofs of this value (newest first). */
		allProofs: (ProofData & { id: string })[];
		proofs: (ProofData & { id: string })[];
		relations: { relation: RelationData; entries: RelationInfluenceEntry[] }[];
		/** The date of the time machine, as a decimal year. */
		year: number;
		/** Veracity, uncertainty, impact and originality as functions of t (expressions). */
		functions?: { veracity?: string; uncertainty?: string; impact?: string; originality?: string };
		/** Existence of the element and color of the value: the evolutions of the proofs are drawn like the value. */
		existence?: unknown;
		accent?: { dark: string; light: string };
		/** Ask the genie for a new proof / a new relation of this value. */
		addProof?: () => void;
		addRelation?: () => void;
	}

	let { info, format }: { info: ValueInfluence; format: (value: unknown) => string } = $props();
</script>

<!-- A score as a card with a gauge from 0 to 100, like the scores of a desired value in the proofs. -->
{#snippet score(key: string, label: string, text: string | null | undefined, fn: string | undefined)}
	{@const value = parseFloat(text?.match(/-?\d+(\.\d+)?/)?.[0] ?? '')}
	<div class="score {key}">
		<dt>{label}</dt>
		<dd>
			<strong>{text ?? '—'}</strong>
			{#if Number.isFinite(value)}
				<span class="gauge" aria-hidden="true">
					<span style:width="{Math.min(100, Math.max(0, value))}%"></span>
				</span>
			{/if}
		</dd>
		{#if fn}<ScoreFunction expression={fn} />{/if}
	</div>
{/snippet}

<details class="value-parameters">
	<summary>
		<span>{m.simulation_value_parameters()}</span>
		{#if info.veracity}
			<span class="summary-score">{m.simulation_veracity_label()} {info.veracity}</span>
		{/if}
	</summary>
	<dl class="value-scores">
		{@render score('veracity', m.simulation_veracity_label(), info.veracity, info.functions?.veracity)}
		{#if !info.hideUncertainty}
			{@render score('uncertainty', m.simulation_uncertainty_label(), info.uncertainty, info.functions?.uncertainty)}
		{/if}
		{#if info.impact}
			{@render score('impact', m.simulation_field_impact(), info.impact, info.functions?.impact)}
		{/if}
		{#if info.originality}
			{@render score('originality', m.simulation_originality_label(), info.originality, info.functions?.originality)}
		{/if}
	</dl>

	<h5>{m.simulation_influence()}</h5>
	<h6>{m.simulation_influence_proofs()}</h6>
	{#if info.proofs.length > 0}
		<ProofList
			proofs={info.allProofs}
			roots={info.proofs}
			{format}
			year={info.year}
			existence={info.existence}
			accent={info.accent}
		/>
	{:else}
		<p class="influence-empty">—</p>
	{/if}
	<button type="button" class="influence-add" onclick={info.addProof}>+ {m.proof_add()}</button>

	{#if info.addRelation}
		<h6>{m.simulation_influence_relations()}</h6>
		{#if info.relations.length > 0}
			<ul class="influence-list">
				{#each info.relations as { relation, entries }}
					<li>
						<strong>{format(relation.name)}</strong>
						<p>{format(relation.description)}</p>
						{#each entries as entry}
							<div class="relation-entry">
								<span class="relation-kind">
									{entry.added ? m.simulation_field_new_value() : m.simulation_field_value_to_modify()}
								</span>
								<span>{entry.from} → {entry.to}</span>
								{#if entry.added}
									<span class="relation-value">{format(entry.value)}</span>
								{/if}
								<span class="relation-impact">
									{m.simulation_field_impact()}: <strong>{format(entry.impact)}</strong>
								</span>
							</div>
						{/each}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="influence-empty">—</p>
		{/if}

		<button type="button" class="influence-add" onclick={info.addRelation}>+ {m.relation_add()}</button>
	{/if}
</details>

<style>
	.value-parameters {
		grid-column: 1 / -1;
		margin-top: 8px;
		font-size: 12px;
		white-space: normal;
	}

	summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 5px 10px;
		color: #7dd3fc;
		background: transparent;
		border: 1px solid rgb(125 211 252 / 40%);
		border-radius: 999px;
		font-size: 11px;
		font-weight: 600;
		cursor: pointer;
		list-style: none;
		user-select: none;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary::before {
		content: '▸';
		margin-right: 6px;
		transition: transform 0.15s;
	}

	.value-parameters[open] > summary::before {
		transform: rotate(90deg);
	}

	summary > span:first-child {
		flex: 1;
	}

	summary:hover {
		background: rgb(125 211 252 / 12%);
	}

	summary:focus-visible {
		outline: 2px solid #7dd3fc;
		outline-offset: 2px;
	}

	.summary-score {
		color: #94a3b8;
		font-variant-numeric: tabular-nums;
		font-weight: 400;
	}

	.value-parameters[open] summary {
		margin-bottom: 6px;
	}

	.value-parameters[open] {
		padding: 8px 10px;
		background: rgb(148 163 184 / 8%);
		border-radius: 6px;
	}

	.value-scores {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
		gap: 6px;
		margin: 0 0 8px;
	}

	.score {
		--accent: #7dd3fc;
		padding: 6px 8px;
		border: 1px solid rgb(148 163 184 / 18%);
		border-radius: 6px;
		background: rgb(15 23 42 / 30%);
	}

	/* A score whose function is open takes the whole row. */
	.score:has(:global(.score-chart)) {
		grid-column: 1 / -1;
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

	h5,
	h6 {
		margin: 8px 0 4px;
		color: #7dd3fc;
		font-size: 11px;
	}

	h6 {
		color: #94a3b8;
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.influence-empty {
		margin: 0;
		color: #94a3b8;
	}

	.influence-add {
		display: block;
		margin: 6px 0 10px;
		padding: 3px 10px;
		color: inherit;
		background: transparent;
		border: 1px dashed currentColor;
		border-radius: 8px;
		font-size: 12px;
		opacity: 0.8;
		cursor: pointer;
	}

	.influence-add:hover {
		opacity: 1;
	}

	.influence-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.influence-list > li {
		padding: 6px 0;
		border-bottom: 1px solid rgb(148 163 184 / 14%);
		overflow-wrap: anywhere;
	}

	.influence-list > li:last-child {
		border-bottom: 0;
	}

	.influence-list p {
		margin: 2px 0 6px;
		color: #cbd5e1;
		white-space: pre-wrap;
	}

	.relation-entry {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 3px 8px;
		margin-bottom: 6px;
		padding: 6px 8px;
		border-left: 3px solid #a78bfa;
		border-radius: 4px;
		background: rgb(167 139 250 / 8%);
	}

	.relation-kind {
		grid-column: 1 / -1;
		color: #94a3b8;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.relation-value {
		grid-column: 1 / -1;
		font-weight: 600;
	}

	.relation-impact {
		color: #94a3b8;
		font-size: 11px;
		white-space: nowrap;
	}

	:global(body.light) .score strong {
		color: #0f172a;
	}

	:global(body.light) .score {
		background: rgb(255 255 255 / 60%);
	}

	:global(body.light) .influence-list p {
		color: #475569;
	}

	:global(body.light) summary {
		color: #087e8b;
		border-color: rgb(8 126 139 / 40%);
	}

	:global(body.light) .score dt,
	:global(body.light) h6,
	:global(body.light) .influence-empty,
	:global(body.light) .relation-impact,
	:global(body.light) .relation-kind {
		color: #64748b;
	}

	:global(body.light) h5 {
		color: #087e8b;
	}

	:global(body.light) .relation-entry {
		border-left-color: #7c3aed;
		background: rgb(124 58 237 / 8%);
	}
</style>
