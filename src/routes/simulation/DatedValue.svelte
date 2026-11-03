<script lang="ts">
	import {
		buildEvolutionFunction,
		buildEvolutionUncertainty,
		parseEvolutionFunction,
		type TimeRange
	} from '$lib/simulation/event/EvolutionFunction';
	import * as m from '$lib/paraglide/messages';
	import EvolutionChart from './EvolutionChart.svelte';
	import { getLocale } from '$lib/paraglide/runtime';

	let {
		evolution,
		unit = '',
		year,
		existence: existenceEvolution,
		bounds,
		accent,
		edited,
		ranges
	}: {
		evolution?: unknown;
		unit?: string;
		/** The date of the time machine, as a decimal year */
		year: number;
		/** Probability that the fact exists over time: the value only exists while it is over 50% */
		existence?: unknown;
		/** Fixed bounds of the value (a probability goes from 0 to 100) */
		bounds?: [number, number];
		/** Color of the value (a character's resource or satisfaction) */
		accent?: { dark: string; light: string };
		/** The parts a proof changes (the function, the uncertainty above and below): the others are in the shadow */
		edited?: { function: boolean; above: boolean; below: boolean };
		/** The period of each changed part that the proof really changes: only this portion stands out */
		ranges?: { function?: TimeRange; above?: TimeRange; below?: TimeRange };
	} = $props();

	const components = $derived(parseEvolutionFunction(evolution));
	const existenceComponents = $derived(parseEvolutionFunction(existenceEvolution));
	const exists = $derived(!existenceComponents || !(buildEvolutionFunction(existenceComponents)(year) < 50));
	const value = $derived(components ? buildEvolutionFunction(components)(year) : Number.NaN);
	const uncertainty = $derived.by(() => {
		const { down, up } = components ? buildEvolutionUncertainty(components)(year) : { down: 0, up: 0 };
		// A value with fixed bounds has no uncertainty beyond them.
		if (!bounds) return { down, up };
		return {
			down: Math.min(down, Math.max(0, value - bounds[0])),
			up: Math.min(up, Math.max(0, bounds[1] - value))
		};
	});
	const formatter = $derived(new Intl.NumberFormat(getLocale(), { maximumSignificantDigits: 4 }));

	let functionShown = $state(false);
</script>

<div class="dated-block" style:--accent={accent?.dark} style:--accent-light={accent?.light}>
<div class="dated-value">
	{#if !Number.isFinite(value)}
		<span class="message error">{m.simulation_evolution_invalid()}</span>
	{:else if !exists}
		<span class="message">{m.simulation_evolution_not_at_date()}</span>
	{:else}
		<span class="amount" class:shadow={edited && !edited.function}>{formatter.format(value)} {unit}</span>
		<span class:shadow={edited && !edited.above}>
			{m.simulation_evolution_uncertainty_above()} :
			<span class="spread">+{formatter.format(uncertainty.up)} {unit}</span>
		</span>
		<span class:shadow={edited && !edited.below}>
			{m.simulation_evolution_uncertainty_below()} :
			<span class="spread">−{formatter.format(uncertainty.down)} {unit}</span>
		</span>
	{/if}
</div>

{#if components}
	<button
		type="button"
		class="function-toggle"
		aria-expanded={functionShown}
		onclick={() => (functionShown = !functionShown)}
	>
		{functionShown ? m.simulation_evolution_hide_function() : m.simulation_evolution_see_function()}
	</button>
	{#if functionShown}
		<div class="function-chart">
			<!-- A value with fixed bounds is an existence: drawn on its whole axis, like the existence itself. -->
			<EvolutionChart
				{evolution}
				{unit}
				existence={bounds ? evolution : existenceEvolution}
				clipToExistence={!bounds}
				{bounds}
				{accent}
				{edited}
				{ranges}
			/>
		</div>
	{/if}
{/if}
</div>

<style>
	.dated-block {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
	}

	.dated-block > .dated-value {
		align-self: stretch;
	}

	.dated-value {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 14px;
		padding: 6px 10px;
		border-radius: 6px;
		background: rgb(8 14 29 / 60%);
		border: 1px solid rgb(148 163 184 / 18%);
		color: #cbd5e1;
		font-size: 11px;
	}

	:global(body.light) .dated-value {
		background: rgb(248 250 252 / 90%);
		border-color: rgb(226 232 240 / 90%);
		color: #334155;
	}

	.amount {
		color: var(--accent, #34d399);
		font-size: 15px;
		font-weight: 700;
	}

	.spread {
		color: var(--accent, #34d399);
		font-weight: 600;
	}

	:global(body.light) .amount,
	:global(body.light) .spread {
		color: var(--accent-light, #047857);
	}

	.shadow {
		opacity: 0.35;
	}

	.message {
		color: #94a3b8;
	}

	.message.error {
		color: #f87171;
	}

	.function-toggle {
		padding: 3px 10px;
		background: color-mix(in srgb, var(--accent, #34d399) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent, #34d399) 50%, transparent);
		border-radius: 6px;
		color: var(--accent, #34d399);
		font-size: 11px;
		font-weight: 700;
		cursor: pointer;
	}

	.function-toggle:hover {
		background: color-mix(in srgb, var(--accent, #34d399) 24%, transparent);
	}

	:global(body.light) .function-toggle {
		color: var(--accent-light, #047857);
		border-color: color-mix(in srgb, var(--accent-light, #047857) 50%, transparent);
	}

	.function-chart {
		align-self: stretch;
	}
</style>
