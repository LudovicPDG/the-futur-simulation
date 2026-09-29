<script lang="ts">
	import type { SimulationElement } from '$lib/stores/simulation';
	import { renderSimulationElementSvg } from '$lib/simulation/renderSvg';
	import { parseTranslation } from '$lib/simulation/Translation';
	import { getLocale } from '$lib/paraglide/runtime';
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
		if (node && !(nextTarget instanceof Node && node.contains(nextTarget))) {
			hoveredElement = null;
		}
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
		return value
			.replace(/([a-z])([A-Z])/g, '$1 $2')
			.replace(/[_-]+/g, ' ')
			.replace(/^\w/, (character) => character.toUpperCase());
	}

	function closeDetails() {
		selectedElement = null;
		hoveredElement = null;
	}

	function handleWheel(event: WheelEvent) {
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
					([key]) => key !== 'name' && key !== 'type'
				)
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
			<circle r="600" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="1" />
			<circle r="400" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1" />
			<circle r="200" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1" />

			<!-- Render each simulation element -->
			{#each renderedElements as item}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html `<g data-element-index="${item.index}">${item.svgContent}</g>`}
			{/each}
		</g>
	</svg>

	{#if activeElement}
		<aside class="element-details" aria-label="Simulation element details">
			<header class="details-header">
				<div>
					<p class="element-type">{formatLabel(activeElement.type || 'fact')}</p>
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
		padding: 18px;
		color: #e6edf3;
		background: rgb(13 20 35 / 94%);
		border: 1px solid rgb(148 163 184 / 30%);
		border-radius: 8px;
		box-shadow: 0 12px 36px rgb(0 0 0 / 35%);
		backdrop-filter: blur(12px);
	}

	.details-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding-bottom: 12px;
		border-bottom: 1px solid rgb(148 163 184 / 22%);
	}

	.element-type {
		margin: 0 0 5px;
		color: #7dd3fc;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
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

	.element-details dl {
		margin: 4px 0 0;
	}

	.detail-row {
		padding: 11px 0;
		border-bottom: 1px solid rgb(148 163 184 / 14%);
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

	.detail-row dd {
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

	:global(.fact-node) {
		cursor: pointer;
		transition: transform 0.2s ease;
	}

	:global(.fact-node:hover) {
		filter: drop-shadow(0 0 14px rgba(56, 189, 248, 0.8));
	}
</style>
