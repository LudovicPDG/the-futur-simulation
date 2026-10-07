<script lang="ts">
	import * as d3 from 'd3';
	import {
		evaluateSkewNormalMixture,
		evaluateSkewNormalMixtureCdf,
		skewNormalMixtureQuantile,
		type SkewNormalParameter
	} from '$lib/simulation/ProbabilityDistribution';
	import * as m from '$lib/paraglide/messages';

	interface Point {
		t: number;
		prob: number;
		density: number;
	}

	let {
		distribution,
		impossibility = 0,
		width = 320,
		height = 170
	}: {
		distribution?: SkewNormalParameter[] | string | unknown;
		impossibility?: number;
		width?: number;
		height?: number;
	} = $props();

	let svgRef = $state<SVGSVGElement | null>(null);
	let hoverT = $state<number | null>(null);
	let clickedT = $state<number | null>(null);

	// The active date (hovered or clicked)
	const activeT = $derived(hoverT ?? clickedT);

	// Normalize distribution props into a clean array of SkewNormalParameter
	const parsedMixture = $derived.by((): { parameters: SkewNormalParameter[]; error: string | null } => {
		if (!distribution) {
			return { parameters: [], error: null };
		}

		let rawList: unknown = distribution;

		// Handle potential stringified JSON (from legacy or DB payload)
		if (typeof rawList === 'string') {
			const trimmed = rawList.trim();
			if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
				try {
					rawList = JSON.parse(trimmed);
				} catch {
					return { parameters: [], error: 'Invalid distribution format' };
				}
			} else {
				return { parameters: [], error: null };
			}
		}

		const array = Array.isArray(rawList) ? rawList : [rawList];
		const parsed: SkewNormalParameter[] = [];

		for (const item of array) {
			if (typeof item === 'object' && item !== null) {
				const xi = Number((item as any).xi);
				const omega = Number((item as any).omega);
				const alpha = Number((item as any).alpha ?? 0);
				const weight = Number((item as any).weight ?? 1);

				if (!isNaN(xi) && !isNaN(omega) && omega > 0) {
					parsed.push({
						xi,
						omega,
						alpha: isNaN(alpha) ? 0 : alpha,
						weight: isNaN(weight) || weight <= 0 ? 1 : weight
					});
				}
			}
		}

		return {
			parameters: parsed,
			error: parsed.length === 0 && distribution ? 'No valid skew normal parameters' : null
		};
	});

	// Cumulative curve sampled over the central 90% of the mixture mass (5% to 95% quantiles).
	// A mixture of skew normals is unbounded, so the CDF accumulates from -infinity.
	const evaluatedData = $derived.by(() => {
		const mixture = parsedMixture.parameters;
		const possibilityFactor = 1 - Math.min(1, Math.max(0, impossibility));
		const empty = {
			points: [] as Point[],
			mixture: [] as SkewNormalParameter[],
			error: parsedMixture.error,
			tMin: 0,
			tMax: 1,
			possibilityFactor,
			totalWeight: 1
		};
		if (mixture.length === 0) return empty;

		try {
			let tMin = skewNormalMixtureQuantile(0.05, mixture);
			let tMax = skewNormalMixtureQuantile(0.95, mixture);
			if (tMax - tMin < 1e-3) {
				tMin -= 0.5;
				tMax += 0.5;
			}

			const steps = 160;
			const points: Point[] = [];
			for (let i = 0; i <= steps; i++) {
				const t = tMin + (i / steps) * (tMax - tMin);
				points.push({
					t,
					prob: evaluateSkewNormalMixtureCdf(t, mixture) * possibilityFactor,
					density: evaluateSkewNormalMixture(t, mixture)
				});
			}

			return {
				points,
				mixture,
				error: null,
				tMin,
				tMax,
				possibilityFactor,
				totalWeight: mixture.reduce((sum, comp) => sum + comp.weight, 0)
			};
		} catch (err: any) {
			return { ...empty, mixture, error: err?.message || 'Error evaluating distribution' };
		}
	});

	function formatDate(value: number, decimals = 0): string {
		return value.toFixed(decimals);
	}

	// D3 scales and paths. The y axis is always the full probability range [0, 1].
	const chartGeometry = $derived.by(() => {
		const margin = { top: 14, right: 16, bottom: 26, left: 38 };
		const innerWidth = Math.max(10, width - margin.left - margin.right);
		const innerHeight = Math.max(10, height - margin.top - margin.bottom);

		const pts = evaluatedData.points;
		if (pts.length === 0) {
			return {
				margin,
				innerWidth,
				innerHeight,
				xScale: null,
				yScale: null,
				pathD: '',
				areaD: '',
				densityD: '',
				impossibleY: 0,
				xTicks: [] as { value: number; x: number; label: string }[],
				yTicks: [] as { value: number; y: number; formatted: string }[]
			};
		}

		const xScale = d3
			.scaleLinear()
			.domain([evaluatedData.tMin, evaluatedData.tMax])
			.range([0, innerWidth]);

		const yScale = d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]);

		const lineGen = d3
			.line<Point>()
			.x((d: Point) => xScale(d.t))
			.y((d: Point) => yScale(d.prob))
			.curve(d3.curveMonotoneX);

		const areaGen = d3
			.area<Point>()
			.x((d: Point) => xScale(d.t))
			.y0(innerHeight)
			.y1((d: Point) => yScale(d.prob))
			.curve(d3.curveMonotoneX);

		// The density (bell shape) has its own scale: its peak is drawn at 85% of the reachable
		// probability so the shape stays readable next to the 0-1 cumulative axis.
		const maxDensity = d3.max(pts, (d: Point) => d.density) || 1;
		const densityHeight = 0.85 * evaluatedData.possibilityFactor;
		const densityGen = d3
			.area<Point>()
			.x((d: Point) => xScale(d.t))
			.y0(innerHeight)
			.y1((d: Point) => yScale((d.density / maxDensity) * densityHeight))
			.curve(d3.curveMonotoneX);

		const xTickValues = xScale.ticks(5);
		const integerTicks = xTickValues.every((v: number) => Number.isInteger(v));

		const xTicks = xTickValues.map((val: number) => ({
			value: val,
			x: xScale(val),
			label: formatDate(val, integerTicks ? 0 : 1)
		}));

		const yTicks = [0, 0.25, 0.5, 0.75, 1].map((val) => ({
			value: val,
			y: yScale(val),
			formatted: String(val)
		}));

		return {
			margin,
			innerWidth,
			innerHeight,
			xScale,
			yScale,
			pathD: lineGen(pts) || '',
			areaD: areaGen(pts) || '',
			densityD: densityGen(pts) || '',
			impossibleY: yScale(evaluatedData.possibilityFactor),
			xTicks,
			yTicks
		};
	});

	// Cumulative probability P(date <= t) at the hovered / clicked date
	const activeData = $derived.by(() => {
		if (
			activeT === null ||
			!chartGeometry.xScale ||
			!chartGeometry.yScale ||
			evaluatedData.points.length === 0
		) {
			return null;
		}

		const t = Math.max(evaluatedData.tMin, Math.min(evaluatedData.tMax, activeT));
		const prob =
			evaluateSkewNormalMixtureCdf(t, evaluatedData.mixture) * evaluatedData.possibilityFactor;

		return {
			t,
			prob,
			pct: prob * 100,
			markerX: chartGeometry.xScale(t) + chartGeometry.margin.left,
			markerY: chartGeometry.yScale(prob) + chartGeometry.margin.top
		};
	});

	function pointerToT(event: PointerEvent | MouseEvent): number | null {
		if (!svgRef || !chartGeometry.xScale) return null;
		const rect = svgRef.getBoundingClientRect();
		// The svg is scaled by CSS, so convert the pointer into viewBox units first
		const mouseX = ((event.clientX - rect.left) / rect.width) * width - chartGeometry.margin.left;
		if (mouseX < 0 || mouseX > chartGeometry.innerWidth) return null;
		return chartGeometry.xScale.invert(mouseX);
	}

	function handlePointerMove(event: PointerEvent) {
		hoverT = pointerToT(event);
	}

	function handlePointerLeave() {
		hoverT = null;
	}

	function handleClick(event: MouseEvent) {
		const clicked = pointerToT(event);
		if (clicked === null) {
			clickedT = null;
			return;
		}
		// Toggle if clicking the same date
		const tolerance = (evaluatedData.tMax - evaluatedData.tMin) * 0.02;
		clickedT = clickedT !== null && Math.abs(clickedT - clicked) < tolerance ? null : clicked;
	}

	function formatNumber(value: number): string {
		return String(Math.round(value * 100) / 100);
	}

	function asymmetryArrow(alpha: number): string {
		if (alpha > 0.05) return '→';
		if (alpha < -0.05) return '←';
		return '↔';
	}

	function asymmetryHint(alpha: number): string {
		if (alpha > 0.05) return m.simulation_distribution_later();
		if (alpha < -0.05) return m.simulation_distribution_earlier();
		return '';
	}
