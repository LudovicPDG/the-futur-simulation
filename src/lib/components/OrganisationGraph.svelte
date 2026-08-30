<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import type { ProofData } from '$lib/simulation/Proof';

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

	let {
		organisations = [],
		onAddArgument
	}: {
		organisations: OrganisationData[];
		onAddArgument?: (mode: 'argument' | 'counter_argument', targetName: string, targetId?: string) => void;
	} = $props();

	// Proofs / Arguments state
	let showArguments = $state(false);
	let proofs = $state<ProofData[]>([]);
	let proofsPage = $state(1);
	let proofsTotalPages = $state(1);
	let proofsTotal = $state(0);
	let isLoadingProofs = $state(false);

	// Nested child proofs states: key = proofId_argument / proofId_counterArgument
	let childProofsMap = $state<Record<string, { list: ProofData[]; page: number; totalPages: number; total: number; isOpen: boolean; isLoading: boolean }>>({});

	async function loadProofsForNode(orgName: string, page: number = 1) {
		isLoadingProofs = true;
		try {
			const res = await fetch(`/api/proofs?targetId=${encodeURIComponent(orgName)}&page=${page}&pageSize=5`);
			const data = await res.json();
			if (data.proofs) {
				proofs = data.proofs;
				proofsPage = data.page;
				proofsTotalPages = data.totalPages;
				proofsTotal = data.total;
			}
		} catch (err) {
			console.error('Error fetching proofs:', err);
		} finally {
			isLoadingProofs = false;
		}
	}

	async function toggleChildProofs(proofId: string, type: 'argument' | 'counterArgument', page: number = 1) {
		const key = `${proofId}_${type}`;
		const current = childProofsMap[key] || { list: [], page: 1, totalPages: 1, total: 0, isOpen: false, isLoading: false };
		
		if (current.isOpen && page === current.page) {
			// Toggle close
			childProofsMap = {
				...childProofsMap,
				[key]: { ...current, isOpen: false }
			};
			return;
		}

		childProofsMap = {
			...childProofsMap,
			[key]: { ...current, isLoading: true, isOpen: true }
		};

		try {
			const res = await fetch(`/api/proofs?proofId=${encodeURIComponent(proofId)}&type=${type}&page=${page}&pageSize=5`);
			const data = await res.json();
			if (data.proofs) {
				childProofsMap = {
					...childProofsMap,
					[key]: {
						list: data.proofs,
						page: data.page,
						totalPages: data.totalPages,
						total: data.total,
						isOpen: true,
						isLoading: false
					}
				};
			}
		} catch (err) {
			console.error('Error fetching child proofs:', err);
			childProofsMap = {
				...childProofsMap,
				[key]: { ...current, isLoading: false, isOpen: true }
			};
		}
	}

	function getProofLocalized(proof: ProofData, field: 'name' | 'description'): string {
		const lang = typeof getLocale === 'function' ? getLocale() : 'fr';
		const key = `${field}_${lang}` as keyof ProofData;
		const val = proof[key];
		if (typeof val === 'string' && val.trim().length > 0) return val;
		return (proof[`${field}_fr` as keyof ProofData] as string) || (proof[`${field}_en` as keyof ProofData] as string) || '';
	}


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

		const scale = Math.min(1, Math.max(0.65, containerWidth / 800));

		const baseRadius = 18 + Math.sqrt(members) * 5.5;

		return Math.max(16, Math.min(75, baseRadius * scale));
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
		const tooltip = tooltipElement;

		if (!svg || !tooltip) return;

		const ctm = svg.getScreenCTM();
		if (!ctm) return;

		const point = new DOMPoint(selectedNode.x, selectedNode.y);
		const screenPoint = point.matrixTransform(ctm);

		const margin = 12;
		const gap = 15;

		const tooltipRect = tooltip.getBoundingClientRect();

		const tooltipWidth = tooltipRect.width;
		const tooltipHeight = tooltipRect.height;

		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		let x = screenPoint.x + selectedNode.radius + gap;
		let y = screenPoint.y - selectedNode.radius;

		// Pas assez de place à droite → gauche
		if (x + tooltipWidth > viewportWidth - margin) {
			x = screenPoint.x - selectedNode.radius - gap - tooltipWidth;
		}

		// Toujours hors écran horizontalement → centrer
		if (x < margin) {
			x = Math.max(
				margin,
				Math.min(screenPoint.x - tooltipWidth / 2, viewportWidth - tooltipWidth - margin)
			);
		}

		// Verticalement
		if (y + tooltipHeight > viewportHeight - margin) {
			y = viewportHeight - tooltipHeight - margin;
		}

		if (y < margin) {
			y = margin;
		}

		tooltipPos = { x, y };
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

		if (activeDraggedNode && dragTargetX !== null && dragTargetY !== null) {
			activeDraggedNode.x = dragTargetX;
			activeDraggedNode.y = dragTargetY;

			activeDraggedNode.vx = 0;
			activeDraggedNode.vy = 0;
		}

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

		const svg = graphContainer?.querySelector('svg');

		if (svg) {
			try {
				svg.setPointerCapture(e.pointerId);
			} catch {
				// Le pointeur peut déjà avoir été capturé ou être invalide.
			}
		}

		// Attendre que Svelte ait créé le tooltip dans le DOM
		requestAnimationFrame(() => {
			updateSelectedTooltipPosition();
		});

		startPhysics();
	}

	let dragTargetX: number | null = null;
	let dragTargetY: number | null = null;

	function handlePointerMove(e: PointerEvent) {
		if (activeDraggedNode && e.pointerId === dragPointerId) {
			const svgElement = (e.currentTarget as Element).closest('svg');

			if (svgElement) {
				const rect = svgElement.getBoundingClientRect();

				dragTargetX = Math.max(
					activeDraggedNode.radius,
					Math.min(rect.width - activeDraggedNode.radius, e.clientX - rect.left)
				);

				dragTargetY = Math.max(
					activeDraggedNode.radius,
					Math.min(rect.height - activeDraggedNode.radius, e.clientY - rect.top)
				);
			}

			return;
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
		if (!activeDraggedNode || e.pointerId !== dragPointerId) return;

		activeDraggedNode.isDragging = false;

		activeDraggedNode = null;
		dragPointerId = null;

		dragTargetX = null;
		dragTargetY = null;
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

			<!-- Proofs / Arguments Section -->
			<div class="proofs-section">
				<div class="proofs-header-actions">
					<button
						type="button"
						class="toggle-proofs-btn"
						onclick={() => {
							showArguments = !showArguments;
							if (showArguments) {
								loadProofsForNode(name, 1);
							}
						}}
					>
						<span>{showArguments ? 'Masquer les arguments' : 'Afficher les arguments'}</span>
						{#if proofsTotal > 0}
							<span class="proofs-count-badge">{proofsTotal}</span>
						{/if}
					</button>

					<button
						type="button"
						class="add-proof-quick-btn"
						title="Créer un argument sur cette organisation"
						onclick={() => onAddArgument?.('argument', name, activeNode.id)}
					>
						+ Argument
					</button>
				</div>

				{#if showArguments}
					<div class="proofs-content">
						{#if isLoadingProofs}
							<div class="proofs-loading">Chargement des arguments...</div>
						{:else if proofs.length === 0}
							<div class="proofs-empty">
								<p>Aucun argument pour le moment.</p>
								<div class="proof-actions-row">
									<button
										type="button"
										class="action-btn argument-btn"
										onclick={() => onAddArgument?.('argument', name, activeNode.id)}
									>
										Ajouter un argument
									</button>
									<button
										type="button"
										class="action-btn counter-btn"
										onclick={() => onAddArgument?.('counter_argument', name, activeNode.id)}
									>
										Ajouter un contre-argument
									</button>
								</div>
							</div>
						{:else}
							<div class="proofs-list">
								{#each proofs as proof (proof.id || proof.name_fr)}
									{@const pName = getProofLocalized(proof, 'name')}
									{@const pDesc = getProofLocalized(proof, 'description')}
									{@const argKey = `${proof.id}_argument`}
									{@const counterKey = `${proof.id}_counterArgument`}
									{@const childArgs = childProofsMap[argKey]}
									{@const childCounters = childProofsMap[counterKey]}

									<div class="proof-card">
										<div class="proof-title-row">
											<span class="proof-title">{pName}</span>
											<div class="proof-metrics">
												<span class="proof-credibility" title="Crédibilité: {proof.credibility}%">
													{proof.credibility}% ⭐
												</span>
												<span
													class="proof-impact"
													class:positive={proof.impact >= 0}
													class:negative={proof.impact < 0}
													title="Impact: {proof.impact}"
												>
													{proof.impact > 0 ? `+${proof.impact}` : proof.impact} ⚡
												</span>
											</div>
										</div>

										<p class="proof-desc">{pDesc}</p>

										{#if proof.source && proof.source.length > 0}
											<div class="proof-sources">
												<span class="sources-label">Sources:</span>
												{#each proof.source as src}
													<span class="source-tag">{src}</span>
												{/each}
											</div>
										{/if}

										<!-- Action buttons for this proof -->
										<div class="proof-interactive-bar">
											<!-- View argument / counter-argument toggles -->
											<button
												type="button"
												class="sub-toggle-btn"
												class:active={childArgs?.isOpen}
												onclick={() => proof.id && toggleChildProofs(proof.id, 'argument', childArgs?.page || 1)}
											>
												Arguments {childArgs?.total ? `(${childArgs.total})` : ''}
											</button>
											<button
												type="button"
												class="sub-toggle-btn"
												class:active={childCounters?.isOpen}
												onclick={() => proof.id && toggleChildProofs(proof.id, 'counterArgument', childCounters?.page || 1)}
											>
												Contre-arguments {childCounters?.total ? `(${childCounters.total})` : ''}
											</button>

											<!-- Add argument / counter-argument buttons -->
											<button
												type="button"
												class="mini-action-btn add-arg"
												onclick={() => onAddArgument?.('argument', pName, proof.id)}
												title="Ajouter un argument"
											>
												+ Arg
											</button>
											<button
												type="button"
												class="mini-action-btn add-counter"
												onclick={() => onAddArgument?.('counter_argument', pName, proof.id)}
												title="Ajouter un contre-argument"
											>
												+ Contre
											</button>
										</div>

										<!-- Sub-list of Arguments (Paginated 5 per 5) -->
										{#if childArgs?.isOpen}
											<div class="sub-proofs-tree">
												<span class="sub-tree-title">Arguments en faveur :</span>
												{#if childArgs.isLoading}
													<div class="sub-loading">Chargement...</div>
												{:else if childArgs.list.length === 0}
													<div class="sub-empty">Aucun sous-argument pour le moment.</div>
												{:else}
													{#each childArgs.list as child (child.id || child.name_fr)}
														<div class="sub-proof-item argument-item">
															<div class="sub-proof-header">
																<span class="sub-name">{getProofLocalized(child, 'name')}</span>
																<span class="sub-badge">{child.credibility}% ⭐</span>
															</div>
															<p class="sub-desc">{getProofLocalized(child, 'description')}</p>
														</div>
													{/each}

													{#if childArgs.totalPages > 1}
														<div class="sub-pagination">
															<button
																type="button"
																disabled={childArgs.page <= 1}
																onclick={() => proof.id && toggleChildProofs(proof.id, 'argument', childArgs.page - 1)}
															>
																◀
															</button>
															<span>{childArgs.page} / {childArgs.totalPages}</span>
															<button
																type="button"
																disabled={childArgs.page >= childArgs.totalPages}
																onclick={() => proof.id && toggleChildProofs(proof.id, 'argument', childArgs.page + 1)}
															>
																▶
															</button>
														</div>
													{/if}
												{/if}
											</div>
										{/if}

										<!-- Sub-list of Counter-Arguments (Paginated 5 per 5) -->
										{#if childCounters?.isOpen}
											<div class="sub-proofs-tree counter-tree">
												<span class="sub-tree-title">Contre-arguments :</span>
												{#if childCounters.isLoading}
													<div class="sub-loading">Chargement...</div>
												{:else if childCounters.list.length === 0}
													<div class="sub-empty">Aucun contre-argument pour le moment.</div>
												{:else}
													{#each childCounters.list as child (child.id || child.name_fr)}
														<div class="sub-proof-item counter-item">
															<div class="sub-proof-header">
																<span class="sub-name">{getProofLocalized(child, 'name')}</span>
																<span class="sub-badge">{child.credibility}% ⭐</span>
															</div>
															<p class="sub-desc">{getProofLocalized(child, 'description')}</p>
														</div>
													{/each}

													{#if childCounters.totalPages > 1}
														<div class="sub-pagination">
															<button
																type="button"
																disabled={childCounters.page <= 1}
																onclick={() => proof.id && toggleChildProofs(proof.id, 'counterArgument', childCounters.page - 1)}
															>
																◀
															</button>
															<span>{childCounters.page} / {childCounters.totalPages}</span>
															<button
																type="button"
																disabled={childCounters.page >= childCounters.totalPages}
																onclick={() => proof.id && toggleChildProofs(proof.id, 'counterArgument', childCounters.page + 1)}
															>
																▶
															</button>
														</div>
													{/if}
												{/if}
											</div>
										{/if}
									</div>
								{/each}

								<!-- Main Proofs Pagination (5 per 5) -->
								{#if proofsTotalPages > 1}
									<div class="proofs-pagination">
										<button
											type="button"
											class="page-btn"
											disabled={proofsPage <= 1}
											onclick={() => loadProofsForNode(name, proofsPage - 1)}
										>
											Précédent
										</button>
										<span class="page-indicator">Page {proofsPage} / {proofsTotalPages}</span>
										<button
											type="button"
											class="page-btn"
											disabled={proofsPage >= proofsTotalPages}
											onclick={() => loadProofsForNode(name, proofsPage + 1)}
										>
											Suivant
										</button>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			</div>
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
		-webkit-user-select: none;
		touch-action: none;
	}

	.node-group {
		cursor: grab;
		transition: transform 0.05s linear;
		touch-action: none;
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

		min-width: 0;
		width: min(320px, calc(100vw - 24px));
		max-width: calc(100vw - 24px);

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

	/* Proofs & Arguments Styling */
	.proofs-section {
		margin-top: 10px;
		border-top: 1px solid rgba(255, 255, 255, 0.12);
		padding-top: 8px;
	}

	.proofs-header-actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 6px;
	}

	.toggle-proofs-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		background: rgba(59, 130, 246, 0.2);
		border: 1px solid rgba(59, 130, 246, 0.4);
		color: #93c5fd;
		padding: 4px 10px;
		border-radius: 8px;
		font-size: 11px;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.toggle-proofs-btn:hover {
		background: rgba(59, 130, 246, 0.35);
	}

	.proofs-count-badge {
		background: #3b82f6;
		color: white;
		border-radius: 10px;
		padding: 0 5px;
		font-size: 10px;
	}

	.add-proof-quick-btn {
		background: rgba(239, 68, 68, 0.2);
		border: 1px solid rgba(239, 68, 68, 0.4);
		color: #fca5a5;
		padding: 4px 8px;
		border-radius: 8px;
		font-size: 11px;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.add-proof-quick-btn:hover {
		background: rgba(239, 68, 68, 0.35);
	}

	.proofs-content {
		margin-top: 8px;
	}

	.proofs-loading,
	.proofs-empty {
		font-size: 11px;
		color: #94a3b8;
		padding: 6px 0;
	}

	.proof-actions-row {
		display: flex;
		gap: 6px;
		margin-top: 6px;
	}

	.action-btn {
		padding: 4px 8px;
		border-radius: 6px;
		font-size: 10px;
		font-weight: 600;
		cursor: pointer;
		border: none;
	}

	.argument-btn {
		background: rgba(34, 197, 94, 0.2);
		border: 1px solid rgba(34, 197, 94, 0.4);
		color: #86efac;
	}

	.counter-btn {
		background: rgba(239, 68, 68, 0.2);
		border: 1px solid rgba(239, 68, 68, 0.4);
		color: #fca5a5;
	}

	.proofs-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.proof-card {
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		padding: 8px;
	}

	.proof-title-row {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 6px;
		margin-bottom: 4px;
	}

	.proof-title {
		font-size: 12px;
		font-weight: 600;
		color: #f8fafc;
		line-height: 1.3;
	}

	.proof-metrics {
		display: flex;
		gap: 4px;
		flex-shrink: 0;
	}

	.proof-credibility {
		font-size: 10px;
		background: rgba(234, 179, 8, 0.2);
		color: #fde047;
		padding: 1px 4px;
		border-radius: 4px;
	}

	.proof-impact {
		font-size: 10px;
		padding: 1px 4px;
		border-radius: 4px;
	}

	.proof-impact.positive {
		background: rgba(34, 197, 94, 0.2);
		color: #86efac;
	}

	.proof-impact.negative {
		background: rgba(239, 68, 68, 0.2);
		color: #fca5a5;
	}

	.proof-desc {
		font-size: 11px;
		color: #cbd5e1;
		line-height: 1.35;
		margin-bottom: 6px;
	}

	.proof-sources {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-bottom: 6px;
	}

	.sources-label {
		font-size: 10px;
		color: #94a3b8;
	}

	.source-tag {
		font-size: 9px;
		background: rgba(255, 255, 255, 0.08);
		color: #cbd5e1;
		padding: 1px 4px;
		border-radius: 3px;
	}

	.proof-interactive-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 4px;
		padding-top: 4px;
		border-top: 1px solid rgba(255, 255, 255, 0.05);
	}

	.sub-toggle-btn {
		font-size: 10px;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: #cbd5e1;
		padding: 2px 6px;
		border-radius: 4px;
		cursor: pointer;
	}

	.sub-toggle-btn.active {
		background: rgba(59, 130, 246, 0.3);
		border-color: #3b82f6;
		color: #93c5fd;
	}

	.mini-action-btn {
		font-size: 10px;
		padding: 2px 5px;
		border-radius: 4px;
		border: none;
		cursor: pointer;
		font-weight: 600;
	}

	.mini-action-btn.add-arg {
		background: rgba(34, 197, 94, 0.25);
		color: #86efac;
	}

	.mini-action-btn.add-counter {
		background: rgba(239, 68, 68, 0.25);
		color: #fca5a5;
	}

	.sub-proofs-tree {
		margin-top: 6px;
		padding: 6px;
		background: rgba(0, 0, 0, 0.25);
		border-left: 2px solid #22c55e;
		border-radius: 4px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.sub-proofs-tree.counter-tree {
		border-left-color: #ef4444;
	}

	.sub-tree-title {
		font-size: 10px;
		font-weight: 600;
		color: #94a3b8;
	}

	.sub-proof-item {
		background: rgba(255, 255, 255, 0.03);
		padding: 4px 6px;
		border-radius: 4px;
	}

	.sub-proof-header {
		display: flex;
		justify-content: space-between;
		font-size: 10px;
		font-weight: 600;
		color: #e2e8f0;
	}

	.sub-desc {
		font-size: 10px;
		color: #94a3b8;
		margin-top: 2px;
	}

	.sub-pagination,
	.proofs-pagination {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 8px;
		margin-top: 6px;
		font-size: 10px;
		color: #94a3b8;
	}

	.page-btn {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.15);
		color: #f8fafc;
		padding: 2px 8px;
		border-radius: 4px;
		cursor: pointer;
		font-size: 10px;
	}

	.page-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>

