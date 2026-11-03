<script lang="ts">
	import * as d3 from 'd3';
	import {
		buildEvolutionFunction,
		buildEvolutionUncertainty,
		existenceInterval,
		parseEvolutionFunction,
		parseSpline,
		splineDates,
		splineSides,
		type EvolutionComponent,
		type TimeRange
	} from '$lib/simulation/event/EvolutionFunction';
	import * as m from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';

	let {
		evolution,
		unit = '',
		existence: existenceEvolution,
		clipToExistence = true,
		showExistence = true,
		showUncertainty = true,
		edited,
		ranges,
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
		/** False to leave out the sentence about the existence (a score does not have one) */
		showExistence?: boolean;
		/** False for a function without uncertainty (a score): no cloud, no uncertainty above and below */
		showUncertainty?: boolean;
		/** The parts a proof changes: the others are in the shadow (undefined: nothing is in the shadow) */
		edited?: { function: boolean; above: boolean; below: boolean };
		/** The period of each changed part that the proof really changes: only this portion stands out */
		ranges?: { function?: TimeRange; above?: TimeRange; below?: TimeRange };
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
		down: number;
		up: number;
	}

	type Part = 'function' | 'above' | 'below';
	const PART_KEYS: Record<Part, keyof EvolutionComponent> = {
		function: 'function',
		above: 'uncertainty_up',
		below: 'uncertainty_down'
	};

	const uid = $props.id();
	let svgRef = $state<SVGSVGElement | null>(null);
	let hoverT = $state<number | null>(null);

	const locale = $derived(getLocale());
	const components = $derived(parseEvolutionFunction(evolution));

	/**
	 * The curves as they are listed: for each one, the weighted sum of the mixed functions at the dates of ALL their
	 * interpolation points (the sum lies exactly on the curve), and what they do before and after their points.
	 */
	const summary = $derived.by(() => {
		if (!components) return [];
		const valueAt = buildEvolutionFunction(components);
		const distancesAt = buildEvolutionUncertainty(components);
		const readers: Record<Part, (t: number) => number> = {
			function: valueAt,
			above: (t) => distancesAt(t).up,
			below: (t) => distancesAt(t).down
		};
		const parts: Part[] = showUncertainty ? ['function', 'above', 'below'] : ['function'];
		return parts.map((part) => {
			const expressions = components.map((component) => component[PART_KEYS[part]] as string);
			const dates = [...new Set(expressions.flatMap(splineDates))].sort((a, b) => a - b);
			const points = dates.flatMap((t) => {
				const value = readers[part](t);
				return Number.isFinite(value) ? [{ t, value }] : [];
			});
			return { part, points, sides: splineSides(expressions), expression: expressions[0] };
		});
	});

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

		const distancesAt = buildEvolutionUncertainty(components);
		// A value with fixed bounds (a probability) has no uncertainty beyond them.
		const uncertaintyAt = (t: number) => {
			const { down, up } = distancesAt(t);
			if (!bounds) return { down, up };
			const value = valueAt(t);
			return {
				down: Math.min(down, Math.max(0, value - bounds[0])),
				up: Math.min(up, Math.max(0, bounds[1] - value))
			};
		};
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
			return { valueAt, uncertaintyAt, curve: [] as CurvePoint[] };
		}

		const [minValue, maxValue] = d3.extent(values, (d) => d.value) as [number, number];
		const range = maxValue - minValue > 1e-9 ? maxValue - minValue : Math.max(Math.abs(maxValue), 1) * 0.2;
		// The cloud is the uncertainty of the components on each side, never thinner than a few pixels.
		// This minimum is only for the drawing: the readout gives the real uncertainty.
		const minWidth = range * MIN_WIDTH_SHARE;
		const curve: CurvePoint[] = values.map((d) => {
			const { down, up } = uncertaintyAt(d.t);
			return { ...d, down: Math.max(down, minWidth), up: Math.max(up, minWidth) };
		});

		return { valueAt, uncertaintyAt, curve };
	});

	const margin = { top: 10, right: 12, bottom: 24, left: 46 };
	const innerWidth = $derived(Math.max(10, width - margin.left - margin.right));
	const innerHeight = $derived(Math.max(10, height - margin.top - margin.bottom));

	const geometry = $derived.by(() => {
		if (!model) return null;
		const xScale = d3.scaleLinear().domain([lo, hi]).range([0, innerWidth]);
		const low = d3.min(model.curve, (d) => d.value - d.down) ?? 0;
		const high = d3.max(model.curve, (d) => d.value + d.up) ?? 1;

		const yScale = bounds
			? d3.scaleLinear().domain(bounds).range([innerHeight, 0])
			: d3.scaleLinear().domain([low, high]).nice().range([innerHeight, 0]);

		const line = d3
			.line<CurvePoint>()
			.x((d) => xScale(d.t))
			.y((d) => yScale(d.value))
			.curve(d3.curveMonotoneX);
		// The cloud is the density of a normal law on each side of the curve, of standard deviation w/2 with the
		// width w of this side (so that w is about 2 sigma), drawn as nested bands: the denser the color, the more
		// probable. It stops at the fixed bounds of the value.
		const inBounds = (value: number) =>
			bounds ? Math.min(bounds[1], Math.max(bounds[0], value)) : value;
		// Each side has its own bands, so that the side a proof changes can stand out.
		const above = CLOUD_LEVELS.map((level) =>
			d3
				.area<CurvePoint>()
				.x((d) => xScale(d.t))
				.y0((d) => yScale(inBounds(d.value)))
				.y1((d) => yScale(inBounds(d.value + (level * d.up) / 2)))
				.curve(d3.curveMonotoneX)(model.curve) || ''
		);
		const below = CLOUD_LEVELS.map((level) =>
			d3
				.area<CurvePoint>()
				.x((d) => xScale(d.t))
				.y0((d) => yScale(inBounds(d.value - (level * d.down) / 2)))
				.y1((d) => yScale(inBounds(d.value)))
				.curve(d3.curveMonotoneX)(model.curve) || ''
		);

		// The interpolation points of the curves: exact on a single spline, at the dates of the points of each proof on
		// a mix of proofs (the mixed curve does not go through them).
		const shown = (t: number) => drawn && t >= shownFrom && t <= shownTo;
		const knotsOf = (part: Part) => {
			const key = PART_KEYS[part];
			const exact = components!.length === 1 && parseSpline(components![0][key]) !== null;
			const dates = [...new Set(components!.flatMap((component) => splineDates(component[key])))].filter(shown);
			const points = dates.flatMap((t) => {
				const value = model.valueAt(t);
				if (!Number.isFinite(value)) return [];
				const { down, up } = model.uncertaintyAt(t);
				const at = part === 'function' ? value : part === 'above' ? value + up : value - down;
				return [{ t, value: at, x: xScale(t), y: yScale(inBounds(at)) }];
			});
			return { exact, points };
		};
		const knots = { function: knotsOf('function'), above: knotsOf('above'), below: knotsOf('below') };

		// The portion a proof really changes, for each part it changes: drawn in full light, the rest in the shadow.
		const spanOf = (range: TimeRange) => {
			const from = xScale(Math.max(lo, range[0] ?? lo));
			const to = xScale(Math.min(hi, range[1] ?? hi));
			return to > from ? { x: from, width: to - from } : null;
		};
		const highlights = Object.fromEntries(
			(['function', 'above', 'below'] as Part[]).flatMap((part) => {
				const range = ranges?.[part];
				const span = edited?.[part] && range ? spanOf(range) : null;
				return span ? [[part, span]] : [];
			})
		) as Partial<Record<Part, { x: number; width: number }>>;

		return {
			xScale,
			yScale,
			linePath: line(model.curve) || '',
			cloudAbove: above,
			cloudBelow: below,
			knots,
			highlights,
			xTicks: xScale.ticks(6),
			yTicks: yScale.ticks(5)
		};
	});

	/** How a part is drawn: in the light, in the shadow, or in the shadow with the portion the proof changes in the light. */
	function partState(part: Part): 'light' | 'shadow' | 'portion' {
		if (!edited) return 'light';
		if (!edited[part]) return 'shadow';
		return geometry?.highlights[part] ? 'portion' : 'light';
	}

	/** The span of every portion a proof changes, drawn behind the curves (once when several parts share it). */
	const editedSpans = $derived.by(() => {
		const spans = new Map<string, { x: number; width: number }>();
		for (const span of Object.values(geometry?.highlights ?? {})) {
			if (span) spans.set(`${span.x.toFixed(1)}:${span.width.toFixed(1)}`, span);
		}
		return [...spans.values()];
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
		return {
			t,
			value,
			uncertainty: model.uncertaintyAt(t),
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

	/** The date of an interpolation point: its year when it is a round year, else its month. */
	function formatPointDate(t: number): string {
		if (Math.abs(t - Math.round(t)) < 1e-6) return String(Math.round(t));
		return yearToDate(t).toLocaleDateString(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' });
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

<!-- The curves as they are listed: the (weighted) interpolation points and what happens outside of them. -->
{#snippet curveSummary(item: (typeof summary)[number])}
	{#if item.points.length > 0}
		<ul class="spline-points" aria-label={m.simulation_evolution_points()}>
			{#each item.points as point}
				<li class="spline-point" title={preciseFormatter.format(point.value)}>
					<span class="spline-date">{formatPointDate(point.t)}</span>
					<span class="spline-value">{formatter.format(point.value)}</span>
				</li>
			{/each}
		</ul>
		<div class="spline-sides">
			<span class="spline-side">
				<span class="spline-side-label">← {m.simulation_evolution_before()}</span>
				<code>{item.sides.before.join(' | ') || m.simulation_evolution_flat()}</code>
			</span>
			<span class="spline-side">
				<span class="spline-side-label">{m.simulation_evolution_after()} →</span>
				<code>{item.sides.after.join(' | ') || m.simulation_evolution_flat()}</code>
			</span>
		</div>
	{:else}
		<span class="function-expression">{item.expression}</span>
	{/if}
{/snippet}

<!-- One part of the curve (the curve, or a band of the cloud): its portion changed by a proof stands out. -->
{#snippet partPath(d: string, kind: string, part: Part)}
	{@const state = partState(part)}
	<path {d} class={kind} class:shadow={state !== 'light'} />
	{#if state === 'portion'}
		<path {d} class={kind} clip-path="url(#{uid}-{part})" />
	{/if}
{/snippet}

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
			<div class="function-card">
				{#each summary as item (item.part)}
					<div
						class="function-field"
						class:uncertainty={item.part !== 'function'}
						class:shadow={edited && !edited[item.part]}
					>
						<span class="field-label">
							{item.part === 'function'
								? m.simulation_evolution_function_label()
								: item.part === 'above'
									? m.simulation_evolution_uncertainty_above()
									: m.simulation_evolution_uncertainty_below()}
						</span>
						{@render curveSummary(item)}
					</div>
				{/each}
			</div>
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
				<defs>
					{#each Object.entries(geometry.highlights) as [part, span] (part)}
						<clipPath id="{uid}-{part}">
							<rect x={span.x} y={-margin.top} width={span.width} height={innerHeight + margin.top + margin.bottom} />
						</clipPath>
					{/each}
				</defs>
				<g transform="translate({margin.left}, {margin.top})">
					<!-- The period a proof really changes -->
					{#each editedSpans as span}
						<rect x={span.x} y="0" width={span.width} height={innerHeight} class="edited-band" />
					{/each}
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

					{#if showUncertainty}
						{#each geometry.cloudAbove as band}
							{@render partPath(band, 'cloud-band', 'above')}
						{/each}
						{#each geometry.cloudBelow as band}
							{@render partPath(band, 'cloud-band', 'below')}
						{/each}
					{/if}
					{@render partPath(geometry.linePath, 'curve', 'function')}

					<!-- The interpolation points: of the curve, and of each side of the uncertainty -->
					{#each (showUncertainty ? (['above', 'below'] as Part[]) : []) as part}
						{#each geometry.knots[part].points as point}
							<line
								x1={point.x - 3}
								x2={point.x + 3}
								y1={point.y}
								y2={point.y}
								class="knot-side"
								class:mixed={!geometry.knots[part].exact}
								class:shadow={partState(part) === 'shadow'}
							>
								<title>{formatDate(point.t)} : {preciseFormatter.format(point.value)} {unit}</title>
							</line>
						{/each}
					{/each}
					{#each geometry.knots.function.points as point}
						<circle
							cx={point.x}
							cy={point.y}
							r="3"
							class="knot"
							class:mixed={!geometry.knots.function.exact}
							class:shadow={partState('function') === 'shadow'}
						>
							<title>{formatDate(point.t)} : {preciseFormatter.format(point.value)} {unit}</title>
						</circle>
					{/each}

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

		{#if showExistence}
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
		{/if}

		<div class="readout">
			{#if active}
				<span class="readout-time">{formatDate(active.t)}</span>
				<span>
					{m.simulation_field_value()} :
					<span class="readout-value">{preciseFormatter.format(active.value)} {unit}</span>
				</span>
				{#if showUncertainty}
					<span>
						{m.simulation_evolution_uncertainty_above()} :
						<span class="readout-value">+{preciseFormatter.format(active.uncertainty.up)} {unit}</span>
					</span>
					<span>
						{m.simulation_evolution_uncertainty_below()} :
						<span class="readout-value">−{preciseFormatter.format(active.uncertainty.down)} {unit}</span>
					</span>
				{/if}
			{:else}
				<span class="readout-empty">—</span>
			{/if}
		</div>

		<div class="legend">
			<span class="legend-item"><span class="swatch line"></span>{m.simulation_evolution_legend_curve()}</span>
			{#if showUncertainty}
				<span class="legend-item"><span class="swatch cloud"></span>{m.simulation_evolution_legend_cloud()}</span>
			{/if}
			{#if geometry.knots.function.points.length > 0}
				<span class="legend-item">
					<span class="swatch knot" class:mixed={!geometry.knots.function.exact}></span>
					{geometry.knots.function.exact ? m.simulation_evolution_legend_points() : m.simulation_evolution_legend_mixed_points()}
				</span>
			{/if}
			{#if editedSpans.length > 0}
				<span class="legend-item"><span class="swatch edited"></span>{m.simulation_evolution_legend_edited()}</span>
			{/if}
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
		flex-direction: column;
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
		flex: 1 1 0;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}

	.function-field.weight {
		align-items: flex-end;
		flex: none;
	}

	/* An uncertainty is an expression of its own: it takes a whole line. */
	.function-field.uncertainty {
		flex: 1 0 100%;
		overflow-wrap: anywhere;
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

	.functions-toggle {
		width: 100%;
		min-height: 36px;
		margin-top: 2px;
		padding: 8px 12px;
		background: color-mix(in srgb, var(--accent, #34d399) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent, #34d399) 50%, transparent);
		border-radius: 6px;
		color: var(--accent, #34d399);
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.functions-toggle:hover {
		background: color-mix(in srgb, var(--accent, #34d399) 24%, transparent);
	}

	:global(body.light) .functions-toggle {
		background: color-mix(in srgb, var(--accent-light, #047857) 10%, transparent);
		border-color: color-mix(in srgb, var(--accent-light, #047857) 50%, transparent);
		color: var(--accent-light, #047857);
	}

	:global(body.light) .functions-toggle:hover {
		background: color-mix(in srgb, var(--accent-light, #047857) 20%, transparent);
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

	.cloud-band.shadow {
		fill-opacity: 0.02;
	}

	.curve.shadow {
		opacity: 0.25;
	}

	.function-field.shadow {
		opacity: 0.35;
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

	.knot {
		fill: var(--accent, #10b981);
		stroke: #ffffff;
		stroke-width: 1.2;
	}

	.knot.mixed {
		fill: rgb(8 14 29 / 85%);
		stroke: var(--accent, #10b981);
	}

	:global(body.light) .knot.mixed {
		fill: #ffffff;
	}

	.knot-side {
		stroke: var(--accent, #10b981);
		stroke-width: 1.6;
		stroke-linecap: round;
	}

	.knot-side.mixed {
		stroke-dasharray: 1 1.5;
	}

	.knot.shadow,
	.knot-side.shadow {
		opacity: 0.3;
	}

	.edited-band {
		fill: #fbbf24;
		fill-opacity: 0.08;
		stroke: #fbbf24;
		stroke-opacity: 0.35;
		stroke-dasharray: 3 3;
	}

	.swatch.knot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent, #10b981);
	}

	.swatch.knot.mixed {
		background: transparent;
		border: 1.5px solid var(--accent, #10b981);
	}

	.swatch.edited {
		background: rgb(251 191 36 / 18%);
		border: 1px dashed rgb(251 191 36 / 70%);
	}

	/* The interpolation points: one small card per point, date above and value below. */
	.spline-points {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(58px, 1fr));
		gap: 4px;
		margin: 2px 0 0;
		padding: 0;
		list-style: none;
	}

	.spline-point {
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 3px 6px;
		border-left: 2px solid var(--accent, #34d399);
		border-radius: 3px;
		background: color-mix(in srgb, var(--accent, #34d399) 9%, transparent);
		font-variant-numeric: tabular-nums;
		line-height: 1.25;
	}

	.spline-date {
		color: #94a3b8;
		font-size: 9px;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	.spline-value {
		color: var(--accent, #34d399);
		font-size: 12px;
		font-weight: 700;
	}

	:global(body.light) .spline-value {
		color: var(--accent-light, #047857);
	}

	:global(body.light) .spline-date {
		color: #64748b;
	}

	/* What the curve does before the first point and after the last one. */
	.spline-sides {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 4px;
	}

	.spline-side {
		display: inline-flex;
		align-items: baseline;
		gap: 5px;
		max-width: 100%;
		padding: 1px 8px;
		border: 1px dashed rgb(148 163 184 / 35%);
		border-radius: 999px;
		color: #cbd5e1;
		font-size: 10px;
		overflow-wrap: anywhere;
	}

	:global(body.light) .spline-side {
		color: #334155;
	}

	.spline-side-label {
		color: #94a3b8;
		font-weight: 600;
		white-space: nowrap;
	}

	.spline-side code {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
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
