<script lang="ts">
	import * as d3 from 'd3';
	import {
		buildEvolutionFunction,
		parseEvolutionFunction
	} from '$lib/simulation/event/EvolutionFunction';
	import {
		evaluateSkewNormalMixture,
		parseSkewNormalMixture
	} from '$lib/simulation/ProbabilityDistribution';
	import * as m from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';

	let {
		evolution,
		unit = '',
		distribution,
		width = 320,
		height = 210
	}: {
		evolution?: unknown;
		unit?: string;
		/** Probability distribution of the date of the fact: it drives the width of the uncertainty cloud */
		distribution?: unknown;
		width?: number;
		height?: number;
	} = $props();

	// The graph shows 50 years of past and 50 years of future around today
	const HALF_SPAN = 50;
	const STEP = 0.25;
	// Half-widths of the nested bands of the cloud, in standard deviations (w = 2 sigma)
	const CLOUD_LEVELS = [2.4, 2, 1.6, 1.2, 0.8, 0.4];
	// Cloud width, as a share of the vertical range of the curve
	const WIDTH_MIN = 0.03;
	const WIDTH_MAX = 0.3;
	const WIDTH_SHAPE = 0.8;
	// Smallest spread (in years) of the distribution used for the cloud: a date known to the day
	// would otherwise make a dip thinner than a pixel on a 100 years axis
	const MIN_SPREAD = 2;

	interface CurvePoint {
		t: number;
		value: number;
		width: number;
	}

	let svgRef = $state<SVGSVGElement | null>(null);
	let hoverT = $state<number | null>(null);

	const locale = $derived(getLocale());
	const components = $derived(parseEvolutionFunction(evolution));
	const totalWeight = $derived(components?.reduce((sum, item) => sum + item.weight, 0) ?? 1);

	const today = (() => {
		const now = new Date();
		const start = Date.UTC(now.getUTCFullYear(), 0, 1);
		const end = Date.UTC(now.getUTCFullYear() + 1, 0, 1);
		return now.getUTCFullYear() + (now.getTime() - start) / (end - start);
	})();
	const lo = today - HALF_SPAN;
	const hi = today + HALF_SPAN;

	const model = $derived.by(() => {
		if (!components) return null;
		const valueAt = buildEvolutionFunction(components);

		// Certainty at t: density of the probability distribution relative to its peak. Each component
		// is widened to at least MIN_SPREAD years (like a blur at the resolution of the axis).
		const mixture = parseSkewNormalMixture(distribution).parameters.map((comp) => ({
			...comp,
			omega: Math.sqrt(comp.omega * comp.omega + MIN_SPREAD * MIN_SPREAD)
		}));
		// The peak is searched on the whole distribution, also outside of the window: far from the
		// most probable date, the evolution is uncertain
		let densityMax = 0;
		if (mixture.length > 0) {
			const from = Math.min(lo, ...mixture.map((c) => c.xi - 6 * c.omega));
			const to = Math.max(hi, ...mixture.map((c) => c.xi + 6 * c.omega));
			const step = Math.max(0.05, (to - from) / 4000);
			for (let t = from; t <= to; t += step) {
				densityMax = Math.max(densityMax, evaluateSkewNormalMixture(t, mixture));
			}
		}
		const certaintyAt = (t: number) =>
			densityMax > 0 ? Math.min(1, evaluateSkewNormalMixture(t, mixture) / densityMax) : 0;

		// Most certain dates: local maxima of the certainty (inside the window) or, when they are all
		// outside, the dates of the components
		const peaks: number[] = [];
		for (let t = lo + STEP; t < hi; t += STEP) {
			const c = certaintyAt(t);
			if (c > 0.5 && c >= certaintyAt(t - STEP) && c > certaintyAt(t + STEP)) peaks.push(t);
		}
		const outsidePeaks =
			peaks.length === 0 ? mixture.map((c) => c.xi).filter((xi) => xi < lo || xi > hi) : [];

		const values: { t: number; value: number }[] = [];
		for (let t = lo; t <= hi + 1e-9; t += STEP) {
			const value = valueAt(t);
			if (Number.isFinite(value)) values.push({ t, value });
		}
		if (values.length === 0) return null;

		const [minValue, maxValue] = d3.extent(values, (d) => d.value) as [number, number];
		const range = maxValue - minValue > 1e-9 ? maxValue - minValue : Math.max(Math.abs(maxValue), 1) * 0.2;
		// The more certain the date (density near its maximum), the thinner the cloud
		const widthAt = (t: number) =>
			range *
			(WIDTH_MIN + (WIDTH_MAX - WIDTH_MIN) * Math.pow(1 - certaintyAt(t), WIDTH_SHAPE));

		const curve: CurvePoint[] = values.map((d) => ({ ...d, width: widthAt(d.t) }));

		return { valueAt, widthAt, certaintyAt, curve, peaks, outsidePeaks };
	});

	const margin = { top: 10, right: 12, bottom: 24, left: 46 };
	const innerWidth = $derived(Math.max(10, width - margin.left - margin.right));
	const innerHeight = $derived(Math.max(10, height - margin.top - margin.bottom));

	const geometry = $derived.by(() => {
		if (!model) return null;
		const xScale = d3.scaleLinear().domain([lo, hi]).range([0, innerWidth]);
		const low = d3.min(model.curve, (d) => d.value - d.width) ?? 0;
		const high = d3.max(model.curve, (d) => d.value + d.width) ?? 1;
		const yScale = d3.scaleLinear().domain([low, high]).nice().range([innerHeight, 0]);

		const line = d3
			.line<CurvePoint>()
			.x((d) => xScale(d.t))
			.y((d) => yScale(d.value))
			.curve(d3.curveMonotoneX);
		// The cloud is the density of a normal law of standard deviation w/2 around the curve (so that
		// +-w is about +-2 sigma), drawn as nested bands: the denser the color, the more probable.
		const cloud = CLOUD_LEVELS.map((level) =>
			d3
				.area<CurvePoint>()
				.x((d) => xScale(d.t))
				.y0((d) => yScale(d.value - (level * d.width) / 2))
				.y1((d) => yScale(d.value + (level * d.width) / 2))
				.curve(d3.curveMonotoneX)(model.curve) || ''
		);

		return {
			xScale,
			yScale,
			linePath: line(model.curve) || '',
			cloud,
			xTicks: d3.range(Math.ceil(lo / 10) * 10, hi + 1e-9, 10),
			yTicks: yScale.ticks(5)
		};
	});

	const formatter = $derived(
		new Intl.NumberFormat(locale, { notation: 'compact', maximumSignificantDigits: 3 })
	);
	const preciseFormatter = $derived(new Intl.NumberFormat(locale, { maximumSignificantDigits: 4 }));

	const active = $derived.by(() => {
		if (hoverT === null || !model || !geometry) return null;
		const t = Math.max(lo, Math.min(hi, hoverT));
		const value = model.valueAt(t);
		if (!Number.isFinite(value)) return null;
		const width = model.widthAt(t);
		return {
			t,
			value,
			width,
			certainty: model.certaintyAt(t) * 100,
			x: geometry.xScale(t),
			y: geometry.yScale(value)
		};
	});

	function handlePointerMove(event: PointerEvent) {
		if (!svgRef || !geometry) return;
		const rect = svgRef.getBoundingClientRect();
		const x = ((event.clientX - rect.left) / rect.width) * width - margin.left;
		hoverT = x < 0 || x > innerWidth ? null : geometry.xScale.invert(x);
	}

	function formatDate(t: number): string {
		const year = Math.floor(t);
		const month = Math.min(11, Math.floor((t - year) * 12));
		return new Date(Date.UTC(year, month, 1)).toLocaleDateString(locale, {
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		});
	}
