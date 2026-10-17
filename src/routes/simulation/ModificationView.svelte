<script lang="ts">
	import type { ModificationData } from '$lib/simulation/Modification';
	import * as m from '$lib/paraglide/messages';
	import {
		parseEvolutionValue,
		buildEvolutionFunction,
		buildEvolutionUncertainty,
		type EvolutionValue
	} from '$lib/simulation/event/EvolutionFunction';

	let {
		modification,
		format
	}: { modification?: ModificationData | null; format: (value: unknown) => string } = $props();

	// Veracity and uncertainty of a value now (the date as a decimal year)
	function scoresNow({ evolution }: EvolutionValue) {
		const year = new Date().getUTCFullYear();
		const t = year + (Date.now() - Date.UTC(year, 0, 1)) / 31_557_600_000;
		const veracity = buildEvolutionFunction(evolution)(t);
		if (!Number.isFinite(veracity)) return null;
		const uncertainty = buildEvolutionUncertainty(evolution)(t);
		return {
			veracity: `${Math.round(Math.min(100, Math.max(0, veracity)))}%`,
			uncertainty: `±${Math.round((Number.isFinite(uncertainty) ? uncertainty : 0) * 10) / 10}%`
		};
	}

	const groups = $derived(
		[
			{ label: m.simulation_field_value_to_modify(), entries: modification?.value_to_modify ?? [] },
			{ label: m.simulation_field_new_value(), entries: modification?.new_value ?? [] }
		].filter((group) => group.entries.length > 0)
	);
</script>

{#each groups as group}
	<div class="modification-group">
		<span class="modification-label">{group.label}</span>
		{#each group.entries as entry}
			{@const veracity = parseEvolutionValue(entry.veracity)}
			{@const now = veracity ? scoresNow(veracity) : null}
			<div class="modification-entry">
				<span class="modification-name">{format(entry.name)}</span>
				<span class="modification-value">{format(entry.value)}</span>
				<details class="modification-parameters">
					<summary>
						<span>{m.simulation_value_parameters()}</span>
						{#if now}<span class="summary-score">{m.simulation_veracity_label()} {now.veracity}</span>{/if}
					</summary>
					<dl class="modification-scores">
						{#if now}
							<div><dt>{m.simulation_veracity_label()}</dt><dd>{now.veracity}</dd></div>
							<div><dt>{m.simulation_uncertainty_label()}</dt><dd>{now.uncertainty}</dd></div>
						{/if}
						<div><dt>{m.simulation_field_impact()}</dt><dd>{format(entry.impact)}</dd></div>
					</dl>
				</details>
			</div>
		{/each}
	</div>
{:else}
	<span>—</span>
{/each}

<style>
	.modification-group {
		margin-bottom: 0.6rem;
	}
	.modification-label {
		display: block;
		margin-bottom: 4px;
		color: #7dd3fc;
		font-size: 0.8em;
		font-weight: 700;
	}
	.modification-entry {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 3px 8px;
		margin-bottom: 6px;
		padding: 6px 8px;
		border-left: 3px solid #7dd3fc;
		border-radius: 4px;
		background: rgb(125 211 252 / 8%);
		overflow-wrap: anywhere;
	}
	.modification-parameters {
		grid-column: 1 / -1;
		margin-top: 4px;
	}
	.modification-parameters summary {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 10px;
		color: #7dd3fc;
		border: 1px solid rgb(125 211 252 / 40%);
		border-radius: 999px;
		font-size: 11px;
		font-weight: 600;
		cursor: pointer;
		list-style: none;
		user-select: none;
	}
	.modification-parameters summary::-webkit-details-marker {
		display: none;
	}
	.modification-parameters summary::before {
		content: '▸';
		transition: transform 0.15s;
	}
	.modification-parameters[open] > summary::before {
		transform: rotate(90deg);
	}
	.modification-parameters summary > span:first-child {
		flex: 1;
	}
	.modification-parameters summary:hover {
		background: rgb(125 211 252 / 12%);
	}
	.summary-score {
		color: #94a3b8;
		font-weight: 400;
	}
	.modification-scores {
		display: flex;
		gap: 16px;
		margin: 6px 0;
	}
	.modification-scores dt {
		color: #94a3b8;
		font-size: 10px;
		font-weight: 600;
	}
	.modification-scores dd {
		margin: 0;
		color: #f1f5f9;
		font-size: 12px;
	}
	:global(body.light) .modification-parameters summary {
		color: #087e8b;
		border-color: rgb(8 126 139 / 40%);
	}
	:global(body.light) .modification-scores dd {
		color: #0f172a;
	}
	.modification-name {
		grid-column: 1 / -1;
		color: #94a3b8;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.modification-value {
		color: #f1f5f9;
		font-size: 13px;
		font-weight: 600;
		white-space: pre-wrap;
	}
	:global(body.light) .modification-label {
		color: #087e8b;
	}
	:global(body.light) .modification-entry {
		border-left-color: #087e8b;
		background: rgb(8 126 139 / 8%);
	}
	:global(body.light) .modification-name {
		color: #64748b;
	}
	:global(body.light) .modification-value {
		color: #0f172a;
	}
</style>
