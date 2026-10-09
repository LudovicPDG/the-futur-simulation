<script lang="ts">
	import type { ModificationData } from '$lib/simulation/Modification';
	import * as m from '$lib/paraglide/messages';

	let {
		modification,
		format
	}: { modification?: ModificationData | null; format: (value: unknown) => string } = $props();

	const groups = $derived([
		{ label: m.simulation_field_new_value(), entries: modification?.new_value ?? [] },
		{ label: m.simulation_field_value_to_modify(), entries: modification?.value_to_modify ?? [] },
		{ label: m.simulation_field_value_to_delete(), entries: modification?.value_to_delete ?? [] }
	]);
</script>

{#each groups as group}
	<div class="modification-group">
		<span class="modification-label">{group.label}</span>
		{#if group.entries.length}
			<ul class="modification-entries">
				{#each group.entries as entry}
					<li>
						<strong>{entry.name}</strong>: {format(entry.value)}
						<span class="modification-impact">
							({m.simulation_field_impact()}: {format(entry.impact)})
						</span>
					</li>
				{/each}
			</ul>
		{:else}
			<span>—</span>
		{/if}
	</div>
{/each}

<style>
	.modification-group {
		margin-bottom: 0.4rem;
	}
	.modification-label {
		display: block;
		font-size: 0.8em;
		opacity: 0.7;
	}
	.modification-entries {
		margin: 0;
		padding-left: 1.1rem;
	}
	.modification-impact {
		opacity: 0.7;
	}
</style>