</script>

<div class="evolution-container">
	{#if !components || !model || !geometry}
		<div class="error-badge">{m.simulation_evolution_invalid()}</div>
	{:else}
		<div class="function-list">
			{#each components as component}
				<div class="function-card">
					<div class="function-field">
						<span class="field-label">{m.simulation_evolution_function_label()}</span>
						<span class="function-expression">{component.function}</span>
					</div>
					<div class="function-field weight">
						<span class="field-label">{m.simulation_distribution_weight()}</span>
						<span class="function-weight">{Math.round((component.weight / totalWeight) * 1000) / 10}%</span>
					</div>
				</div>
			{/each}
			<p class="function-hint">
				{m.simulation_evolution_function_hint()}{#if unit}&nbsp;· {m.simulation_field_unit()} : {unit}{/if}
			</p>
		</div>

		<div class="chart-wrapper">
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<svg
				bind:this={svgRef}
				viewBox="0 0 {width} {height}"
				class="evolution-chart"
				onpointermove={handlePointerMove}
				onpointerleave={() => (hoverT = null)}
			>
				<g transform="translate({margin.left}, {margin.top})">
					{#each geometry.yTicks as tick}
						{@const y = geometry.yScale(tick)}
						<line x1="0" y1={y} x2={innerWidth} y2={y} class="grid-line" />
						<text x="-6" y={y + 3} class="axis-label y-axis">{formatter.format(tick)}</text>
					{/each}
					{#each geometry.xTicks as tick}
						{@const x = geometry.xScale(tick)}
						<line x1={x} y1="0" x2={x} y2={innerHeight} class="grid-line" />
						<text x={x} y={innerHeight + 14} class="axis-label x-axis">{tick}</text>
					{/each}

					{#each geometry.cloud as band}
						<path d={band} class="cloud-band" />
					{/each}
					<path d={geometry.linePath} class="curve" />

					<!-- Most certain dates: the cloud is the thinnest there -->
					{#each model.peaks as peak}
						<line
							x1={geometry.xScale(peak)}
							y1="0"
							x2={geometry.xScale(peak)}
							y2={innerHeight}
							class="peak-line"
						/>
					{/each}

					<!-- Today: the time axis is centered on it -->
					<line
						x1={geometry.xScale(today)}
						y1="0"
						x2={geometry.xScale(today)}
						y2={innerHeight}
						class="today-line"
					/>
					<text x={geometry.xScale(today) + 3} y="9" class="today-label">
						{m.simulation_evolution_today()}
					</text>

					{#if active}
						<line x1={active.x} y1="0" x2={active.x} y2={innerHeight} class="active-line" />
						<circle cx={active.x} cy={active.y} r="3.8" class="active-dot" />
					{/if}

					<line x1="0" y1={innerHeight} x2={innerWidth} y2={innerHeight} class="axis-line" />
					<line x1="0" y1="0" x2="0" y2={innerHeight} class="axis-line" />
				</g>
			</svg>
		</div>

		{#if model.outsidePeaks.length > 0}
			<p class="function-hint">
				{m.simulation_evolution_peak_outside({
					dates: model.outsidePeaks.map((xi) => Math.round(xi)).join(', ')
				})}
			</p>
		{/if}

		<div class="readout">
			{#if active}
				<span class="readout-time">{formatDate(active.t)}</span>
				<span>
					{m.simulation_field_value()} :
					<span class="readout-value">{preciseFormatter.format(active.value)} {unit}</span>
				</span>
				<span>
					{m.simulation_evolution_uncertainty()} :
					<span class="readout-value">± {preciseFormatter.format(active.width)} {unit}</span>
				</span>
			{:else}
				<span class="readout-empty">—</span>
			{/if}
		</div>

		<div class="legend">
			<span class="legend-item"><span class="swatch line"></span>{m.simulation_evolution_legend_curve()}</span>
			<span class="legend-item"><span class="swatch cloud"></span>{m.simulation_evolution_legend_cloud()}</span>
		</div>
	{/if}
</div>

<style>
	.evolution-container {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.function-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.function-card {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		padding: 5px 8px;
		background: rgb(15 23 42 / 55%);
		border: 1px solid rgb(148 163 184 / 20%);
		border-radius: 5px;
	}

	:global(body.light) .function-card {
		background: rgb(241 245 249 / 80%);
		border-color: rgb(203 213 225 / 70%);
	}

	.function-expression {
		color: #34d399;
		font-size: 12px;
		font-weight: 600;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		overflow-wrap: anywhere;
	}

	:global(body.light) .function-expression {
		color: #047857;
	}

	.function-field {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}

	.function-field.weight {
		align-items: flex-end;
		flex: none;
	}

	.field-label {
		color: #94a3b8;
		font-size: 9px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.function-weight {
		color: #e2e8f0;
		font-size: 12px;
		font-weight: 600;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	}

	:global(body.light) .function-weight {
		color: #243442;
	}

	.function-hint {
		margin: 0;
		color: #94a3b8;
		font-size: 10px;
	}

	.chart-wrapper {
		overflow: hidden;
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

	.evolution-chart {
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
	}

	:global(body.light) .axis-line {
		stroke: rgb(100 116 139 / 40%);
	}

	.axis-label {
		font-size: 9px;
		fill: #94a3b8;
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

	.cloud-band {
		fill: #10b981;
		fill-opacity: 0.1;
	}

	.curve {
		fill: none;
		stroke: #10b981;
		stroke-width: 2.2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.today-line {
		stroke: #fbbf24;
		stroke-width: 1;
		stroke-dasharray: 3 3;
		opacity: 0.8;
	}

	.peak-line {
		stroke: #a78bfa;
		stroke-width: 1;
		stroke-dasharray: 2 3;
		opacity: 0.8;
	}

	.today-label {
		font-size: 9px;
		font-weight: 600;
		fill: #fbbf24;
	}

	:global(body.light) .today-label {
		fill: #a16207;
	}

	.active-line {
		stroke: #38bdf8;
		stroke-width: 1.5;
		stroke-dasharray: 3 3;
		opacity: 0.85;
		pointer-events: none;
	}

	.active-dot {
		fill: #06b6d4;
		stroke: #ffffff;
		stroke-width: 1.6;
		pointer-events: none;
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
		color: #cbd5e1;
		font-size: 11px;
	}

	:global(body.light) .readout {
		background: rgb(248 250 252 / 90%);
		border-color: rgb(226 232 240 / 90%);
		color: #334155;
	}

	.readout-time {
		font-weight: 600;
	}

	.readout-value {
		color: #34d399;
		font-weight: 700;
	}

	:global(body.light) .readout-value {
		color: #047857;
	}

	.readout-empty {
		color: #64748b;
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
		background: #10b981;
	}

	.swatch.cloud {
		background: rgb(16 185 129 / 40%);
	}

	.error-badge {
		color: #f87171;
		font-size: 12px;
		background: rgb(239 68 68 / 10%);
		padding: 6px 10px;
		border-radius: 6px;
		border: 1px solid rgb(239 68 68 / 20%);
	}
</style>
