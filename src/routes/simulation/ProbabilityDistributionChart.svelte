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
		width = 320,
		height = 150
	}: {
		expression?: string;
		impossibility?: number;
		width?: number;
		height?: number;
	} = $props();

	let svgRef = $state<SVGSVGElement | null>(null);
	let hoverT = $state<number | null>(null);
	let clickedT = $state<number | null>(null);

	// The active time t (hovered or clicked)
	const activeT = $derived(hoverT ?? clickedT);

	// Multi-pass Evaluation to determine significant mass domain and sample smoothly
	const evaluatedData = $derived.by(() => {
		if (!expression || typeof expression !== 'string' || !expression.trim()) {
			return {
				points: [] as Point[],
				rawExpr: '',
				error: null,
				tMin: 0,
				tMax: 50,
				totalArea: 0,
				possibilityFactor: 1
			};
		}

		const cleanExpr = expression.trim();

		try {
			const compiled = compile(cleanExpr);

			const evaluateAt = (t: number): number => {
				try {
					let val: any = compiled.evaluate({ t, T: t, x: t, X: t });
					if (typeof val === 'object' && val !== null && 're' in val) {
						val = val.re;
					}
					if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
						return 0;
					}
					return Math.max(0, val);
				} catch {
					return 0;
				}
			};

			// Pass 1: Wide scan from t = 0 to 100 to discover probability distribution mass
			const scanSteps = 300;
			const scanMax = 100;
			const scanPoints: { t: number; y: number }[] = [];
			for (let i = 0; i <= scanSteps; i++) {
				const t = (i / scanSteps) * scanMax;
				scanPoints.push({ t, y: evaluateAt(t) });
			}

			// Integrate scan
			let scanTotalArea = 0;
			for (let i = 0; i < scanPoints.length - 1; i++) {
				const dt = scanPoints[i + 1].t - scanPoints[i].t;
				scanTotalArea += ((scanPoints[i].y + scanPoints[i + 1].y) / 2) * dt;
			}

			let autoTMin = 0;
			let autoTMax = 50;

			if (scanTotalArea > 1e-12) {
				// Find 0.5% (lower quantile) and 99.5% (upper quantile) to capture the main mass
				let cum = 0;
				let qLower = 0;
				let qUpper = scanMax;
				const lowerTarget = 0.005 * scanTotalArea;
				const upperTarget = 0.995 * scanTotalArea;

				for (let i = 0; i < scanPoints.length - 1; i++) {
					const p1 = scanPoints[i];
					const p2 = scanPoints[i + 1];
					const dt = p2.t - p1.t;
					const da = ((p1.y + p2.y) / 2) * dt;
					const prev = cum;
					cum += da;

					if (prev < lowerTarget && cum >= lowerTarget) {
						qLower = p1.t + (da > 0 ? dt * ((lowerTarget - prev) / da) : 0);
					}
					if (prev < upperTarget && cum >= upperTarget) {
						qUpper = p1.t + (da > 0 ? dt * ((upperTarget - prev) / da) : 0);
						break;
					}
				}

				// Add 10% breathing room around main mass, anchor at 0 for years if close
				const massSpan = Math.max(1, qUpper - qLower);
				autoTMin = Math.max(0, Math.floor(qLower - massSpan * 0.08));
				autoTMax = Math.ceil(qUpper + massSpan * 0.08);

				if (autoTMax - autoTMin < 5) {
					autoTMax = autoTMin + 5;
				}
			}

			// Pass 2: High-resolution evaluation over the focused domain [autoTMin, autoTMax]
			const resolutionSteps = 160;
			const stepSize = (autoTMax - autoTMin) / resolutionSteps;
			const focusedRawPoints: { t: number; rawY: number }[] = [];

			for (let i = 0; i <= resolutionSteps; i++) {
				const t = autoTMin + i * stepSize;
				focusedRawPoints.push({ t, rawY: evaluateAt(t) });
			}

			// Exact trapezoidal integration over focused domain
			let focusedArea = 0;
			for (let i = 0; i < focusedRawPoints.length - 1; i++) {
				const dt = focusedRawPoints[i + 1].t - focusedRawPoints[i].t;
				focusedArea += ((focusedRawPoints[i].rawY + focusedRawPoints[i + 1].rawY) / 2) * dt;
			}

			// Fallback to total scanned area if focused area is very small
			const normalizationArea = focusedArea > 0 ? focusedArea : scanTotalArea > 0 ? scanTotalArea : 1;
			const possibilityFactor = Math.max(0, 1 - Math.min(1, Math.max(0, impossibility)));

			const normalizedPoints: Point[] = focusedRawPoints.map((p) => ({
				t: p.t,
				prob: normalizationArea > 0 ? (p.rawY / normalizationArea) * possibilityFactor : 0
			}));

			return {
				points: normalizedPoints,
				rawExpr: cleanExpr,
				error: null,
				tMin: autoTMin,
				tMax: autoTMax,
				totalArea: normalizationArea,
				possibilityFactor
			};
		} catch (err: any) {
			return {
				points: [] as Point[],
				rawExpr: cleanExpr,
				error: err?.message || 'Invalid formula',
				tMin: 0,
				tMax: 50,
				totalArea: 0,
				possibilityFactor: 1
			};
		}
	});

	// D3 Scale, Full Paths, and Tick Generation
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
				xTicks: [] as { value: number; x: number }[],
				yTicks: [] as { value: number; y: number; formatted: string }[]
			};
		}

		const maxProb = d3.max(pts, (d: Point) => d.prob) || 0.1;
		const yDomainMax = maxProb === 0 ? 1 : maxProb * 1.18;

		const xScale = d3
			.scaleLinear()
			.domain([evaluatedData.tMin, evaluatedData.tMax])
			.range([0, innerWidth]);

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
			formatted: val < 0.01 && val > 0 ? val.toExponential(1) : val.toFixed(2)
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

	// Compute cumulative integral up to activeT and animated highlighted area
	const activeIntegralData = $derived.by(() => {
		if (
			activeT === null ||
			!chartGeometry.xScale ||
			!chartGeometry.yScale ||
			evaluatedData.points.length === 0
		) {
			return null;
		}

		const pts = evaluatedData.points;
		const clampedT = Math.max(evaluatedData.tMin, Math.min(evaluatedData.tMax, activeT));

		// Find points up to clampedT and interpolate point at clampedT
		const bisect = d3.bisector((d: Point) => d.t).left;
		const idx = Math.min(pts.length - 1, Math.max(0, bisect(pts, clampedT)));

		let subPoints: Point[] = [];
		let currentProb = 0;

		if (idx === 0) {
			subPoints = [{ t: pts[0].t, prob: pts[0].prob }];
			currentProb = pts[0].prob;
		} else {
			subPoints = pts.slice(0, idx);
			const pPrev = pts[idx - 1];
			const pNext = pts[idx];
			const ratio = (clampedT - pPrev.t) / (pNext.t - pPrev.t || 1);
			currentProb = pPrev.prob + (pNext.prob - pPrev.prob) * ratio;
			subPoints.push({ t: clampedT, prob: currentProb });
		}

		// Calculate cumulative integral (Riemann trapezoidal sum) from tMin (or 0) to clampedT
		let cumulativeIntegral = 0;
		for (let i = 0; i < subPoints.length - 1; i++) {
			const p1 = subPoints[i];
			const p2 = subPoints[i + 1];
			const dt = p2.t - p1.t;
			cumulativeIntegral += ((p1.prob + p2.prob) / 2) * dt;
		}

		// Cumulative probability capped at 100% * possibilityFactor
		const cumulativePct = Math.min(100, Math.max(0, cumulativeIntegral * 100));

		// Sub-area path up to activeT
		const areaGen = d3
			.area<Point>()
			.x((d: Point) => chartGeometry.xScale!(d.t))
			.y0(chartGeometry.innerHeight)
			.y1((d: Point) => chartGeometry.yScale!(d.prob))
			.curve(d3.curveMonotoneX);

		const activeAreaD = areaGen(subPoints) || '';

		const markerX = chartGeometry.xScale(clampedT) + chartGeometry.margin.left;
		const markerY = chartGeometry.yScale(currentProb) + chartGeometry.margin.top;

		return {
			t: clampedT,
			prob: currentProb,
			cumulativeIntegral,
			cumulativePct,
			activeAreaD,
			markerX,
			markerY,
			subPoints
		};
	});

	function handlePointerMove(event: PointerEvent) {
		if (
			!svgRef ||
			!chartGeometry.xScale ||
			!chartGeometry.yScale ||
			evaluatedData.points.length === 0
		) {
			return;
		}
		const rect = svgRef.getBoundingClientRect();
		const mouseX = event.clientX - rect.left - chartGeometry.margin.left;

		if (mouseX < 0 || mouseX > chartGeometry.innerWidth) {
			hoverT = null;
			return;
		}

		hoverT = chartGeometry.xScale.invert(mouseX);
	}

	function handlePointerLeave() {
		hoverT = null;
	}

	function handleClick(event: MouseEvent) {
		if (
			!svgRef ||
			!chartGeometry.xScale ||
			!chartGeometry.yScale ||
			evaluatedData.points.length === 0
		) {
			return;
		}
		const rect = svgRef.getBoundingClientRect();
		const mouseX = event.clientX - rect.left - chartGeometry.margin.left;

		if (mouseX < 0 || mouseX > chartGeometry.innerWidth) {
			clickedT = null;
			return;
		}

		const clicked = chartGeometry.xScale.invert(mouseX);
		// Toggle if clicking same point
		if (clickedT !== null && Math.abs(clickedT - clicked) < 0.5) {
			clickedT = null;
		} else {
			clickedT = clicked;
		}
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
					<!-- Background Full Area Gradient -->
					<linearGradient id="probAreaGrad" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stop-color="#38bdf8" stop-opacity="0.25" />
						<stop offset="100%" stop-color="#38bdf8" stop-opacity="0.02" />
					</linearGradient>

					<!-- Animated Cumulative Highlight Gradient -->
					<linearGradient id="activeIntegralGrad" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stop-color="#06b6d4" stop-opacity="0.65" />
						<stop offset="100%" stop-color="#3b82f6" stop-opacity="0.18" />
					</linearGradient>

					<!-- Curve Line Gradient -->
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

					<!-- Vertical grid & X-axis labels (in Years) -->
					{#each chartGeometry.xTicks as tick}
						<line
							x1={tick.x}
							y1="0"
							x2={tick.x}
							y2={chartGeometry.innerHeight}
							class="grid-line x-grid"
						/>
						<text x={tick.x} y={chartGeometry.innerHeight + 16} class="axis-label x-axis"
							>{tick.value}y</text
						>
					{/each}

					<!-- Base full curve area -->
					{#if chartGeometry.areaD}
						<path d={chartGeometry.areaD} fill="url(#probAreaGrad)" />
					{/if}

					<!-- Animated interactive cumulative integral shaded area up to t -->
					{#if activeIntegralData?.activeAreaD}
						<path
							d={activeIntegralData.activeAreaD}
							fill="url(#activeIntegralGrad)"
							class="animated-integral-area"
						/>
					{/if}

					<!-- Full curve line -->
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

					<!-- Active vertical reference line & needle -->
					{#if activeIntegralData}
						<line
							x1={chartGeometry.xScale?.(activeIntegralData.t)}
							y1="0"
							x2={chartGeometry.xScale?.(activeIntegralData.t)}
							y2={chartGeometry.innerHeight}
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
				{#if activeIntegralData}
					<g transform="translate({activeIntegralData.markerX}, {activeIntegralData.markerY})">
						<circle r="6" fill="#38bdf8" opacity="0.3" class="ping-circle" />
						<circle r="4" fill="#06b6d4" stroke="#ffffff" stroke-width="1.8" />
					</g>
				{/if}
			</svg>

			{#if activeIntegralData}
				<div
					class="chart-tooltip"
					style="left: {activeIntegralData.markerX}px; top: {Math.max(4, activeIntegralData.markerY - 42)}px;"
				>
					<div class="tooltip-header">
						<span class="tooltip-time">t = {activeIntegralData.t.toFixed(1)} {activeIntegralData.t <= 1 ? 'year' : 'years'}</span>
					</div>
					<div class="tooltip-integral">
						<span class="integral-symbol">∫₀ᵗ P(u)du =</span>
						<span class="tooltip-val">{activeIntegralData.cumulativePct.toFixed(1)}%</span>
					</div>
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

	.animated-integral-area {
		transition: d 0.08s ease-out;
		filter: drop-shadow(0 0 4px rgba(56, 189, 248, 0.3));
		pointer-events: none;
	}

	.ping-circle {
		animation: pulse 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
	}

	@keyframes pulse {
		0% {
			transform: scale(0.95);
			opacity: 0.8;
		}
		70%, 100% {
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

	:global(body.light) .chart-tooltip {
		background: rgb(255 255 255 / 96%);
		border-color: rgb(2 132 199 / 60%);
		color: #0f172a;
		box-shadow: 0 6px 16px rgb(15 23 42 / 15%);
	}

	.tooltip-header {
		display: flex;
		align-items: center;
		gap: 4px;
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
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
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
