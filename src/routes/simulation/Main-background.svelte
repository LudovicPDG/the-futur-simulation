<script lang="ts">
	import type { SimulationElement } from '$lib/stores/simulation';
	import { renderSimulationElementSvg } from '$lib/simulation/renderSvg';
	import { parseTranslation } from '$lib/simulation/Translation';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { getLocale } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { onMount } from 'svelte';

	let {
		new_element,
		simulation_data = []
	}: { new_element?: any; simulation_data?: SimulationElement[] } = $props();

	let cameraX = $state(400);
	let cameraY = $state(300);
	let zoom = $state(1);
	let hoveredElement = $state<SimulationElement | null>(null);
	let selectedElement = $state<SimulationElement | null>(null);

	onMount(() => {
		cameraX = window.innerWidth / 2;
		cameraY = window.innerHeight / 2;
	});

	let isPanning = $state(false);

	let lastPointerX = 0;
	let lastPointerY = 0;

	// Compute positioning of elements in a circular / spiraling web layout
	function getNodePosition(index: number, total: number) {
		if (total <= 1) return { x: 0, y: 0 };
		const angle = (index / total) * 2 * Math.PI;
		const radius = Math.min(450, 140 + total * 28);
		return {
			x: Math.cos(angle) * radius,
			y: Math.sin(angle) * radius
		};
	}

	function handlePointerDown(event: PointerEvent) {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		if ((event.target as Element | null)?.closest('.element-details')) return;
		if (getNodeElement(event.target)) {
			selectedElement = getSimulationElement(event.target);
			return;
		}

		isPanning = true;
		lastPointerX = event.clientX;
		lastPointerY = event.clientY;

		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function handlePointerMove(event: PointerEvent) {
		if (!isPanning) return;

		const dx = event.clientX - lastPointerX;
		const dy = event.clientY - lastPointerY;

		cameraX += dx;
		cameraY += dy;

		lastPointerX = event.clientX;
		lastPointerY = event.clientY;
	}

	function handlePointerUp(event: PointerEvent) {
		isPanning = false;

		if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) {
			(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
		}
	}

	function getNodeElement(target: EventTarget | null): Element | null {
		return target instanceof Element ? target.closest('.fact-node') : null;
	}

	function getSimulationElement(target: EventTarget | null): SimulationElement | null {
		const node = getNodeElement(target);
		const index = Number(node?.closest('[data-element-index]')?.getAttribute('data-element-index'));
		return Number.isInteger(index) ? (renderedElements[index]?.element ?? null) : null;
	}

	function handlePointerOver(event: PointerEvent) {
		const element = getSimulationElement(event.target);
		if (element) hoveredElement = element;
	}

	function handlePointerOut(event: PointerEvent) {
		const node = getNodeElement(event.target);
		const nextTarget = event.relatedTarget;
		const nextElement = nextTarget instanceof Element ? nextTarget : null;
		if (
			node &&
			!(nextTarget instanceof Node && node.contains(nextTarget)) &&
			!nextElement?.closest('.element-details') &&
			!getNodeElement(nextTarget)
		) {
			hoveredElement = null;
		}
	}

	function handleDetailsPointerLeave() {
		if (!selectedElement) hoveredElement = null;
	}

	function localizedValue(value: unknown): string {
		if (typeof value === 'string') {
			const parsed = parseTranslation(value);
			if (parsed) return parsed[currentLocale] || parsed.fr || parsed.en || '';
			return value;
		}

		if (Array.isArray(value)) {
			return value.map((item) => formatValue(item)).join('\n');
		}

		if (typeof value === 'object' && value !== null) {
			const record = value as Record<string, unknown>;
			const languageKeys = ['fr', 'en', 'de', 'es'];
			if (languageKeys.some((key) => key in record)) {
				return String(record[currentLocale] || record.fr || record.en || '');
			}
		}

		return '';
	}

	function formatValue(value: unknown): string {
		if (value === null || value === undefined || value === '') return '—';
		if (typeof value === 'string') return localizedValue(value);
		if (typeof value === 'number' || typeof value === 'boolean') return String(value);
		if (Array.isArray(value)) return localizedValue(value) || '—';
		if (typeof value === 'object') {
			const translated = localizedValue(value);
			if (translated) return translated;

			return Object.entries(value as Record<string, unknown>)
				.map(([key, nestedValue]) => `${formatLabel(key)}: ${formatValue(nestedValue)}`)
				.join('\n');
		}
		return String(value);
	}

	function formatLabel(value: string): string {
		const key = value
			.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
			.replace(/[_\s-]+/g, '_')
			.toLowerCase();
		const labels: Record<string, () => string> = {
			description: m.simulation_field_description,
			impossibility: m.simulation_field_impossibility,
			probability_distribution: m.simulation_field_probability_distribution,
			originality: m.simulation_field_originality,
			name: m.simulation_field_name,
			type: m.simulation_field_type,
			value: m.simulation_field_value,
			quantity: m.simulation_field_quantity,
			level_of_wear: m.simulation_field_level_of_wear,
			evolution: m.simulation_field_evolution,
			financial_resource: m.simulation_field_financial_resource,
			power: m.simulation_field_power,
			human_resource: m.simulation_field_human_resource,
			unit: m.simulation_field_unit,
			rankings: m.simulation_field_rankings,
			material_resource_used: m.simulation_field_material_resource_used,
			fund_used: m.simulation_field_fund_used,
			human_mobilized: m.simulation_field_human_mobilized,
			number_of_units: m.simulation_field_number_of_units,
			financial_value: m.simulation_field_financial_value,
			new_value: m.simulation_field_new_value,
			verification_method: m.simulation_field_verification_method,
			falsifiability_method: m.simulation_field_falsifiability_method,
			source: m.simulation_field_source,
			element1_id: m.simulation_field_element1_id,
			element1_type: m.simulation_field_element1_type,
			element2_id: m.simulation_field_element2_id,
			element2_type: m.simulation_field_element2_type,
			element1_element2_connexions: m.simulation_field_element1_element2_connexions,
			element2_element1_connexions: m.simulation_field_element2_element1_connexions,
			connexions: m.simulation_field_connexions,
			source_property: m.simulation_field_source_property,
			target_property: m.simulation_field_target_property,
			impact: m.simulation_field_impact
		};

		return (
			labels[key]?.() ||
			value.replace(/[_-]+/g, ' ').replace(/^\w/, (character) => character.toUpperCase())
		);
	}

	function formatType(value: string): string {
		const types: Record<string, () => string> = {
			fact: m.simulation_type_fact,
			person: m.simulation_type_person,
			organization: m.simulation_type_organization,
			interest_group: m.simulation_type_interest_group,
			character: m.simulation_type_character,
			evolution: m.simulation_type_evolution,
			ranking: m.simulation_type_ranking,
			event: m.simulation_type_event,
			action: m.simulation_type_action,
			material_resource: m.simulation_type_material_resource,
			proof: m.simulation_type_proof,
			relation: m.simulation_type_relation
		};

		return types[value]?.() || formatLabel(value);
	}

	function closeDetails() {
		selectedElement = null;
		hoveredElement = null;
	}

	function handleDetailsOutsideClick(event: MouseEvent) {
		if ((event.target as Element | null)?.closest('.fact-node')) return;
		closeDetails();
	}

	function handleWheel(event: WheelEvent) {
		if ((event.target as Element | null)?.closest('.element-details')) return;

		event.preventDefault();

		const canvas = event.currentTarget as HTMLElement;
		const rect = canvas.getBoundingClientRect();

		const mouseX = event.clientX - rect.left;
		const mouseY = event.clientY - rect.top;

		const worldX = (mouseX - cameraX) / zoom;
		const worldY = (mouseY - cameraY) / zoom;

		const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
		const newZoom = Math.min(10, Math.max(0.1, zoom * zoomFactor));

		cameraX = mouseX - worldX * newZoom;
		cameraY = mouseY - worldY * newZoom;

		zoom = newZoom;
	}

	const currentLocale = $derived.by(() => {
		try {
			return getLocale() as 'fr' | 'en' | 'de' | 'es';
		} catch {
			return 'fr';
		}
	});

	const renderedElements = $derived.by(() => {
		const list = (simulation_data || []).filter(
			(item): item is SimulationElement => typeof item === 'object' && item !== null
		);
		return list.map((element, index) => {
			const pos = getNodePosition(index, list.length);
			const svgContent = renderSimulationElementSvg(element, {
				x: pos.x,
				y: pos.y,
				radius: 50,
				locale: currentLocale
			});
			return {
				element,
				pos,
				svgContent,
				index
			};
		});
	});

	const activeElement = $derived(hoveredElement ?? selectedElement);
	const activeFields = $derived(
		activeElement
			? Object.entries(activeElement as Record<string, unknown>).filter(
					([key]) =>
						key !== 'name' &&
						key !== 'type' &&
						key !== 'other' &&
						!['impossibility', 'probability_distribution', 'originality'].includes(key)
				)
			: []
	);
	const activeParameters = $derived(
		activeElement
			? Object.entries(activeElement as Record<string, unknown>).filter(([key]) =>
					['impossibility', 'probability_distribution', 'originality'].includes(key)
				)
			: []
	);
	const activeOther = $derived(
		activeElement && Array.isArray((activeElement as Record<string, unknown>).other)
			? ((activeElement as Record<string, unknown>).other as Array<Record<string, unknown>>)
			: []
	);

	$effect(() => {
		console.log('Rendered simulation elements count:', renderedElements.length);
	});

	$effect(() => {
		console.log('Simulation data changed:', simulation_data);
	});
</script>

<main
	class="canvas"
	class:panning={isPanning}
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointercancel={handlePointerUp}
	onpointerover={handlePointerOver}
	onpointerout={handlePointerOut}
	onwheel={handleWheel}
>
	<svg class="world-svg" width="100%" height="100%">
		<g transform={`translate(${cameraX}, ${cameraY}) scale(${zoom})`}>
			<!-- Simulation Grid / Axes -->
			<circle class="grid-ring outer" r="600" fill="none" stroke-width="1" />
			<circle class="grid-ring middle" r="400" fill="none" stroke-width="1" />
			<circle class="grid-ring inner" r="200" fill="none" stroke-width="1" />

			<!-- Render each simulation element -->
			{#each renderedElements as item}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html `<g data-element-index="${item.index}">${item.svgContent}</g>`}
			{/each}
		</g>
	</svg>

	{#if activeElement}
		<aside
			class="element-details"
			aria-label="Simulation element details"
			use:clickOutside={handleDetailsOutsideClick}
			onpointerleave={handleDetailsPointerLeave}
		>
			<header class="details-header">
				<div>
					<p class="element-type">{formatType(activeElement.type || 'fact')}</p>
					<h2>{formatValue(activeElement.name)}</h2>
				</div>
				<button
					class="close-details"
					type="button"
					aria-label="Close details"
					onclick={closeDetails}
				>
					×
				</button>
			</header>
			<dl>
				{#each activeFields as [key, value]}
					<div class="detail-row">
						<dt>{formatLabel(key)}</dt>
						<dd>{formatValue(value)}</dd>
					</div>
				{/each}
			</dl>
			{#if activeOther.length > 0}
				<section class="other-details">
					<h3>{m.simulation_section_other_information()}</h3>
					<dl>
						{#each activeOther as item}
							<div class="other-row">
								<dt>{formatLabel(formatValue(item.name) || 'Other')}</dt>
								<dd>{formatValue(item.value)}</dd>
							</div>
						{/each}
					</dl>
				</section>
			{/if}
			{#if activeParameters.length > 0}
				<section class="parameter-details">
					<h3>{m.simulation_section_parameters()}</h3>
					<dl>
						{#each activeParameters as [key, value]}
							<div class="detail-row">
								<dt>{formatLabel(key)}</dt>
								<dd>{formatValue(value)}</dd>
							</div>
						{/each}
					</dl>
				</section>
			{/if}
		</aside>
	{/if}
</main>

<style>
	.canvas {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		touch-action: none;
		cursor: grab;
		background: radial-gradient(circle at center, #0b132b 0%, #050814 100%);
		transition: background 0.25s ease;
	}

	:global(body.light) .canvas {
		background: radial-gradient(circle at center, #ffffff 0%, #ffffff 90%, #b98fb7 100%);
	}

	.canvas.panning {
		cursor: grabbing;
	}

	.element-details {
		position: absolute;
		top: 20px;
		left: 20px;
		z-index: 5;
		width: min(360px, calc(100% - 40px));
		max-height: calc(100% - 40px);
		overflow: auto;
		overscroll-behavior: contain;
		padding: 18px;
		color: #e6edf3;
		background: rgb(13 20 35 / 94%);
		border: 1px solid rgb(148 163 184 / 30%);
		border-radius: 8px;
		box-shadow: 0 12px 36px rgb(0 0 0 / 35%);
		backdrop-filter: blur(12px);
		cursor: default;
	}

	:global(body.light) .element-details {
		color: #243442;
		background: rgb(255 255 255 / 96%);
		border-color: rgb(71 85 105 / 24%);
		box-shadow: 0 12px 36px rgb(15 23 42 / 14%);
	}

	@media (max-width: 600px) {
		.element-details {
			top: 112px;
			left: 12px;
			width: min(360px, calc(100% - 24px));
			max-height: calc(100% - 124px);
		}
	}

	.details-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding-bottom: 12px;
		border-bottom: 1px solid rgb(148 163 184 / 22%);
	}

	:global(body.light) .details-header,
	:global(body.light) .other-details,
	:global(body.light) .parameter-details {
		border-color: rgb(71 85 105 / 18%);
	}

	.element-type {
		margin: 0 0 5px;
		color: #7dd3fc;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
	}

	:global(body.light) .element-type,
	:global(body.light) .other-details h3 {
		color: #087e8b;
	}

	.details-header h2 {
		margin: 0;
		font-size: 18px;
		line-height: 1.3;
		overflow-wrap: anywhere;
	}

	.close-details {
		flex: 0 0 32px;
		width: 32px;
		height: 32px;
		padding: 0;
		color: #cbd5e1;
		background: transparent;
		border: 1px solid rgb(148 163 184 / 35%);
		border-radius: 5px;
		font-size: 22px;
		line-height: 1;
		cursor: pointer;
	}

	.close-details:hover {
		color: white;
		background: rgb(148 163 184 / 16%);
	}

	:global(body.light) .close-details {
		color: #475569;
		border-color: rgb(71 85 105 / 28%);
	}

	:global(body.light) .close-details:hover {
		color: #0f172a;
		background: rgb(71 85 105 / 10%);
	}

	.element-details dl {
		margin: 4px 0 0;
	}

	.detail-row {
		padding: 11px 0;
		border-bottom: 1px solid rgb(148 163 184 / 14%);
	}

	:global(body.light) .detail-row,
	:global(body.light) .other-row {
		border-color: rgb(71 85 105 / 14%);
	}

	.detail-row:last-child {
		border-bottom: 0;
	}

	.detail-row dt {
		margin-bottom: 4px;
		color: #94a3b8;
		font-size: 12px;
		font-weight: 600;
	}

	:global(body.light) .detail-row dt,
	:global(body.light) .other-row dt {
		color: #64748b;
	}

	.detail-row dd {
		margin: 0;
		color: #f1f5f9;
		font-size: 13px;
		line-height: 1.5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	:global(body.light) .detail-row dd,
	:global(body.light) .other-row dd {
		color: #243442;
	}

	.other-details {
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid rgb(148 163 184 / 22%);
	}

	.other-details h3 {
		margin: 0 0 4px;
		color: #7dd3fc;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
	}

	.parameter-details {
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid rgb(148 163 184 / 22%);
	}

	.parameter-details h3 {
		margin: 0 0 4px;
		color: #fbbf24;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
	}

	:global(body.light) .parameter-details h3 {
		color: #a16207;
	}

	.parameter-details dl {
		margin: 0;
	}

	.other-details dl {
		margin: 0;
	}

	.other-row {
		display: grid;
		grid-template-columns: minmax(76px, 0.7fr) minmax(0, 1.5fr);
		gap: 12px;
		padding: 9px 0;
		border-bottom: 1px solid rgb(148 163 184 / 14%);
	}

	.other-row:last-child {
		border-bottom: 0;
	}

	.other-row dt {
		color: #94a3b8;
		font-size: 12px;
		font-weight: 600;
	}

	.other-row dd {
		margin: 0;
		color: #f1f5f9;
		font-size: 13px;
		line-height: 1.5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.world-svg {
		width: 100%;
		height: 100%;
		display: block;
		user-select: none;
	}

	.grid-ring.outer {
		stroke: rgb(255 255 255 / 3%);
	}

	.grid-ring.middle {
		stroke: rgb(255 255 255 / 4%);
	}

	.grid-ring.inner {
		stroke: rgb(255 255 255 / 5%);
	}

	:global(body.light) .grid-ring.outer {
		stroke: rgb(51 65 85 / 8%);
	}

	:global(body.light) .grid-ring.middle {
		stroke: rgb(51 65 85 / 11%);
	}

	:global(body.light) .grid-ring.inner {
		stroke: rgb(51 65 85 / 15%);
	}

	:global(.fact-node) {
		cursor: pointer;
		transition: transform 0.2s ease;
	}

	:global(.fact-node:hover) {
		filter: drop-shadow(0 0 14px rgba(56, 189, 248, 0.8));
	}
</style>
