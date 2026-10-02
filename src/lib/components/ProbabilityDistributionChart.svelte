<script lang="ts">
	import * as d3 from 'd3';
	import { compile } from 'mathjs';

	interface Point {
		t: number;
		prob: number;
	}

	let {
		expression,
		impossibility = 0,
		width = 300,
		height = 140,
		tMin = 0,
		tMax = 50,
		steps = 100
	}: {
		expression?: string;
		impossibility?: number;
		width?: number;
		height?: number;
		tMin?: number;
		tMax?: number;
		steps?: number;
	} = $props();

	let svgRef = $state<SVGSVGElement | null>(null);
	let tooltipData = $state<{ t: number; prob: number; x: number; y: number } | null>(null);

	// Evaluate mathematical expression safely with mathjs
	const evaluatedData = $derived.by(() => {
		if (!expression || typeof expression !== 'string' || !expression.trim()) {
			return { points: [] as Point[], rawExpr: '', error: null, area: 0 };
		}

		const cleanExpr = expression.trim();

		try {
			const compiled = compile(cleanExpr);
			const pts: { t: number; rawY: number }[] = [];
			const stepSize = (tMax - tMin) / steps;

			for (let i = 0; i <= steps; i++) {
				const t = tMin + i * stepSize;
				let val: any = 0;
				try {
					val = compiled.evaluate({ t, T: t, x: t, X: t });
					if (typeof val === 'object' && val !== null && 're' in val) {
						val = val.re;
					}
				} catch {
					val = 0;
				}

				if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
					val = 0;
				}
				// Probability density cannot be negative
				pts.push({ t, rawY: Math.max(0, val) });
			}

			// Compute total area (Riemann integral) across the interval
			let totalArea = 0;
			for (let i = 0; i < pts.length - 1; i++) {
				const dt = pts[i + 1].t - pts[i].t;
				totalArea += ((pts[i].rawY + pts[i + 1].rawY) / 2) * dt;
			}

			// Factoring in impossibility: normalized factor is (1 - impossibility)
			const possibilityFactor = Math.max(0, 1 - Math.min(1, Math.max(0, impossibility)));

			const normalizedPoints: Point[] = pts.map((p) => {
				const normalizedY = totalArea > 0 ? (p.rawY / totalArea) * possibilityFactor : 0;
				return { t: p.t, prob: normalizedY };
			});

			return {
				points: normalizedPoints,
				rawExpr: cleanExpr,
				error: null,
				area: totalArea
			};
		} catch (err: any) {
			return {
				points: [] as Point[],
				rawExpr: cleanExpr,
				error: err?.message || 'Invalid formula',
				area: 0
			};
		}
	});

	// D3 Scale and Path Generation
	const chartGeometry = $derived.by(() => {
		const margin = { top: 12, right: 14, bottom: 24, left: 34 };
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
				xTicks: [] as { value: number; x: number }[],
				yTicks: [] as { value: number; y: number; formatted: string }[]
			};
		}

		const maxProb = d3.max(pts, (d: Point) => d.prob) || 0.1;
		const yDomainMax = maxProb === 0 ? 1 : maxProb * 1.15;

		const xScale = d3.scaleLinear().domain([tMin, tMax]).range([0, innerWidth]);
		const yScale = d3.scaleLinear().domain([0, yDomainMax]).range([innerHeight, 0]);

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

		const pathD = lineGen(pts) || '';
		const areaD = areaGen(pts) || '';

		const xTicks = xScale.ticks(5).map((val: number) => ({
			value: val,
			x: xScale(val)
		}));

		const yTicks = yScale.ticks(3).map((val: number) => ({
			value: val,
			y: yScale(val),
			formatted: val < 0.01 ? val.toExponential(1) : val.toFixed(2)
		}));

		return {
			margin,
			innerWidth,
			innerHeight,
			xScale,
			yScale,
			pathD,
			areaD,
			xTicks,
			yTicks
		};
	});

	function handlePointerMove(event: PointerEvent) {
		if (!svgRef || !chartGeometry.xScale || !chartGeometry.yScale || evaluatedData.points.length === 0) return;
		const rect = svgRef.getBoundingClientRect();
		const mouseX = event.clientX - rect.left - chartGeometry.margin.left;

		if (mouseX < 0 || mouseX > chartGeometry.innerWidth) {
			tooltipData = null;
			return;
		}

		const tVal = chartGeometry.xScale.invert(mouseX);
		// Find closest point
		const bisect = d3.bisector((d: Point) => d.t).left;
		const idx = Math.min(
			evaluatedData.points.length - 1,
			Math.max(0, bisect(evaluatedData.points, tVal))
		);
		const pt = evaluatedData.points[idx];

		if (pt && chartGeometry.yScale) {
			tooltipData = {
				t: pt.t,
				prob: pt.prob,
				x: chartGeometry.xScale(pt.t) + chartGeometry.margin.left,
				y: chartGeometry.yScale(pt.prob) + chartGeometry.margin.top
			};
		}
	}

	function handlePointerLeave() {
		tooltipData = null;
	}
