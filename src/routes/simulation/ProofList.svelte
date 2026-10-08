<script lang="ts">
	import type { ProofData } from '$lib/simulation/Proof';
	import { debateTarget } from '$lib/stores/debate';
	import * as m from '$lib/paraglide/messages';
	import ProofList from './ProofList.svelte';
	import ProbabilityDistributionChart from './ProbabilityDistributionChart.svelte';

	const PAGE_SIZE = 5;

	type StoredProof = ProofData & { id: string };

	let {
		proofs,
		factId,
		parentId = null,
		format
	}: {
		proofs: StoredProof[];
		factId: string;
		parentId?: string | null;
		format: (value: unknown) => string;
	} = $props();

	let visibleCount = $state(PAGE_SIZE);
	let expanded = $state<Record<string, boolean>>({});
	let paramsShown = $state<Record<string, boolean>>({});

	const siblings = $derived(
		proofs.filter((proof) => proof.fact_id === factId && (proof.parent_proof_id ?? null) === parentId)
	);
	const visible = $derived(siblings.slice(0, visibleCount));

	function subProofCount(proofId: string) {
		return proofs.filter((proof) => proof.parent_proof_id === proofId).length;
	}

	function debate(proof: StoredProof) {
		debateTarget.set({ id: proof.id, name: format(proof.name) });
	}
</script>

<ul class="proof-list" class:nested={parentId !== null}>
	{#each visible as proof (proof.id)}
		{@const count = subProofCount(proof.id)}
		<li class="proof-item">
			<h4>{format(proof.name)}</h4>
			<p class="proof-description">{format(proof.description)}</p>
			<div class="proof-actions">
				<button
					type="button"
					class="proof-button"
					aria-expanded={!!paramsShown[proof.id]}
					onclick={() => (paramsShown[proof.id] = !paramsShown[proof.id])}
				>
					{paramsShown[proof.id] ? m.proof_hide_params() : m.proof_show_params()}
				</button>
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
			</div>
			{#if paramsShown[proof.id]}
				<dl class="proof-params">
					<div class="param-row">
						<dt>{m.simulation_field_new_value()}</dt>
						<dd>{format(proof.new_value)}</dd>
					</div>
					<div class="param-row">
						<dt>{m.simulation_field_verification_method()}</dt>
						<dd>{format(proof.verification_method)}</dd>
					</div>
					<div class="param-row">
						<dt>{m.simulation_field_falsifiability_method()}</dt>
						<dd>{format(proof.falsifiability_method)}</dd>
					</div>
					<div class="param-row">
						<dt>{m.simulation_field_source()}</dt>
						<dd>
							{#if proof.source?.length}
								<ul class="sources">
									{#each proof.source as source}
										<li>{source}</li>
									{/each}
								</ul>
							{:else}
								—
							{/if}
						</dd>
					</div>
					<div class="param-row">
						<dt>{m.simulation_field_originality()}</dt>
						<dd>{format(proof.originality)}</dd>
					</div>
					<div class="param-row">
						<dt>{m.simulation_field_probability_distribution()}</dt>
						<dd>
							<ProbabilityDistributionChart
								distribution={proof.probability_distribution}
								impossibility={proof.impossibility ?? 0}
							/>
						</dd>
					</div>
					<div class="param-row impossibility">
						<dt>{m.simulation_field_impossibility()}</dt>
						<dd>{format(proof.impossibility)}</dd>
					</div>
				</dl>
			{/if}
			{#if expanded[proof.id]}
				{#if count > 0}
					<ProofList {proofs} {factId} parentId={proof.id} {format} />
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

	.proof-description {
		margin: 0 0 8px;
		color: #cbd5e1;
		font-size: 12px;
		line-height: 1.5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.proof-params {
		margin: 8px 0 0;
		padding: 8px 10px;
		background: rgb(148 163 184 / 8%);
		border-radius: 6px;
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

	.sources {
		margin: 0;
		padding-left: 16px;
		white-space: normal;
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
