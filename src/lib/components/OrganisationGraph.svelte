<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

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

	let canvas: HTMLCanvasElement | null = $state(null);
	let nodes: GraphNode[] = $state([]);
	let hoveredNode: GraphNode | null = $state(null);
	let tooltipPos = $state({ x: 0, y: 0 });

	let animationFrameId: number;
	let width = $state(800);
	let height = $state(600);

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
		// Sqrt scaling for visual balance
		return Math.max(22, Math.min(75, 18 + Math.sqrt(members) * 5.5));
	}

	// Sync prop organisations into internal physics graph nodes
	$effect(() => {
		const currentNodesMap = new Map(nodes.map((n) => [n.id, n]));
		const updatedNodes: GraphNode[] = [];

		const centerX = width / 2 || 400;
		const centerY = height / 2 || 300;

		organisations.forEach((org, idx) => {
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
				// Spawn new node around center with slight random offset
				const angle = (idx / Math.max(1, organisations.length)) * Math.PI * 2 + Math.random() * 0.5;
				const dist = 50 + Math.random() * 100;
				updatedNodes.push({
					id,
					data: org,
					x: centerX + Math.cos(angle) * dist,
					y: centerY + Math.sin(angle) * dist,
					vx: (Math.random() - 0.5) * 2,
					vy: (Math.random() - 0.5) * 2,
					radius,
					color
				});
			}
		});

		nodes = updatedNodes;
	});

	let draggedNode: GraphNode | null = null;
	let dragOffsetX = 0;
	let dragOffsetY = 0;

	function handleMouseDown(e: MouseEvent) {
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		const mouseY = e.clientY - rect.top;

		for (let i = nodes.length - 1; i >= 0; i--) {
			const node = nodes[i];
			const dx = mouseX - node.x;
			const dy = mouseY - node.y;
			if (dx * dx + dy * dy <= node.radius * node.radius) {
				draggedNode = node;
				node.isDragging = true;
				dragOffsetX = dx;
				dragOffsetY = dy;
				break;
			}
		}
	}

	function handleMouseMove(e: MouseEvent) {
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		const mouseY = e.clientY - rect.top;

		if (draggedNode) {
			draggedNode.x = mouseX - dragOffsetX;
			draggedNode.y = mouseY - dragOffsetY;
			draggedNode.vx = 0;
			draggedNode.vy = 0;
		} else {
			// Check hover
			let found: GraphNode | null = null;
			for (let i = nodes.length - 1; i >= 0; i--) {
				const node = nodes[i];
				const dx = mouseX - node.x;
				const dy = mouseY - node.y;
				if (dx * dx + dy * dy <= node.radius * node.radius) {
					found = node;
					break;
				}
			}
			hoveredNode = found;
			tooltipPos = { x: e.clientX, y: e.clientY };
		}
	}

	function handleMouseUp() {
		if (draggedNode) {
			draggedNode.isDragging = false;
			draggedNode = null;
		}
	}

	function updatePhysics() {
		const centerX = width / 2;
		const centerY = height / 2;
		const dampening = 0.88;
		const centerForce = 0.0008;
		const repulsion = 1200;

		for (let i = 0; i < nodes.length; i++) {
			const nodeA = nodes[i];
			if (nodeA.isDragging) continue;

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

			// Keep within canvas bounds
			nodeA.x = Math.max(nodeA.radius, Math.min(width - nodeA.radius, nodeA.x));
			nodeA.y = Math.max(nodeA.radius, Math.min(height - nodeA.radius, nodeA.y));
		}
	}

	function render() {
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		ctx.clearRect(0, 0, width, height);

		// Draw connections between nodes of same type or connected objectives
		for (let i = 0; i < nodes.length; i++) {
			for (let j = i + 1; j < nodes.length; j++) {
				const a = nodes[i];
				const b = nodes[j];
				if (a.data.type === b.data.type) {
					ctx.beginPath();
					ctx.moveTo(a.x, a.y);
					ctx.lineTo(b.x, b.y);
					ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
					ctx.lineWidth = 1.5;
					ctx.setLineDash([4, 4]);
					ctx.stroke();
					ctx.setLineDash([]);
				}
			}
		}

		// Draw Nodes
		nodes.forEach((node) => {
			const isHovered = hoveredNode === node;

			// Glow aura
			ctx.beginPath();
			ctx.arc(node.x, node.y, node.radius + (isHovered ? 8 : 4), 0, Math.PI * 2);
			ctx.fillStyle = node.color.replace('rgb', 'rgba').replace(')', ', 0.25)');
			ctx.fill();

			// Main Circle
			ctx.beginPath();
			ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
			ctx.fillStyle = node.color;
			ctx.fill();

			// Border
			ctx.strokeStyle = isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.6)';
			ctx.lineWidth = isHovered ? 3 : 1.5;
			ctx.stroke();

			// Member count inner text if radius permits
			if (node.radius >= 22) {
				ctx.fillStyle = '#ffffff';
				ctx.font = `600 ${Math.max(11, Math.min(16, node.radius * 0.45))}px Inter, sans-serif`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText(`${node.data.resource?.human ?? 1} 👤`, node.x, node.y);
			}

			// Name label below circle
			ctx.fillStyle = isHovered ? '#ffffff' : '#cbd5e1';
			ctx.font = `500 ${isHovered ? 13 : 12}px Inter, sans-serif`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'top';
			const nameText = node.data.name.length > 18 ? node.data.name.slice(0, 16) + '...' : node.data.name;
			ctx.fillText(nameText, node.x, node.y + node.radius + 6);
		});
	}

	function loop() {
		updatePhysics();
		render();
		if (typeof window !== 'undefined') {
			animationFrameId = requestAnimationFrame(loop);
		}
	}

	function resize() {
		if (canvas && canvas.parentElement) {
			width = canvas.parentElement.clientWidth;
			height = canvas.parentElement.clientHeight;
			canvas.width = width;
			canvas.height = height;
		}
	}

	onMount(() => {
		if (typeof window !== 'undefined') {
			resize();
			window.addEventListener('resize', resize);
			animationFrameId = requestAnimationFrame(loop);
		}
	});

	onDestroy(() => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('resize', resize);
			if (animationFrameId) {
				cancelAnimationFrame(animationFrameId);
			}
		}
	});
</script>

<div class="graph-container">
	<canvas
		bind:this={canvas}
		onmousedown={handleMouseDown}
		onmousemove={handleMouseMove}
		onmouseup={handleMouseUp}
		onmouseleave={handleMouseUp}
	></canvas>

	<!-- Interactive Glassmorphism Tooltip -->
	{#if hoveredNode}
		<div
			class="tooltip"
			style="left: {tooltipPos.x + 15}px; top: {tooltipPos.y + 15}px;"
		>
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
		background: radial-gradient(circle at center, #1e293b 0%, #0f172a 100%);
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
		cursor: grab;
	}

	canvas:active {
		cursor: grabbing;
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
