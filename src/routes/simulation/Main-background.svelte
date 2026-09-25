<script lang="ts">
	import type { WorldData } from '$lib/server/simulation_object/Genie';
	import { untrack } from 'svelte';
	let { new_element }: { new_element?: WorldData | string } = $props();
	let nodes = $state<WorldData[]>([]);

	let cameraX = $state(0);
	let cameraY = $state(0);
	let zoom = $state(1);

	let isPanning = $state(false);

	let lastPointerX = 0;
	let lastPointerY = 0;

	function handlePointerDown(event: PointerEvent) {
		// Seulement bouton gauche pour la souris
		if (event.pointerType === 'mouse' && event.button !== 0) return;

		isPanning = true;

		lastPointerX = event.clientX;
		lastPointerY = event.clientY;

		// Continue à recevoir les événements même si
		// le doigt / curseur sort du canvas
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

	$effect(() => {
		// Only run when new_element exists and is valid
		if (new_element && typeof new_element !== 'string') {
			untrack(() => {
				nodes.push(new_element);
			});
		}
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
	<div class="world" style={`transform: translate(${cameraX}px, ${cameraY}px) scale(${zoom});`}>
		<div class="node" style="left: 0px; top: 0px;">Organisation</div>

		<div class="node" style="left: 400px; top: 200px;">Fact</div>
	</div>
</main>

<style>
	.canvas {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;

		/* Très important pour le tactile */
		touch-action: none;

		cursor: grab;
	}

	.canvas.panning {
		cursor: grabbing;
	}

	.world {
		position: absolute;
		left: 0;
		top: 0;

		width: 1px;
		height: 1px;

		transform-origin: 0 0;

		pointer-events: none;
	}

	.node {
		position: absolute;

		width: 120px;
		height: 50px;

		display: flex;
		align-items: center;
		justify-content: center;

		background: white;
		border: 1px solid #ccc;
		border-radius: 8px;
	}
</style>
