<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import { getLocale } from '$lib/paraglide/runtime.js';

	export interface OrganisationData {
		name: string;
		description: string;
		type: string;
		objective?: string[];
		name_fr?: string;
		name_en?: string;
		name_de?: string;
		name_es?: string;
		description_fr?: string;
		description_en?: string;
		description_de?: string;
		description_es?: string;
		type_fr?: string;
		type_en?: string;
		type_de?: string;
		type_es?: string;
		objective_fr?: string[];
		objective_en?: string[];
		objective_de?: string[];
		objective_es?: string[];
		satisfaction: number;
		resource: {
			human: number;
			financial?: number;
			material?: Array<{
				name: string;
				name_fr?: string;
				name_en?: string;
				name_de?: string;
				name_es?: string;
				description_fr?: string;
				description_en?: string;
				description_de?: string;
				description_es?: string;
				quantity: number;
				value?: number;
			}>;
		};
	}

	let { organisations = [] }: { organisations: OrganisationData[] } = $props();

	function getLocalized<T>(
		org: OrganisationData,
		field: 'name' | 'description' | 'type' | 'objective'
	): T {
		const lang = typeof getLocale === 'function' ? getLocale() : 'fr';
		const key = `${field}_${lang}` as keyof OrganisationData;
		const val = org[key];
		if (val && (typeof val === 'string' ? val.trim().length > 0 : (val as string[]).length > 0)) {
			return val as T;
		}
		// Fallback to fr, then en, then default single field
		const frVal = org[`${field}_fr` as keyof OrganisationData];
		if (
			frVal &&
			(typeof frVal === 'string' ? frVal.trim().length > 0 : (frVal as string[]).length > 0)
		) {
			return frVal as T;
		}
		const enVal = org[`${field}_en` as keyof OrganisationData];
		if (
			enVal &&
			(typeof enVal === 'string' ? enVal.trim().length > 0 : (enVal as string[]).length > 0)
		) {
			return enVal as T;
		}
		return (org[field] ?? (field === 'objective' ? [] : '')) as T;
	}

	function getLocalizedMaterialName(
		material: NonNullable<OrganisationData['resource']['material']>[number]
	): string {
		const lang = typeof getLocale === 'function' ? getLocale() : 'fr';
		const localizedName = material[`name_${lang}` as keyof typeof material];
		if (typeof localizedName === 'string' && localizedName.trim().length > 0) {
			return localizedName;
		}

		return material.name_fr?.trim() || material.name_en?.trim() || material.name;
	}

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
	let selectedNode = $state<GraphNode | null>(null);
	let tooltipPos = $state({ x: 0, y: 0 });
	let tooltipElement = $state<HTMLDivElement | null>(null);
	let graphContainer = $state<HTMLElement | null>(null);

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

	function updateSelectedTooltipPosition() {
		if (!selectedNode || !graphContainer) return;

		const svg = graphContainer.querySelector('svg');
		if (!svg) return;

		// Convertit les coordonnées du node dans le SVG
		// en coordonnées écran (viewport)
		const point = new DOMPoint(selectedNode.x, selectedNode.y);
		const screenPoint = point.matrixTransform(svg.getScreenCTM()!);

		tooltipPos = {
			x: screenPoint.x + selectedNode.radius + 15,
			y: screenPoint.y - selectedNode.radius
		};
	}
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

		if (selectedNode) {
			updateSelectedTooltipPosition();
		}

		if (shouldContinue && isRunning) {
			animationFrameId = requestAnimationFrame(loop);
		} else {
			stopPhysics();
		}
	}

	onMount(() => {
		startPhysics();
		const handleDocumentPointerDown = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			const clickedInsideNode = target.closest('.node-group');
			const clickedInsideTooltip = target.closest('[data-tooltip="organisation"]');
			if (selectedNode && !clickedInsideNode && !clickedInsideTooltip) {
				selectedNode = null;
				hoveredNode = null;
			}
		};

		document.addEventListener('pointerdown', handleDocumentPointerDown, true);
		return () => {
			document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
		};
	});

	onDestroy(() => {
		stopPhysics();
	});

	// Dragging with Pointer Events
	let activeDraggedNode: GraphNode | null = null;
	let dragPointerId: number | null = null;

	function handlePointerDown(node: GraphNode, e: PointerEvent) {
		e.stopPropagation();

		selectedNode = node;
		hoveredNode = node;

		activeDraggedNode = node;
		node.isDragging = true;
		dragPointerId = e.pointerId;

		(e.currentTarget as Element)?.setPointerCapture?.(e.pointerId);

		updateSelectedTooltipPosition();
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

		if (hoveredNode && !selectedNode) {
			updateTooltipPosition(e.clientX, e.clientY);
		}
	}

	function updateTooltipPosition(cursorX: number, cursorY: number) {
		const margin = 12;
		const gap = 15;
		const preferredX = cursorX + gap;
		const preferredY = cursorY + gap;

		tooltipPos = { x: preferredX, y: preferredY };

		if (typeof window === 'undefined') return;

		requestAnimationFrame(() => {
			const tooltip = tooltipElement;
			if (!tooltip) return;

			const { width, height } = tooltip.getBoundingClientRect();
			const maxX = Math.max(margin, window.innerWidth - width - margin);
			const maxY = Math.max(margin, window.innerHeight - height - margin);

			tooltipPos = {
				x: Math.max(margin, Math.min(preferredX, maxX)),
				y: Math.max(margin, Math.min(preferredY, maxY))
			};
		});
	}

	function handlePointerUp(e: PointerEvent) {
		if (activeDraggedNode && e.pointerId === dragPointerId) {
			activeDraggedNode.isDragging = false;
			activeDraggedNode = null;
			dragPointerId = null;
		}
	}

	function openTooltipFor(node: GraphNode) {
		selectedNode = node;
		hoveredNode = node;
		updateSelectedTooltipPosition();
	}
