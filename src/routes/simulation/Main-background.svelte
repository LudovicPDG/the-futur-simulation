<script lang="ts">
	import type { SimulationElement } from '$lib/stores/simulation';
	import { renderSimulationElementSvg } from '$lib/simulation/renderSvg';
	import { getLocale } from '$lib/paraglide/runtime';
	import { onMount } from 'svelte';

	let {
		new_element,
		simulation_data = []
	}: { new_element?: any; simulation_data?: SimulationElement[] } = $props();

	let cameraX = $state(400);
	let cameraY = $state(300);
	let zoom = $state(1);

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
				svgContent
			};
		});
	});

	$effect(() => {
		console.log('Rendered simulation elements count:', renderedElements.length);
	});
</script>

<main
	class="canvas"
	class:panning={isPanning}
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointercancel={handlePointerUp}
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
				{@html item.svgContent}
			{/each}
		</g>
	</svg>
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
