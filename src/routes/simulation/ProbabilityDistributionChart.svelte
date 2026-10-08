<script lang="ts">
	import * as d3 from 'd3';
	import {
		evaluateSkewNormalMixture,
		evaluateSkewNormalMixtureCdf,
		skewNormalMixtureQuantile,
		type SkewNormalParameter
	} from '$lib/simulation/ProbabilityDistribution';
	import {
		buildSegmentedAxis,
		formatDuration,
		formatPreciseDate,
		periodBounds,
		type SegmentedAxis
	} from '$lib/simulation/TimeAxis';
	import * as m from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';

	interface Point {
		t: number;
		prob: number;
		density: number;
	}

	let {
		distribution,
		impossibility = 0,
		width = 320,
		height = 190
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
			if (trimmed.startsWith('{"(') || trimmed.startsWith('{(')) {
				// Raw postgres array literal: {"(2027,1,0,1)","(...)"}
				rawList = [...trimmed.matchAll(/\([^)]*\)/g)].map((match) => match[0]);
			} else if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
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

		for (let item of array) {
			// Composite literal "(xi,omega,alpha,weight)" left unparsed by pg
			if (typeof item === 'string') {
				const match = item.match(/^\s*\(([^)]*)\)\s*$/);
				if (!match) continue;
				const [xi, omega, alpha, weight] = match[1].split(',').map(Number);
				item = { xi, omega, alpha, weight };
			}
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

	const locale = $derived(getLocale());

	const ROW_HEIGHT = 12;
	const BASE_BOTTOM = 20;
	const innerWidth = $derived(Math.max(10, width - 38 - 16));

	const SAMPLES_PER_SEGMENT = 100;

	// The time axis is made of one zoomed segment per group of scenarios (the quiet periods between
	// them are condensed), so a very precise date and far apart peaks both stay readable.
	const evaluatedData = $derived.by(() => {
		const mixture = parsedMixture.parameters;
		const possibilityFactor = 1 - Math.min(1, Math.max(0, impossibility));
		const empty = {
			axis: null as SegmentedAxis | null,
			samples: [] as Point[],
			segmentSamples: [] as Point[][],
			peaks: [] as number[],
			mixture: [] as SkewNormalParameter[],
			error: parsedMixture.error,
			possibilityFactor,
			totalWeight: 1
		};
		if (mixture.length === 0) return empty;

		try {
			const axis = buildSegmentedAxis(mixture, innerWidth, locale);

			const segmentSamples: Point[][] = [];
			const peaks: number[] = [];
			for (const segment of axis.segments) {
				const pts: Point[] = [];
				let peak = segment.lo;
				let peakDensity = -1;
				for (let i = 0; i <= SAMPLES_PER_SEGMENT; i++) {
					const t = segment.lo + (i / SAMPLES_PER_SEGMENT) * (segment.hi - segment.lo);
					const density = evaluateSkewNormalMixture(t, mixture);
					if (density > peakDensity) {
						peakDensity = density;
						peak = t;
					}
					pts.push({
						t,
						prob: evaluateSkewNormalMixtureCdf(t, mixture) * possibilityFactor,
						density
					});
				}
				segmentSamples.push(pts);
				peaks.push(peak);
			}

			return {
				axis,
				samples: segmentSamples.flat(),
				segmentSamples,
				peaks,
				mixture,
				error: null,
				possibilityFactor,
				totalWeight: mixture.reduce((sum, comp) => sum + comp.weight, 0)
			};
		} catch (err: any) {
			return { ...empty, mixture, error: err?.message || 'Error evaluating distribution' };
		}
	});

	// Number of context rows under the ticks (month, year...): the chart grows to make room for them
	const contextRows = $derived(
		Math.max(0, ...(evaluatedData.axis?.segments.map((seg) => seg.levels.length) ?? [0]))
	);
	const margin = $derived({
		top: 12,
		right: 16,
		bottom: BASE_BOTTOM + ROW_HEIGHT * Math.max(1, contextRows),
		left: 38
	});
	// The plot area keeps the same height whatever the number of rows
	const innerHeight = $derived(Math.max(10, height - 12 - (BASE_BOTTOM + ROW_HEIGHT * 2)));
	const totalHeight = $derived(innerHeight + margin.top + margin.bottom);

	// D3 scales and paths. The y axis is always the full probability range [0, 1].
	const chartGeometry = $derived.by(() => {
		const axis = evaluatedData.axis;
		const yScale = d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]);
		const yTicks = [0, 0.25, 0.5, 0.75, 1].map((val) => ({
			value: val,
			y: yScale(val),
			formatted: String(val)
		}));

		if (!axis || evaluatedData.samples.length === 0) {
			return {
				innerWidth,
				innerHeight,
				yScale,
				pathD: '',
				areaD: '',
				densityPaths: [] as string[],
				densityHeight: 0,
				segmentMaxDensity: [] as number[],
				peakXs: [] as number[],
				impossibleY: 0,
				yTicks
			};
		}

		const xOf = (d: Point) => axis.toX(d.t);

		const lineGen = d3
			.line<Point>()
			.x(xOf)
			.y((d: Point) => yScale(d.prob))
			.curve(d3.curveMonotoneX);

		const areaGen = d3
			.area<Point>()
			.x(xOf)
			.y0(innerHeight)
			.y1((d: Point) => yScale(d.prob))
			.curve(d3.curveMonotoneX);

		// Each segment has its own density scale: its peak is drawn at 85% of the reachable
		// probability, so it never goes over the impossibility threshold (or 1). The weight of the
		// segment is written below it and the height of the cumulative step shows it too.
		const densityHeight = 0.85 * evaluatedData.possibilityFactor;
		const segmentMaxDensity = evaluatedData.segmentSamples.map(
			(pts) => d3.max(pts, (d: Point) => d.density) || 1
		);
		const densityPaths = evaluatedData.segmentSamples.map((pts, i) => {
			const maxDensity = segmentMaxDensity[i];
			const gen = d3
				.area<Point>()
				.x(xOf)
				.y0(innerHeight)
				.y1((d: Point) => yScale((d.density / maxDensity) * densityHeight))
				.curve(d3.curveMonotoneX);
			return gen(pts) || '';
		});

		return {
			innerWidth,
			innerHeight,
			yScale,
			pathD: lineGen(evaluatedData.samples) || '',
			areaD: areaGen(evaluatedData.samples) || '',
			densityPaths,
			densityHeight,
			segmentMaxDensity,
			peakXs: evaluatedData.peaks.map((t) => axis.toX(t)),
			impossibleY: yScale(evaluatedData.possibilityFactor),
			yTicks
		};
	});

	// Cumulative probability P(date <= t) at the hovered / clicked date
	const activeData = $derived.by(() => {
		const axis = evaluatedData.axis;
		if (activeT === null || !axis || !chartGeometry.yScale || evaluatedData.samples.length === 0) {
			return null;
		}

		const first = axis.segments[0];
		const last = axis.segments[axis.segments.length - 1];
		const t = Math.max(first.lo, Math.min(last.hi, activeT));
		const prob =
			evaluateSkewNormalMixtureCdf(t, evaluatedData.mixture) * evaluatedData.possibilityFactor;
		const segmentIndex = axis.segmentIndexAt(t);
		// Inside a condensed period only the year makes sense
		const unit = segmentIndex >= 0 ? axis.segments[segmentIndex].unit : 'year';

		// Height of the density curve at t, on the scale of its segment (0 inside a condensed period)
		const density = evaluateSkewNormalMixture(t, evaluatedData.mixture);
		const densityY =
			segmentIndex >= 0
				? chartGeometry.yScale(
						(density / chartGeometry.segmentMaxDensity[segmentIndex]) * chartGeometry.densityHeight
					)
				: chartGeometry.innerHeight;
		// Integral of the density over the calendar period of the axis unit (the year, month, day...
		// containing t), i.e. F(end) - F(start). The CDF works in real years, so the broken axis does
		// not change the result.
		const period = periodBounds(t, unit);
		const windowProb =
			(evaluateSkewNormalMixtureCdf(period.hi, evaluatedData.mixture) -
				evaluateSkewNormalMixtureCdf(period.lo, evaluatedData.mixture)) *
			evaluatedData.possibilityFactor;

		return {
			t,
			prob,
			pct: prob * 100,
			densityY,
			windowPct: windowProb * 100,
			label: formatPreciseDate(t, unit, locale),
			markerX: axis.toX(t) + margin.left,
			markerY: chartGeometry.yScale(prob) + margin.top
		};
	});

	function pointerToT(event: PointerEvent | MouseEvent): number | null {
		const axis = evaluatedData.axis;
		if (!svgRef || !axis) return null;
		const rect = svgRef.getBoundingClientRect();
		// The svg is scaled by CSS, so convert the pointer into viewBox units first
		const mouseX = ((event.clientX - rect.left) / rect.width) * width - margin.left;
		if (mouseX < 0 || mouseX > innerWidth) return null;
		return axis.toT(mouseX);
	}

	function handlePointerMove(event: PointerEvent) {
		hoverT = pointerToT(event);
	}

	function handlePointerLeave() {
		hoverT = null;
	}

	function handleClick(event: MouseEvent) {
		const axis = evaluatedData.axis;
		const clicked = pointerToT(event);
		if (clicked === null || !axis) {
			clickedT = null;
			return;
		}
		// Toggle if clicking the same spot (compared in pixels, the axis is not linear)
		const tolerance = innerWidth * 0.02;
		clickedT =
			clickedT !== null && Math.abs(axis.toX(clickedT) - axis.toX(clicked)) < tolerance
				? null
				: clicked;
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
	{:else if evaluatedData.axis && evaluatedData.samples.length > 0}
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
				viewBox="0 0 {width} {totalHeight}"
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
					<pattern
						id="gapHatch"
						width="6"
						height="6"
						patternUnits="userSpaceOnUse"
						patternTransform="rotate(45)"
					>
						<line x1="0" y1="0" x2="0" y2="6" stroke="rgb(148 163 184 / 28%)" stroke-width="1.5" />
					</pattern>
				</defs>

				<g transform="translate({margin.left}, {margin.top})">
					<!-- Horizontal grid lines -->
					{#each chartGeometry.yTicks as tick}
						<line x1="0" y1={tick.y} x2={chartGeometry.innerWidth} y2={tick.y} class="grid-line" />
						<text x="-6" y={tick.y + 3} class="axis-label y-axis">{tick.formatted}</text>
					{/each}

					<!-- Condensed periods between two segments -->
					{#each evaluatedData.axis.gaps as gap}
						{@const mid = (gap.x0 + gap.x1) / 2}
						<rect
							x={gap.x0}
							y="0"
							width={gap.x1 - gap.x0}
							height={chartGeometry.innerHeight}
							fill="url(#gapHatch)"
						/>
						<text
							x={mid}
							y={chartGeometry.innerHeight / 2}
							class="gap-label"
							transform="rotate(-90 {mid} {chartGeometry.innerHeight / 2})"
							>{formatDuration(gap.years, locale)}</text
						>
						<path
							d="M {gap.x0 + 2} {chartGeometry.innerHeight + 5} l 5 -10 M {gap.x0 + 6} {chartGeometry.innerHeight + 5} l 5 -10 M {gap.x1 - 10} {chartGeometry.innerHeight + 5} l 5 -10 M {gap.x1 - 6} {chartGeometry.innerHeight + 5} l 5 -10"
							class="break-mark"
						/>
					{/each}

					<!-- Per segment: grid, dates (fine unit), context (bigger units) and weight -->
					{#each evaluatedData.axis.segments as segment, i}
						{#each segment.ticks as tick}
							{@const tx = evaluatedData.axis.toX(tick.t)}
							<line
								x1={tx}
								y1="0"
								x2={tx}
								y2={chartGeometry.innerHeight}
								class="grid-line x-grid"
							/>
							<line
								x1={tx}
								y1={chartGeometry.innerHeight}
								x2={tx}
								y2={chartGeometry.innerHeight + 3}
								class="axis-line"
							/>
							<text x={tx} y={chartGeometry.innerHeight + 14} class="axis-label x-axis"
								>{tick.label}</text
							>
						{/each}
						<!-- Context rows under the ticks: month, then year... -->
						{#each segment.levels as row, r}
							{#each row as group, g}
								{@const gx0 = evaluatedData.axis.toX(group.lo)}
								{@const gx1 = evaluatedData.axis.toX(group.hi)}
								{@const gw = gx1 - gx0}
								{@const text = group.label.length * 4.8 <= gw ? group.label : group.short}
								{@const rowY = chartGeometry.innerHeight + 17 + r * ROW_HEIGHT}
								{#if g > 0}
									<line x1={gx0} y1={rowY - 7} x2={gx0} y2={rowY + 4} class="level-separator" />
								{/if}
								{#if text.length * 4.8 <= gw + 4}
									<text x={(gx0 + gx1) / 2} y={rowY + 8} class="axis-label context-label"
										>{text}</text
									>
								{/if}
							{/each}
						{/each}
						{#if evaluatedData.axis.segments.length > 1}
							<text
								x={(segment.x0 + segment.x1) / 2}
								y={chartGeometry.innerHeight - 5}
								class="weight-label">{Math.round(segment.mass * 100)}%</text
							>
						{/if}
						<!-- Most probable date of the segment -->
						<line
							x1={chartGeometry.peakXs[i]}
							y1="0"
							x2={chartGeometry.peakXs[i]}
							y2={chartGeometry.innerHeight}
							class="peak-line"
						/>
						<path
							d="M {chartGeometry.peakXs[i] - 3.5} {chartGeometry.innerHeight + 6} l 3.5 -6 l 3.5 6 z"
							class="peak-marker"
						/>
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
					{#each chartGeometry.densityPaths as densityD}
						<path d={densityD} class="density-area" />
					{/each}

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
							x1={evaluatedData.axis?.toX(activeData.t)}
							y1="0"
							x2={evaluatedData.axis?.toX(activeData.t)}
							y2={chartGeometry.innerHeight}
							class="active-t-line"
						/>
						<line
							x1="0"
							y1={chartGeometry.yScale?.(activeData.prob)}
							x2={evaluatedData.axis?.toX(activeData.t)}
							y2={chartGeometry.yScale?.(activeData.prob)}
							class="active-t-line"
						/>
					{/if}

					<!-- Active point on the density curve, with guides to the x axis and to the left edge -->
					{#if activeData && evaluatedData.axis}
						{@const dx = evaluatedData.axis.toX(activeData.t)}
						<line x1="0" y1={activeData.densityY} x2={dx} y2={activeData.densityY} class="active-t-line" />
						<circle cx={dx} cy={activeData.densityY} r="3.5" class="density-dot" />
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

		</div>
		<div class="readout">
			{#if activeData}
				<span class="readout-time">{m.simulation_distribution_date()} : {activeData.label}</span>
			{:else}
				<span class="readout-empty">—</span>
			{/if}
		</div>

		<div class="legend">
			<span class="legend-item">
				<span class="swatch line"></span>{m.simulation_distribution_legend_cumulative()}
				{#if activeData}<span class="legend-value">{activeData.pct.toFixed(1)}%</span>{/if}
			</span>
			<span class="legend-item">
				<span class="swatch bell"></span>{m.simulation_distribution_legend_density()}
				{#if activeData}
					{m.simulation_distribution_over_period()} {activeData.label} :
					<span class="legend-value">{activeData.windowPct.toLocaleString(locale, { maximumSignificantDigits: 2 })}%</span>
				{/if}
			</span>
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

	.axis-label.context-label {
		font-weight: 600;
		fill: #cbd5e1;
	}

	:global(body.light) .axis-label.context-label {
		fill: #334155;
	}

	.level-separator {
		stroke: rgb(148 163 184 / 45%);
		stroke-width: 1;
	}

	.gap-label {
		font-size: 8px;
		fill: #94a3b8;
		text-anchor: middle;
		pointer-events: none;
	}

	.break-mark {
		stroke: #94a3b8;
		stroke-width: 1.4;
		fill: none;
	}

	.weight-label {
		font-size: 9px;
		font-weight: 600;
		fill: #94a3b8;
		text-anchor: middle;
		pointer-events: none;
	}

	.peak-line {
		stroke: #fbbf24;
		stroke-width: 1;
		stroke-dasharray: 3 3;
		opacity: 0.7;
	}

	.peak-marker {
		fill: #fbbf24;
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

	.legend-value {
		color: #38bdf8;
		font-weight: 700;
		margin-left: 2px;
	}

	:global(body.light) .legend-value {
		color: #0284c7;
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

	.density-dot {
		fill: #a78bfa;
		stroke: #ffffff;
		stroke-width: 1.5;
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


	.readout {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 14px;
		min-height: 34px;
		padding: 6px 10px;
		border-radius: 6px;
		background: rgb(8 14 29 / 60%);
		border: 1px solid rgb(148 163 184 / 18%);
		font-size: 11px;
	}

	:global(body.light) .readout {
		background: rgb(248 250 252 / 90%);
		border-color: rgb(226 232 240 / 90%);
	}

	.readout-time {
		color: #cbd5e1;
		font-weight: 600;
	}

	.readout-empty {
		color: #64748b;
	}

	:global(body.light) .readout-time {
		color: #334155;
	}

</style>