</script>

<div class="distribution-container">
	{#if evaluatedData.error}
		<div class="error-badge">
			<span class="error-icon">⚠️</span>
			<span class="error-text">{evaluatedData.rawExpr}</span>
		</div>
	{:else if evaluatedData.points.length > 0}
		<div class="expr-preview" title={evaluatedData.rawExpr}>
			<code>P(t) = {evaluatedData.rawExpr}</code>
		</div>

		<div class="chart-wrapper">
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<svg
				bind:this={svgRef}
				viewBox="0 0 {width} {height}"
				class="distribution-chart"
				onpointermove={handlePointerMove}
				onpointerleave={handlePointerLeave}
			>
				<defs>
					<linearGradient id="probAreaGrad" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stop-color="#38bdf8" stop-opacity="0.45" />
						<stop offset="100%" stop-color="#38bdf8" stop-opacity="0.02" />
					</linearGradient>
					<linearGradient id="probLineGrad" x1="0" y1="0" x2="1" y2="0">
						<stop offset="0%" stop-color="#38bdf8" />
						<stop offset="100%" stop-color="#818cf8" />
					</linearGradient>
				</defs>

				<g transform="translate({chartGeometry.margin.left}, {chartGeometry.margin.top})">
					<!-- Horizontal grid lines -->
					{#each chartGeometry.yTicks as tick}
						<line
							x1="0"
							y1={tick.y}
							x2={chartGeometry.innerWidth}
							y2={tick.y}
							class="grid-line"
						/>
						<text x="-6" y={tick.y + 3} class="axis-label y-axis">{tick.formatted}</text>
					{/each}

					<!-- Vertical grid & X-axis labels -->
					{#each chartGeometry.xTicks as tick}
						<line
							x1={tick.x}
							y1="0"
							x2={tick.x}
							y2={chartGeometry.innerHeight}
							class="grid-line x-grid"
						/>
						<text x={tick.x} y={chartGeometry.innerHeight + 16} class="axis-label x-axis"
							>{tick.value}</text
						>
					{/each}

					<!-- Area under curve -->
					{#if chartGeometry.areaD}
						<path d={chartGeometry.areaD} fill="url(#probAreaGrad)" />
					{/if}

					<!-- Curve line -->
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

					<!-- Bottom & Left axis lines -->
					<line
						x1="0"
						y1={chartGeometry.innerHeight}
						x2={chartGeometry.innerWidth}
						y2={chartGeometry.innerHeight}
						class="axis-line"
					/>
					<line
						x1="0"
						y1="0"
						x2="0"
						y2={chartGeometry.innerHeight}
						class="axis-line"
					/>
				</g>

				<!-- Hover target marker & tooltip -->
				{#if tooltipData}
					<g transform="translate({tooltipData.x}, {tooltipData.y})">
						<circle r="4" fill="#38bdf8" stroke="#ffffff" stroke-width="1.5" />
					</g>
				{/if}
			</svg>

			{#if tooltipData}
				<div
					class="chart-tooltip"
					style="left: {tooltipData.x}px; top: {Math.max(4, tooltipData.y - 32)}px;"
				>
					<span>t = {tooltipData.t.toFixed(1)}</span>
					<span class="tooltip-prob"
						>{(tooltipData.prob * 100).toFixed(2)}%</span
					>
				</div>
			{/if}
		</div>
	{:else}
		<div class="empty-state">—</div>
	{/if}
</div>

<style>
	.distribution-container {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.expr-preview {
		font-size: 11px;
		color: #94a3b8;
		background: rgb(15 23 42 / 45%);
		padding: 4px 8px;
		border-radius: 4px;
		border: 1px solid rgb(148 163 184 / 15%);
		overflow-x: auto;
		white-space: nowrap;
	}

	:global(body.light) .expr-preview {
		color: #475569;
		background: rgb(241 245 249 / 80%);
		border-color: rgb(203 213 225 / 60%);
	}

	.expr-preview code {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		color: #38bdf8;
	}

	:global(body.light) .expr-preview code {
		color: #0284c7;
	}

	.chart-wrapper {
		position: relative;
		width: 100%;
		background: rgb(8 14 29 / 60%);
		border-radius: 6px;
		border: 1px solid rgb(148 163 184 / 18%);
		padding: 4px 2px;
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
		background: rgb(15 23 42 / 95%);
		border: 1px solid rgb(56 189 248 / 50%);
		border-radius: 4px;
		padding: 2px 6px;
		font-size: 10px;
		color: #f8fafc;
		display: flex;
		gap: 6px;
		box-shadow: 0 4px 12px rgb(0 0 0 / 30%);
		white-space: nowrap;
		z-index: 10;
	}

	:global(body.light) .chart-tooltip {
		background: rgb(255 255 255 / 95%);
		border-color: rgb(2 132 199 / 60%);
		color: #0f172a;
	}

	.tooltip-prob {
		color: #38bdf8;
		font-weight: 600;
	}

	:global(body.light) .tooltip-prob {
		color: #0284c7;
	}
</style>
