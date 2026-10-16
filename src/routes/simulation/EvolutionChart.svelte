<script lang="ts">
	import * as d3 from 'd3';
	import {
		buildEvolutionFunction,
		buildEvolutionUncertainty,
		existenceInterval,
		parseEvolutionFunction
	} from '$lib/simulation/event/EvolutionFunction';
	import * as m from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';

	let {
		evolution,
		unit = '',
		existence: existenceEvolution,
		clipToExistence = true,
		bounds,
		width = 320,
		height = 210,
		accent
	}: {
		evolution?: unknown;
		unit?: string;
		/** Probability that the fact exists over time: the evolution only exists while it is over 50% */
		existence?: unknown;
		/** False to draw the curve outside of the existence too (the existence curve itself) */
		clipToExistence?: boolean;
		/** Fixed bounds of the vertical axis (a probability goes from 0 to 1) */
		bounds?: [number, number];
		width?: number;
		height?: number;
		/** Color of the curve and of the formula (a character's resource or satisfaction) */
		accent?: { dark: string; light: string };
	} = $props();

	// Without a bound of existence, the graph shows 50 years from today (or from the other bound)
	const HALF_SPAN = 50;
	// Number of points of the curve
	const POINTS = 400;
	// Smallest span of the time axis: a day
	const MIN_SPAN = 1 / 365.25;
	// Margin around the existence, as a share of its length, so that its bounds are not on the edges
	const PADDING = 0.04;
	// Half-widths of the nested bands of the cloud, in standard deviations (w = 2 sigma)
	const CLOUD_LEVELS = [2.4, 2, 1.6, 1.2, 0.8, 0.4];
	// Thinnest cloud, as a share of the vertical range of the curve (keeps it visible when the uncertainty is 0)
	const MIN_WIDTH_SHARE = 0.015;

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

	// The fact exists while its probability of existing is over 50%
	const existenceComponents = $derived(parseEvolutionFunction(existenceEvolution));
	const existence = $derived(
		existenceComponents
			? existenceInterval(existenceComponents)
			: { exists: true, from: -Infinity, to: Infinity }
	);
	// Without clipping, the curve is drawn on the whole axis
	const drawn = $derived(!clipToExistence || existence.exists);

	// The time axis goes from the beginning to the end of the existence
	const axis = $derived.by(() => {
		const { from, to } = existence;
		let a: number;
		let b: number;
		if (Number.isFinite(from) && Number.isFinite(to)) {
			a = from;
			b = Math.max(to, from);
		} else if (Number.isFinite(from)) {
			a = from;
			b = Math.max(today, from) + HALF_SPAN;
		} else if (Number.isFinite(to)) {
			b = to;
			a = Math.min(today, to) - HALF_SPAN;
		} else {
			a = today - HALF_SPAN;
			b = today + HALF_SPAN;
		}
		if (b - a < MIN_SPAN) {
			const middle = (a + b) / 2;
			a = middle - MIN_SPAN / 2;
			b = middle + MIN_SPAN / 2;
		}
		const pad = (b - a) * PADDING;
		return {
			lo: Number.isFinite(from) ? a - pad : a,
			hi: Number.isFinite(to) ? b + pad : b
		};
	});
	const lo = $derived(axis.lo);
	const hi = $derived(axis.hi);
	const shownFrom = $derived(clipToExistence ? Math.max(lo, existence.from) : lo);
	const shownTo = $derived(clipToExistence ? Math.min(hi, existence.to) : hi);

	const model = $derived.by(() => {
		if (!components) return null;
		const valueAt = buildEvolutionFunction(components);

		const uncertaintyAt = buildEvolutionUncertainty(components);
		const values: { t: number; value: number }[] = [];
		if (drawn && shownFrom <= shownTo) {
			const times: number[] = [];
			const step = (hi - lo) / POINTS;
			for (let t = lo; t <= hi + 1e-9; t += step) {
				if (t >= shownFrom && t <= shownTo) times.push(t);
			}
			// The curve starts and stops exactly on the bounds of the existence
			if (times.length === 0 || times[0] > shownFrom) times.unshift(shownFrom);
			if (times[times.length - 1] < shownTo) times.push(shownTo);
			for (const t of times) {
				const value = valueAt(t);
				if (Number.isFinite(value)) values.push({ t, value });
			}
		}
		if (values.length === 0) {
			// Nothing to draw in the window (the fact does not exist there), but the formula is valid
			const sample = [lo, today, hi].map(valueAt).filter(Number.isFinite);
			if (sample.length === 0) return null;
			return { valueAt, widthAt: () => 0, curve: [] as CurvePoint[] };
		}

		const [minValue, maxValue] = d3.extent(values, (d) => d.value) as [number, number];
		const range = maxValue - minValue > 1e-9 ? maxValue - minValue : Math.max(Math.abs(maxValue), 1) * 0.2;
		// The cloud is the uncertainty of the components (a share of their value), never thinner than a few pixels
		const widthAt = (t: number) =>
			Math.max(uncertaintyAt(t), range * MIN_WIDTH_SHARE);

		const curve: CurvePoint[] = values.map((d) => ({ ...d, width: widthAt(d.t) }));

		return { valueAt, widthAt, curve };
	});

	const margin = { top: 10, right: 12, bottom: 24, left: 46 };
	const innerWidth = $derived(Math.max(10, width - margin.left - margin.right));
	const innerHeight = $derived(Math.max(10, height - margin.top - margin.bottom));

	const geometry = $derived.by(() => {
		if (!model) return null;
		const xScale = d3.scaleLinear().domain([lo, hi]).range([0, innerWidth]);
		const low = d3.min(model.curve, (d) => d.value - d.width) ?? 0;
		const high = d3.max(model.curve, (d) => d.value + d.width) ?? 1;

		const yScale = bounds
			? d3.scaleLinear().domain(bounds).range([innerHeight, 0])
			: d3.scaleLinear().domain([low, high]).nice().range([innerHeight, 0]);

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
			xTicks: xScale.ticks(6),
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
		if (!drawn || t < shownFrom || t > shownTo) return null;
		const value = model.valueAt(t);
		if (!Number.isFinite(value)) return null;
		const width = model.widthAt(t);
		return {
			t,
			value,
			width,
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

	// Years when the axis is long, otherwise a more precise date
	function formatTick(t: number): string {
		const span = hi - lo;
		if (span >= 8) return String(Math.round(t));
		const date = yearToDate(t);
		const options: Intl.DateTimeFormatOptions =
			span >= 1
				? { month: 'short', year: 'numeric' }
				: span >= 0.1
					? { day: 'numeric', month: 'short', year: 'numeric' }
					: { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };
		return date.toLocaleString(locale, { ...options, timeZone: 'UTC' });
	}

	function yearToDate(t: number): Date {
		const year = Math.floor(t);
		const start = new Date(0);
		start.setUTCFullYear(year, 0, 1);
		start.setUTCHours(0, 0, 0, 0);
		const end = new Date(0);
		end.setUTCFullYear(year + 1, 0, 1);
		end.setUTCHours(0, 0, 0, 0);
		return new Date(start.getTime() + (t - year) * (end.getTime() - start.getTime()));
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

<div
	class="evolution-container"
	class:accented={!!accent}
	style:--accent={accent?.dark}
	style:--accent-light={accent?.light}
>
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
						<span class="field-label">{m.simulation_evolution_uncertainty()}</span>
						<span class="function-weight">± {Math.round(component.uncertainty * 1000) / 10}%</span>
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
						<text x={x} y={innerHeight + 14} class="axis-label x-axis">{formatTick(tick)}</text>
					{/each}

					{#each geometry.cloud as band}
						<path d={band} class="cloud-band" />
					{/each}
					<path d={geometry.linePath} class="curve" />

					<!-- Existence of the fact: the evolution only exists between these two moments -->
					{#each [existence.from, existence.to] as bound}
						{#if existence.exists && bound > lo && bound < hi}
							<line
								x1={geometry.xScale(bound)}
								y1="0"
								x2={geometry.xScale(bound)}
								y2={innerHeight}
								class="bound-line"
							/>
						{/if}
					{/each}

					<!-- Today -->
					{#if today >= lo && today <= hi}
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
					{/if}

					{#if active}
						<line x1={active.x} y1="0" x2={active.x} y2={innerHeight} class="active-line" />
						<circle cx={active.x} cy={active.y} r="3.8" class="active-dot" />
					{/if}

					<line x1="0" y1={innerHeight} x2={innerWidth} y2={innerHeight} class="axis-line" />
					<line x1="0" y1="0" x2="0" y2={innerHeight} class="axis-line" />
				</g>
			</svg>
		</div>

		<p class="function-hint">
			{#if !existence.exists}
				{m.simulation_evolution_never_exists()}
			{:else}
				{m.simulation_evolution_existence({
					start: Number.isFinite(existence.from) ? formatDate(existence.from) : '…',
					end: Number.isFinite(existence.to) ? formatDate(existence.to) : '…'
				})}
			{/if}
		</p>

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
		color: var(--accent, #34d399);
		font-size: 12px;
		font-weight: 600;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		overflow-wrap: anywhere;
	}

	:global(body.light) .function-expression {
		color: var(--accent-light, #047857);
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
		fill: var(--accent, #10b981);
		fill-opacity: 0.1;
	}

	.curve {
		fill: none;
		stroke: var(--accent, #10b981);
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

	.bound-line {
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
		color: var(--accent, #34d399);
		font-weight: 700;
	}

	:global(body.light) .readout-value {
		color: var(--accent-light, #047857);
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
		background: var(--accent, #10b981);
	}

	.swatch.cloud {
		background: color-mix(in srgb, var(--accent, #10b981) 40%, transparent);
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
