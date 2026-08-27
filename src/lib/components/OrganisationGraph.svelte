<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';

	export interface OrganisationData {
		name: string;
		description: string;
		type: string;
		objective?: string[];
		satisfaction: number;
		resource: {
			human: number;
			financial?: number;
			material?: Array<{ name: string; quantity: number }>;
		};
	}

	let { organisations = [] }: { organisations: OrganisationData[] } = $props();

	interface GraphNode {
		id: string;
		data: OrganisationData;
		x: number;
		y: number;
		vx: number;
		vy: number;
		radius: number;
		color: string;
		isDragging?: boolean;
	}

	let nodes = $state<GraphNode[]>([]);
	let hoveredNode = $state<GraphNode | null>(null);
	let tooltipPos = $state({ x: 0, y: 0 });

	let containerWidth = $state(800);
	let containerHeight = $state(600);

	let animationFrameId: number | null = null;
	let isRunning = false;

	// Helper to calculate exact satisfaction color interpolation
	// 0 => Red (239, 68, 68)
	// 50 => Grey (128, 128, 128)
	// 100 => Green (34, 197, 94)
	function getSatisfactionColor(satisfaction: number): string {
		const s = Math.max(0, Math.min(100, satisfaction));
		let r: number, g: number, b: number;

		if (s <= 50) {
			const t = s / 50;
			r = Math.round(239 + (128 - 239) * t);
			g = Math.round(68 + (128 - 68) * t);
			b = Math.round(68 + (128 - 68) * t);
		} else {
			const t = (s - 50) / 50;
			r = Math.round(128 + (34 - 128) * t);
			g = Math.round(128 + (197 - 128) * t);
			b = Math.round(128 + (94 - 128) * t);
		}

		return `rgb(${r}, ${g}, ${b})`;
	}

	function calculateRadius(humanResource: number): number {
		const members = Math.max(1, humanResource || 1);
		return Math.max(22, Math.min(75, 18 + Math.sqrt(members) * 5.5));
	}

	// Sync prop organisations into graph nodes cleanly using untrack to prevent reactive loops
	$effect(() => {
		const orgs = organisations;
		const width = containerWidth || 800;
		const height = containerHeight || 600;
		const centerX = width / 2;
		const centerY = height / 2;

		const currentNodes = untrack(() => nodes);
		const currentNodesMap = new Map(currentNodes.map((n) => [n.id, n]));
		const updatedNodes: GraphNode[] = [];

		orgs.forEach((org, idx) => {
			const id = org.name;
			const radius = calculateRadius(org.resource?.human ?? 1);
			const color = getSatisfactionColor(org.satisfaction ?? 50);

			if (currentNodesMap.has(id)) {
				const existing = currentNodesMap.get(id)!;
				existing.data = org;
				existing.radius = radius;
				existing.color = color;
				updatedNodes.push(existing);
			} else {
				const angle = (idx / Math.max(1, orgs.length)) * Math.PI * 2 + Math.random() * 0.5;
				const dist = 50 + Math.random() * 100;
				updatedNodes.push({
					id,
					data: org,
					x: centerX + Math.cos(angle) * dist,
					y: centerY + Math.sin(angle) * dist,
					vx: (Math.random() - 0.5) * 4,
					vy: (Math.random() - 0.5) * 4,
					radius,
					color
				});
			}
		});

		nodes = updatedNodes;
		startPhysics();
	});

	// Derived connections array for rendering SVG lines between same-type orgs
	let connections = $derived.by(() => {
		const list: Array<{ id: string; x1: number; y1: number; x2: number; y2: number }> = [];
		for (let i = 0; i < nodes.length; i++) {
			for (let j = i + 1; j < nodes.length; j++) {
				const a = nodes[i];
				const b = nodes[j];
				if (a.data.type === b.data.type) {
					list.push({
						id: `${a.id}-${b.id}`,
						x1: a.x,
						y1: a.y,
						x2: b.x,
						y2: b.y
					});
				}
			}
		}
		return list;
	});

	function startPhysics() {
		if (isRunning) return;
		isRunning = true;
		if (typeof window !== 'undefined') {
			animationFrameId = requestAnimationFrame(loop);
		}
	}

	function stopPhysics() {
		isRunning = false;
		if (animationFrameId !== null) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
	}

	// Physics step returning true if nodes are still moving significantly or being dragged
	function updatePhysics(): boolean {
		const width = containerWidth || 800;
		const height = containerHeight || 600;
		const centerX = width / 2;
		const centerY = height / 2;
		const dampening = 0.85;
		const centerForce = 0.001;
		const repulsion = 1400;

		let totalMovement = 0;
		let anyDragging = false;

		for (let i = 0; i < nodes.length; i++) {
			const nodeA = nodes[i];
			if (nodeA.isDragging) {
				anyDragging = true;
				continue;
			}

			// Pull toward center
			nodeA.vx += (centerX - nodeA.x) * centerForce;
			nodeA.vy += (centerY - nodeA.y) * centerForce;

			// Repulsion & Collision between nodes
			for (let j = i + 1; j < nodes.length; j++) {
				const nodeB = nodes[j];
				const dx = nodeB.x - nodeA.x;
				const dy = nodeB.y - nodeA.y;
				let dist = Math.sqrt(dx * dx + dy * dy) || 1;
				const minDist = nodeA.radius + nodeB.radius + 15;

				if (dist < minDist) {
					const overlap = minDist - dist;
					const fx = (dx / dist) * overlap * 0.15;
					const fy = (dy / dist) * overlap * 0.15;

					if (!nodeA.isDragging) {
						nodeA.vx -= fx;
						nodeA.vy -= fy;
					}
					if (!nodeB.isDragging) {
						nodeB.vx += fx;
						nodeB.vy += fy;
					}
				}

				// Global repulsion
				const repForce = repulsion / (dist * dist + 100);
				const rfx = (dx / dist) * repForce;
				const rfy = (dy / dist) * repForce;

				if (!nodeA.isDragging) {
					nodeA.vx -= rfx;
					nodeA.vy -= rfy;
				}
				if (!nodeB.isDragging) {
					nodeB.vx += rfx;
					nodeB.vy += rfy;
				}
			}

			// Apply velocities
			nodeA.vx *= dampening;
			nodeA.vy *= dampening;

			nodeA.x += nodeA.vx;
			nodeA.y += nodeA.vy;

			// Keep within container bounds
			nodeA.x = Math.max(nodeA.radius, Math.min(width - nodeA.radius, nodeA.x));
			nodeA.y = Math.max(nodeA.radius, Math.min(height - nodeA.radius, nodeA.y));

			totalMovement += Math.abs(nodeA.vx) + Math.abs(nodeA.vy);
		}

		return anyDragging || totalMovement > 0.05;
	}

	function loop() {
		const shouldContinue = updatePhysics();
		if (shouldContinue && isRunning) {
			animationFrameId = requestAnimationFrame(loop);
		} else {
			stopPhysics();
		}
	}

	onMount(() => {
		startPhysics();
	});

	onDestroy(() => {
		stopPhysics();
	});

	// Dragging with Pointer Events
	let activeDraggedNode: GraphNode | null = null;
	let dragPointerId: number | null = null;

	function handlePointerDown(node: GraphNode, e: PointerEvent) {
		activeDraggedNode = node;
		node.isDragging = true;
		dragPointerId = e.pointerId;
		(e.currentTarget as Element)?.setPointerCapture?.(e.pointerId);
		startPhysics();
	}

	function handlePointerMove(e: PointerEvent) {
		if (activeDraggedNode && e.pointerId === dragPointerId) {
			const svgElement = (e.currentTarget as Element).closest('svg');
			if (svgElement) {
				const rect = svgElement.getBoundingClientRect();
				activeDraggedNode.x = Math.max(
					activeDraggedNode.radius,
					Math.min(rect.width - activeDraggedNode.radius, e.clientX - rect.left)
				);
				activeDraggedNode.y = Math.max(
					activeDraggedNode.radius,
					Math.min(rect.height - activeDraggedNode.radius, e.clientY - rect.top)
				);
				activeDraggedNode.vx = 0;
				activeDraggedNode.vy = 0;
			}
		}

		if (hoveredNode) {
			tooltipPos = { x: e.clientX, y: e.clientY };
		}
	}

	function handlePointerUp(e: PointerEvent) {
		if (activeDraggedNode && e.pointerId === dragPointerId) {
			activeDraggedNode.isDragging = false;
			activeDraggedNode = null;
			dragPointerId = null;
		}
	}
