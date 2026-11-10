<script lang="ts">
	import type { TimeRange } from '$lib/simulation/event/EvolutionFunction';
	import * as m from '$lib/paraglide/messages';
	import EvolutionChart from './EvolutionChart.svelte';

	let {
		expression,
		range,
		threshold,
		fit = false
	}: {
		/** True for a value that is not from 0 to 100 (the impact of a relation): the axis fits the curve. */
		fit?: boolean;
		expression: string;
		/** Under this value the score is not counted: drawn in red. */
		threshold?: number;
		/** The period of the score that a proof really changes: only this portion stands out. */
		range?: TimeRange;
	} = $props();

	let shown = $state(false);
	// A score is a function of t from 0 to 100 without uncertainty: drawn on its whole axis.
	const evolution = $derived([{ function: expression, weight: 1, uncertainty_down: '0', uncertainty_up: '0' }]);
</script>

<div class="score-function">
	<button type="button" class="score-toggle" aria-expanded={shown} onclick={() => (shown = !shown)}>
		{shown ? m.simulation_evolution_hide_function() : m.simulation_evolution_see_function()}
	</button>
	{#if shown}
		<div class="score-chart">
			<EvolutionChart
				{evolution}
				unit={fit ? '' : '%'}
				clipToExistence={false}
				showExistence={false}
				showUncertainty={false}
				bounds={fit ? undefined : [0, 100]}
				fitCurve={fit}
					{threshold}
				edited={range ? { function: true, above: false, below: false } : undefined}
				ranges={range ? { function: range } : undefined}
			/>
		</div>
	{/if}
</div>

<style>
	.score-function {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
		margin-top: 4px;
	}

	.score-toggle {
		padding: 2px 8px;
		background: color-mix(in srgb, #34d399 12%, transparent);
		border: 1px solid color-mix(in srgb, #34d399 50%, transparent);
		border-radius: 6px;
		color: #34d399;
		font-size: 10px;
		font-weight: 700;
		cursor: pointer;
	}

	.score-toggle:hover {
		background: color-mix(in srgb, #34d399 24%, transparent);
	}

	:global(body.light) .score-toggle {
		color: #047857;
		border-color: color-mix(in srgb, #047857 50%, transparent);
	}

	.score-chart {
		align-self: stretch;
		min-width: 0;
	}
</style>
