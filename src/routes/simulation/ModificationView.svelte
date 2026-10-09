<script lang="ts">
	import type { ModificationData } from '$lib/simulation/Modification';
	import * as m from '$lib/paraglide/messages';

	let {
		modification,
		format
	}: { modification?: ModificationData | null; format: (value: unknown) => string } = $props();

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
			<div class="modification-entry">
				<span class="modification-name">{format(entry.name)}</span>
				<span class="modification-value">{format(entry.value)}</span>
				<span class="modification-impact">
					{m.simulation_field_impact()}: <strong>{format(entry.impact)}</strong>
				</span>
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
	.modification-impact {
		align-self: end;
		color: #94a3b8;
		font-size: 11px;
		white-space: nowrap;
	}
	:global(body.light) .modification-label {
		color: #087e8b;
	}
	:global(body.light) .modification-entry {
		border-left-color: #087e8b;
		background: rgb(8 126 139 / 8%);
	}
	:global(body.light) .modification-name,
	:global(body.light) .modification-impact {
		color: #64748b;
	}
	:global(body.light) .modification-value {
		color: #0f172a;
	}
</style>