</script>

<div class="graph-container" bind:clientWidth={containerWidth} bind:clientHeight={containerHeight}>
	<svg
		width="100%"
		height="100%"
		role="application"
		aria-label="Graphe interactif des organisations"
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
		onpointercancel={handlePointerUp}
	>
		<!-- Graph Nodes -->
		<g class="nodes">
			{#each nodes as node (node.id)}
				{@const isHovered = hoveredNode?.id === node.id}
				<g
					class="node-group"
					class:hovered={isHovered}
					class:dragging={node.isDragging}
					role="button"
					tabindex="0"
					aria-label={node.data.name}
					transform="translate({node.x}, {node.y})"
					onpointerdown={(e) => handlePointerDown(node, e)}
					onpointerenter={(e) => {
						hoveredNode = node;
						tooltipPos = { x: e.clientX, y: e.clientY };
					}}
					onpointerleave={() => {
						if (hoveredNode?.id === node.id) hoveredNode = null;
					}}
				>
					<!-- Aura / Glow Circle -->
					<circle
						r={node.radius + (isHovered ? 8 : 4)}
						fill={node.color}
						opacity={isHovered ? 0.45 : 0.2}
						class="glow-circle"
					/>

					<!-- Main Circle -->
					<circle
						r={node.radius}
						fill={node.color}
						stroke={isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.6)'}
						stroke-width={isHovered ? 3 : 1.5}
						class="main-circle"
					/>

					<!-- Member count inner text -->
					{#if node.radius >= 22}
						<text
							text-anchor="middle"
							dominant-baseline="central"
							fill="#ffffff"
							font-size={Math.max(11, Math.min(16, node.radius * 0.45))}
							font-weight="600"
							class="node-text"
						>
							{node.data.name.length > 18 ? node.data.name.slice(0, 16) + '...' : node.data.name}
						</text>
					{/if}
				</g>
			{/each}
		</g>
	</svg>

	<!-- Glassmorphism Tooltip -->
	{#if hoveredNode}
		<div class="tooltip" style="left: {tooltipPos.x + 15}px; top: {tooltipPos.y + 15}px;">
			<div class="tooltip-header">
				<span class="tooltip-title">{hoveredNode.data.name}</span>
				<span class="type-badge">{hoveredNode.data.type || 'Organisation'}</span>
			</div>

			<p class="tooltip-desc">{hoveredNode.data.description || 'Aucune description disponible.'}</p>

			<div class="tooltip-stats">
				<div class="stat-item">
					<span class="stat-label">Membres:</span>
					<span class="stat-value">{hoveredNode.data.resource?.human ?? 1} 👤</span>
				</div>

				<div class="stat-item">
					<span class="stat-label">Satisfaction:</span>
					<div class="satisfaction-badge" style="background-color: {hoveredNode.color};">
						{hoveredNode.data.satisfaction ?? 50}%
					</div>
				</div>

				{#if hoveredNode.data.resource?.financial}
					<div class="stat-item">
						<span class="stat-label">Budget:</span>
						<span class="stat-value">{hoveredNode.data.resource.financial} 🪙</span>
					</div>
				{/if}
			</div>

			{#if hoveredNode.data.objective && hoveredNode.data.objective.length > 0}
				<div class="objectives">
					<span class="stat-label">Objectifs:</span>
					<div class="tags">
						{#each hoveredNode.data.objective as obj}
							<span class="tag">{obj}</span>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.graph-container {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: radial-gradient(circle at center, #e8eaeb 0%, #f5f5f5 100%);
	}

	:global(body.dark) .graph-container {
		background: radial-gradient(circle at center, #1e293b 0%, #0f172a 100%);
	}

	svg {
		display: block;
		width: 100%;
		height: 100%;
		user-select: none;
	}

	.node-group {
		cursor: grab;
		transition: transform 0.05s linear;
	}

	.node-group.dragging {
		cursor: grabbing;
	}

	.glow-circle {
		transition:
			r 0.2s ease,
			opacity 0.2s ease;
	}

	.main-circle {
		transition:
			stroke-width 0.15s ease,
			stroke 0.15s ease;
	}

	.node-text,
	.node-label {
		user-select: none;
		pointer-events: none;
	}

	.node-label {
		font-family: Inter, system-ui, sans-serif;
		transition: fill 0.15s ease;
	}

	.tooltip {
		position: fixed;
		z-index: 100;
		pointer-events: none;

		min-width: 240px;
		max-width: 320px;
		padding: 14px 16px;

		background: rgba(15, 23, 42, 0.85);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 12px;

		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
		color: #f8fafc;
		font-family: Inter, system-ui, sans-serif;
	}

	.tooltip-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 6px;
	}

	.tooltip-title {
		font-weight: 700;
		font-size: 15px;
		color: #ffffff;
	}

	.type-badge {
		font-size: 11px;
		padding: 2px 8px;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.1);
		color: #94a3b8;
		text-transform: capitalize;
	}

	.tooltip-desc {
		font-size: 12px;
		color: #cbd5e1;
		margin-bottom: 10px;
		line-height: 1.4;
	}

	.tooltip-stats {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 13px;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		padding-top: 8px;
	}

	.stat-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.stat-label {
		color: #94a3b8;
		font-size: 12px;
	}

	.stat-value {
		font-weight: 600;
		color: #f1f5f9;
	}

	.satisfaction-badge {
		padding: 2px 8px;
		border-radius: 10px;
		font-weight: 700;
		font-size: 12px;
		color: #ffffff;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
	}

	.objectives {
		margin-top: 8px;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		padding-top: 6px;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 4px;
	}

	.tag {
		font-size: 10px;
		padding: 2px 6px;
		background: rgba(59, 130, 246, 0.2);
		color: #60a5fa;
		border: 1px solid rgba(59, 130, 246, 0.3);
		border-radius: 4px;
	}
</style>