</script>

<div
	class="graph-container"
	bind:this={graphContainer}
	bind:clientWidth={containerWidth}
	bind:clientHeight={containerHeight}
>
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
						if (selectedNode) return;
						hoveredNode = node;
						updateTooltipPosition(e.clientX, e.clientY);
					}}
					onpointerleave={() => {
						if (!selectedNode && hoveredNode?.id === node.id) hoveredNode = null;
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
						{@const displayName = getLocalized<string>(node.data, 'name')}
						<text
							text-anchor="middle"
							dominant-baseline="central"
							fill="#ffffff"
							font-size={Math.max(11, Math.min(16, node.radius * 0.45))}
							font-weight="600"
							class="node-text"
						>
							{displayName.length > 18 ? displayName.slice(0, 16) + '...' : displayName}
						</text>
					{/if}
				</g>
			{/each}
		</g>
	</svg>

	<!-- Glassmorphism Tooltip -->
	{#if selectedNode}
		{@const activeNode = selectedNode}
		{@const name = getLocalized<string>(activeNode.data, 'name')}
		{@const type = getLocalized<string>(activeNode.data, 'type')}
		{@const description = getLocalized<string>(activeNode.data, 'description')}
		{@const objectives = getLocalized<string[]>(activeNode.data, 'objective')}
		{@const materialResources = activeNode.data.resource?.material ?? []}
		<div
			bind:this={tooltipElement}
			class="tooltip"
			data-tooltip="organisation"
			role="dialog"
			aria-label="Détails de l'organisation"
			style="left: {tooltipPos.x}px; top: {tooltipPos.y}px;"
			onpointerdown={(e) => e.stopPropagation()}
		>
			<div class="tooltip-header">
				<span class="tooltip-title">{name}</span>
				<span class="type-badge">{type || 'Organisation'}</span>
			</div>

			<p class="tooltip-desc">{description || 'Aucune description disponible.'}</p>

			<div class="tooltip-stats">
				<div class="stat-item">
					<span class="stat-label">Membres:</span>
					<span class="stat-value">{activeNode.data.resource?.human ?? 1} 👤</span>
				</div>

				<div class="stat-item">
					<span class="stat-label">Satisfaction:</span>
					<div class="satisfaction-badge" style="background-color: {activeNode.color};">
						{activeNode.data.satisfaction ?? 50}%
					</div>
				</div>

				{#if activeNode.data.resource?.financial}
					<div class="stat-item">
						<span class="stat-label">Budget:</span>
						<span class="stat-value">{activeNode.data.resource.financial} 🪙</span>
					</div>
				{/if}
			</div>

			{#if objectives && objectives.length > 0}
				<div class="objectives">
					<span class="stat-label">Objectifs:</span>
					<div class="tags">
						{#each objectives as obj}
							<span class="tag">{obj}</span>
						{/each}
					</div>
				</div>
			{/if}

			{#if materialResources.length > 0}
				<div class="material-resources">
					<span class="stat-label">Ressources matérielles:</span>
					<div class="material-list">
						{#each materialResources as material, index (material.name + index)}
							<div class="material-item">
								<span class="material-name">{getLocalizedMaterialName(material)}</span>
								<span class="material-quantity">x{material.quantity}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{:else if hoveredNode}
		{@const activeNode = hoveredNode}
		{@const name = getLocalized<string>(activeNode.data, 'name')}
		{@const type = getLocalized<string>(activeNode.data, 'type')}
		{@const description = getLocalized<string>(activeNode.data, 'description')}
		{@const objectives = getLocalized<string[]>(activeNode.data, 'objective')}
		{@const materialResources = activeNode.data.resource?.material ?? []}
		<div
			bind:this={tooltipElement}
			class="tooltip"
			data-tooltip="organisation"
			role="dialog"
			aria-label="Détails de l'organisation"
			tabindex="0"
			style="left: {tooltipPos.x}px; top: {tooltipPos.y}px;"
			onpointerdown={(e) => e.stopPropagation()}
		>
			<div class="tooltip-header">
				<span class="tooltip-title">{name}</span>
				<span class="type-badge">{type || 'Organisation'}</span>
			</div>

			<p class="tooltip-desc">{description || 'Aucune description disponible.'}</p>

			<div class="tooltip-stats">
				<div class="stat-item">
					<span class="stat-label">Membres:</span>
					<span class="stat-value">{activeNode.data.resource?.human ?? 1} 👤</span>
				</div>

				<div class="stat-item">
					<span class="stat-label">Satisfaction:</span>
					<div class="satisfaction-badge" style="background-color: {activeNode.color};">
						{activeNode.data.satisfaction ?? 50}%
					</div>
				</div>

				{#if activeNode.data.resource?.financial}
					<div class="stat-item">
						<span class="stat-label">Budget:</span>
						<span class="stat-value">{activeNode.data.resource.financial} 🪙</span>
					</div>
				{/if}
			</div>

			{#if objectives && objectives.length > 0}
				<div class="objectives">
					<span class="stat-label">Objectifs:</span>
					<div class="tags">
						{#each objectives as obj}
							<span class="tag">{obj}</span>
						{/each}
					</div>
				</div>
			{/if}

			{#if materialResources.length > 0}
				<div class="material-resources">
					<span class="stat-label">Ressources matérielles:</span>
					<div class="material-list">
						{#each materialResources as material, index (material.name + index)}
							<div class="material-item">
								<span class="material-name">{getLocalizedMaterialName(material)}</span>
								<span class="material-quantity">x{material.quantity}</span>
							</div>
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

	.node-text {
		user-select: none;
		pointer-events: none;
	}

	.tooltip {
		position: fixed;
		z-index: 100;
		pointer-events: auto;
		touch-action: pan-y;

		min-width: 240px;
		max-width: min(320px, calc(100vw - 24px));
		max-height: min(400px, calc(100vh - 24px));
		box-sizing: border-box;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 14px 16px;
		word-break: break-word;
		overflow-wrap: anywhere;

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
		line-height: 1.35;
		word-break: break-word;
		overflow-wrap: anywhere;
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
		word-break: break-word;
		overflow-wrap: anywhere;
		white-space: normal;
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

	.material-resources {
		margin-top: 8px;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		padding-top: 6px;
	}

	.material-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 4px;
	}

	.material-item {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		font-size: 12px;
	}

	.material-name {
		color: #e2e8f0;
		word-break: break-word;
		overflow-wrap: anywhere;
		white-space: normal;
	}

	.material-quantity {
		flex-shrink: 0;
		color: #fbbf24;
		font-weight: 600;
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
		word-break: break-word;
		overflow-wrap: anywhere;
	}
</style>