</script>

<div class="distribution-container">
	{#if evaluatedData.error}
		<div class="error-badge">
			<span class="error-icon">⚠️</span>
			<span class="error-text">{evaluatedData.error}</span>
		</div>
	{:else if evaluatedData.points.length > 0}
		<!-- One card per scenario of the mixture -->
		<p class="mixture-intro">{m.simulation_distribution_intro()}</p>
		<div class="mixture-summary">
			{#each evaluatedData.mixture as comp}
				<div class="component-card">
					<div class="component-field">
						<span class="field-label">{m.simulation_distribution_date()} <span class="symbol">(ξ)</span></span>
						<span class="field-value date">{formatNumber(comp.xi)}</span>
					</div>
					<div class="component-field" title={m.simulation_distribution_certainty_hint()}>
						<span class="field-label">{m.simulation_distribution_certainty()} <span class="symbol">(ω)</span></span>
						<span class="field-value">{formatNumber(comp.omega)}</span>
					</div>
					<div class="component-field" title={asymmetryHint(comp.alpha)}>
						<span class="field-label">{m.simulation_distribution_asymmetry()} <span class="symbol">(α)</span></span>
						<span class="field-value">{asymmetryArrow(comp.alpha)} {formatNumber(comp.alpha)}</span>
					</div>
					<div class="component-field">
						<span class="field-label">{m.simulation_distribution_weight()}</span>
						<span class="field-value">
							{formatNumber((comp.weight / evaluatedData.totalWeight) * 100)}%
						</span>
					</div>
				</div>
			{/each}
		</div>

		<div class="chart-wrapper">
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<svg
				bind:this={svgRef}
				viewBox="0 0 {width} {height}"
				class="distribution-chart"
				onpointermove={handlePointerMove}
				onpointerleave={handlePointerLeave}
				onclick={handleClick}
			>
				<defs>
					<linearGradient id="probAreaGrad" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stop-color="#38bdf8" stop-opacity="0.3" />
						<stop offset="100%" stop-color="#38bdf8" stop-opacity="0.03" />
					</linearGradient>

					<linearGradient id="probLineGrad" x1="0" y1="0" x2="1" y2="0">
						<stop offset="0%" stop-color="#38bdf8" />
						<stop offset="100%" stop-color="#818cf8" />
					</linearGradient>
				</defs>

				<g transform="translate({chartGeometry.margin.left}, {chartGeometry.margin.top})">
					<!-- Horizontal grid lines -->
					{#each chartGeometry.yTicks as tick}
						<line x1="0" y1={tick.y} x2={chartGeometry.innerWidth} y2={tick.y} class="grid-line" />
						<text x="-6" y={tick.y + 3} class="axis-label y-axis">{tick.formatted}</text>
					{/each}

					<!-- Vertical grid & X-axis labels (dates) -->
					{#each chartGeometry.xTicks as tick}
						<line
							x1={tick.x}
							y1="0"
							x2={tick.x}
							y2={chartGeometry.innerHeight}
							class="grid-line x-grid"
						/>
						<text x={tick.x} y={chartGeometry.innerHeight + 16} class="axis-label x-axis"
							>{tick.label}</text
						>
					{/each}

					<!-- Impossible zone: above the maximum reachable probability (1 - impossibility) -->
					{#if impossibility > 0}
						<rect
							x="0"
							y="0"
							width={chartGeometry.innerWidth}
							height={Math.max(0, chartGeometry.impossibleY)}
							class="impossible-area"
						>
							<title>{m.simulation_distribution_impossible()}</title>
						</rect>
						<line
							x1="0"
							y1={chartGeometry.impossibleY}
							x2={chartGeometry.innerWidth}
							y2={chartGeometry.impossibleY}
							class="impossible-line"
						/>
					{/if}

					<!-- Density bell shape (own scale) -->
					{#if chartGeometry.densityD}
						<path d={chartGeometry.densityD} class="density-area" />
					{/if}

					<!-- Area under the cumulative curve -->
					{#if chartGeometry.areaD}
						<path d={chartGeometry.areaD} fill="url(#probAreaGrad)" />
					{/if}

					<!-- Cumulative distribution curve -->
					{#if chartGeometry.pathD}
						<path
							d={chartGeometry.pathD}
							fill="none"
							stroke="url(#probLineGrad)"
							stroke-width="2.2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					{/if}

					<!-- Active vertical and horizontal guides -->
					{#if activeData}
						<line
							x1={chartGeometry.xScale?.(activeData.t)}
							y1="0"
							x2={chartGeometry.xScale?.(activeData.t)}
							y2={chartGeometry.innerHeight}
							class="active-t-line"
						/>
						<line
							x1="0"
							y1={chartGeometry.yScale?.(activeData.prob)}
							x2={chartGeometry.xScale?.(activeData.t)}
							y2={chartGeometry.yScale?.(activeData.prob)}
							class="active-t-line"
						/>
					{/if}

					<!-- Bottom & Left axis lines -->
					<line
						x1="0"
						y1={chartGeometry.innerHeight}
						x2={chartGeometry.innerWidth}
						y2={chartGeometry.innerHeight}
						class="axis-line"
					/>
					<line x1="0" y1="0" x2="0" y2={chartGeometry.innerHeight} class="axis-line" />
				</g>

				<!-- Highlight Circle Marker -->
				{#if activeData}
					<g transform="translate({activeData.markerX}, {activeData.markerY})">
						<circle r="6" fill="#38bdf8" opacity="0.3" class="ping-circle" />
						<circle r="4" fill="#06b6d4" stroke="#ffffff" stroke-width="1.8" />
					</g>
				{/if}
			</svg>

			{#if activeData}
				<div class="tooltip-layer">
				<div
					class="chart-tooltip"
					class:align-left={activeData.markerX / width < 0.25}
					class:align-right={activeData.markerX / width > 0.75}
					style="left: {(activeData.markerX / width) * 100}%; top: {(Math.max(4, activeData.markerY - 12) / height) * 100}%;"
				>
					<span class="tooltip-time">
						{m.simulation_distribution_date()}: {formatDate(activeData.t, 1)}
					</span>
					<span class="tooltip-integral">
						<span class="integral-symbol">{m.simulation_distribution_cumulative()}</span>
						<span class="tooltip-val">{activeData.pct.toFixed(1)}%</span>
					</span>
				</div>
				</div>
			{/if}
		</div>

		<div class="legend">
			<span class="legend-item"><span class="swatch line"></span>{m.simulation_distribution_legend_cumulative()}</span>
			<span class="legend-item"><span class="swatch bell"></span>{m.simulation_distribution_legend_density()}</span>
		</div>
	{:else}
		<div class="empty-state">—</div>
	{/if}
</div>

<style>
	.mixture-intro {
		margin: 0 0 6px;
		font-size: 0.8rem;
		opacity: 0.75;
	}

	.distribution-container {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.mixture-summary {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.component-card {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 6px;
		background: rgb(15 23 42 / 55%);
		border: 1px solid rgb(148 163 184 / 20%);
		border-radius: 5px;
		padding: 5px 8px;
	}

	:global(body.light) .component-card {
		background: rgb(241 245 249 / 80%);
		border-color: rgb(203 213 225 / 70%);
	}

	.component-field {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}

	.field-label {
		color: #94a3b8;
		font-size: 9px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	:global(body.light) .field-label {
		color: #64748b;
	}

	.field-value {
		color: #e2e8f0;
		font-size: 12px;
		font-weight: 600;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		white-space: nowrap;
	}

	.field-value.date {
		color: #38bdf8;
	}

	:global(body.light) .field-value {
		color: #243442;
	}

	:global(body.light) .field-value.date {
		color: #0284c7;
	}

	.symbol {
		color: #e2e8f0;
		font-size: 13px;
		font-weight: 700;
		font-family: 'Cambria Math', 'STIX Two Math', 'Times New Roman', serif;
		text-transform: none;
	}

	:global(body.light) .symbol {
		color: #0f172a;
	}

	.tooltip-layer {
		position: absolute;
		inset: 6px 2px 4px;
		pointer-events: none;
		overflow: hidden;
	}

	.chart-wrapper {
		overflow: hidden;
		position: relative;
		width: 100%;
		background: rgb(8 14 29 / 60%);
		border-radius: 6px;
		border: 1px solid rgb(148 163 184 / 18%);
		padding: 6px 2px 4px;
	}

	:global(body.light) .chart-wrapper {
		background: rgb(248 250 252 / 90%);
		border-color: rgb(226 232 240 / 90%);
	}

	.distribution-chart {
		width: 100%;
		height: auto;
		display: block;
		overflow: visible;
		cursor: crosshair;
	}

	.grid-line {
		stroke: rgb(148 163 184 / 12%);
		stroke-dasharray: 2 2;
	}

	:global(body.light) .grid-line {
		stroke: rgb(148 163 184 / 22%);
	}

	.axis-line {
		stroke: rgb(148 163 184 / 30%);
		stroke-width: 1;
	}

	:global(body.light) .axis-line {
		stroke: rgb(100 116 139 / 40%);
	}

	.axis-label {
		font-size: 9px;
		fill: #94a3b8;
		font-family: inherit;
	}

	:global(body.light) .axis-label {
		fill: #64748b;
	}

	.axis-label.y-axis {
		text-anchor: end;
	}

	.axis-label.x-axis {
		text-anchor: middle;
	}

	.density-area {
		fill: #a78bfa;
		fill-opacity: 0.28;
		stroke: #a78bfa;
		stroke-opacity: 0.7;
		stroke-width: 1;
		pointer-events: none;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		color: #94a3b8;
		font-size: 10px;
	}

	:global(body.light) .legend {
		color: #64748b;
	}

	.legend-item {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}

	.swatch {
		display: inline-block;
		width: 12px;
		height: 8px;
		border-radius: 2px;
	}

	.swatch.line {
		height: 2px;
		background: #38bdf8;
	}

	.swatch.bell {
		background: rgb(167 139 250 / 45%);
		border: 1px solid #a78bfa;
	}

	.impossible-area {
		fill: #ef4444;
		fill-opacity: 0.22;
	}

	.impossible-line {
		stroke: #ef4444;
		stroke-width: 1.6;
		pointer-events: none;
	}

	.active-t-line {
		stroke: #38bdf8;
		stroke-width: 1.5;
		stroke-dasharray: 3 3;
		opacity: 0.85;
		pointer-events: none;
	}

	:global(body.light) .active-t-line {
		stroke: #0284c7;
	}

	.ping-circle {
		animation: pulse 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
	}

	@keyframes pulse {
		0% {
			transform: scale(0.95);
			opacity: 0.8;
		}
		70%,
		100% {
			transform: scale(2.2);
			opacity: 0;
		}
	}

	.error-badge {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: #f87171;
		background: rgb(239 68 68 / 10%);
		padding: 6px 10px;
		border-radius: 6px;
		border: 1px solid rgb(239 68 68 / 20%);
	}

	.error-text {
		word-break: break-all;
	}

	.empty-state {
		color: #64748b;
		font-size: 13px;
	}

	.chart-tooltip {
		position: absolute;
		transform: translate(-50%, -100%);
		pointer-events: none;
		max-width: 100%;
		background: rgb(15 23 42 / 95%);
		border: 1px solid rgb(56 189 248 / 60%);
		border-radius: 6px;
		padding: 4px 8px;
		font-size: 11px;
		color: #f8fafc;
		display: flex;
		flex-direction: column;
		gap: 2px;
		box-shadow: 0 6px 16px rgb(0 0 0 / 40%);
		white-space: nowrap;
		z-index: 10;
		backdrop-filter: blur(8px);
	}

	.chart-tooltip.align-left {
		transform: translate(-10%, -100%);
	}

	.chart-tooltip.align-right {
		transform: translate(-90%, -100%);
	}

	:global(body.light) .chart-tooltip {
		background: rgb(255 255 255 / 96%);
		border-color: rgb(2 132 199 / 60%);
		color: #0f172a;
		box-shadow: 0 6px 16px rgb(15 23 42 / 15%);
	}

	.tooltip-time {
		color: #cbd5e1;
		font-weight: 500;
	}

	:global(body.light) .tooltip-time {
		color: #475569;
	}

	.tooltip-integral {
		display: flex;
		align-items: center;
		gap: 5px;
	}

	.integral-symbol {
		font-size: 10px;
		color: #94a3b8;
	}

	:global(body.light) .integral-symbol {
		color: #64748b;
	}

	.tooltip-val {
		color: #38bdf8;
		font-weight: 700;
		font-size: 12px;
	}

	:global(body.light) .tooltip-val {
		color: #0284c7;
	}
</style>
