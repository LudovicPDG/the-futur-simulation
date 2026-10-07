import { skewNormalMixtureQuantile, type SkewNormalParameter } from './ProbabilityDistribution';

/**
 * Segmented ("condensed") time axis for a mixture of skew normals.
 *
 * Every group of overlapping scenarios gets its own segment of the x axis, drawn at a readable
 * zoom level. The uninteresting periods between two segments are condensed into a small fixed-width
 * gap (drawn with `//`). The mapping time <-> pixel is piecewise linear and continuous, so the
 * cumulative curve never jumps.
 *
 * Times are decimal years (2027.0 = 1 January 2027 00:00 UTC).
 */

export type TimeUnit = 'year' | 'month' | 'day' | 'hour' | 'minute';

export interface AxisTick {
	t: number;
	label: string;
}

export interface AxisGroup {
	/** Start / end of the period, clipped to the segment (decimal years) */
	lo: number;
	hi: number;
	label: string;
	/** Shorter label, used when the period is drawn too narrow for the normal one */
	short: string;
}

export interface AxisSegment {
	lo: number;
	hi: number;
	x0: number;
	x1: number;
	/** Share of the whole mixture (0-1) carried by the scenarios of this segment */
	mass: number;
	unit: TimeUnit;
	step: number;
	/**
	 * Rows displayed under the ticks, from the finest to the coarsest unit (e.g. month then year
	 * for day ticks). Each row is a list of periods clipped to the segment.
	 */
	levels: AxisGroup[][];
	ticks: AxisTick[];
}

export interface AxisGap {
	/** Index of the segment on the left of the gap */
	after: number;
	x0: number;
	x1: number;
	/** Condensed duration in years */
	years: number;
}

export interface SegmentedAxis {
	segments: AxisSegment[];
	gaps: AxisGap[];
	toX: (t: number) => number;
	toT: (x: number) => number;
	segmentIndexAt: (t: number) => number;
}

const GAP_WIDTH = 22;
const LOWER_QUANTILE = 0.005;
const UPPER_QUANTILE = 0.995;
const PADDING_RATIO = 0.15;
const MAX_TICKS = 5;
const MAX_DATE_YEARS = 200000;

// ---------------------------------------------------------------------------------------------
// Calendar helpers (decimal years <-> UTC dates)
// ---------------------------------------------------------------------------------------------

function yearStartMs(year: number): number {
	const d = new Date(0);
	d.setUTCFullYear(year, 0, 1);
	d.setUTCHours(0, 0, 0, 0);
	return d.getTime();
}

export function yearToDate(t: number): Date | null {
	if (!isFinite(t) || Math.abs(t) > MAX_DATE_YEARS) return null;
	const year = Math.floor(t);
	const start = yearStartMs(year);
	const end = yearStartMs(year + 1);
	// Rounded to the second: float error on decimal years would otherwise turn midnight into 23:59:59
	return new Date(Math.round((start + (t - year) * (end - start)) / 1000) * 1000);
}

function dateToYear(ms: number): number {
	const d = new Date(ms);
	const year = d.getUTCFullYear();
	const start = yearStartMs(year);
	const end = yearStartMs(year + 1);
	return year + (ms - start) / (end - start);
}

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

function fmt(date: Date, locale: string, options: Intl.DateTimeFormatOptions): string {
	return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options }).format(date);
}

// ---------------------------------------------------------------------------------------------
// Tick unit selection
// ---------------------------------------------------------------------------------------------

const DAYS_PER_YEAR = 365.2425;

interface UnitCandidate {
	unit: TimeUnit;
	step: number;
	years: number;
}

function buildCandidates(): UnitCandidate[] {
	const list: UnitCandidate[] = [];
	const add = (unit: TimeUnit, steps: number[], yearsPerUnit: number) => {
		for (const step of steps) list.push({ unit, step, years: step * yearsPerUnit });
	};
	add('minute', [1, 2, 5, 10, 15, 30], 1 / (DAYS_PER_YEAR * 1440));
	add('hour', [1, 2, 3, 6, 12], 1 / (DAYS_PER_YEAR * 24));
	add('day', [1, 2, 5, 10, 15], 1 / DAYS_PER_YEAR);
	add('month', [1, 2, 3, 6], 1 / 12);
	const yearSteps: number[] = [];
	for (let k = 0; k <= 9; k++) for (const m of [1, 2, 5]) yearSteps.push(m * 10 ** k);
	add('year', yearSteps, 1);
	return list.sort((a, b) => a.years - b.years);
}

const CANDIDATES = buildCandidates();

function chooseUnit(span: number): { unit: TimeUnit; step: number } {
	for (const c of CANDIDATES) {
		if (span / c.years <= MAX_TICKS) return { unit: c.unit, step: c.step };
	}
	const last = CANDIDATES[CANDIDATES.length - 1];
	return { unit: last.unit, step: last.step };
}

/** Decimal-year positions of the aligned ticks in [lo, hi] */
function tickPositions(lo: number, hi: number, unit: TimeUnit, step: number): number[] {
	const out: number[] = [];

	if (unit === 'year') {
		for (let y = Math.ceil(lo / step) * step; y <= hi; y += step) out.push(y);
		return out;
	}

	if (unit === 'month') {
		for (let idx = Math.floor(lo) * 12; ; idx++) {
			if (idx % step !== 0) continue;
			const year = Math.floor(idx / 12);
			const d = new Date(0);
			d.setUTCFullYear(year, idx - year * 12, 1);
			d.setUTCHours(0, 0, 0, 0);
			const t = dateToYear(d.getTime());
			if (t > hi) break;
			if (t >= lo) out.push(t);
		}
		return out;
	}

	const loDate = yearToDate(lo);
	const hiDate = yearToDate(hi);
	if (!loDate || !hiDate) return out;
	const loMs = loDate.getTime();
	const hiMs = hiDate.getTime();

	if (unit === 'day') {
		const dayMs = 86400000;
		for (let ms = Math.ceil(loMs / dayMs) * dayMs; ms <= hiMs; ms += dayMs) {
			if (step > 1 && (new Date(ms).getUTCDate() - 1) % step !== 0) continue;
			out.push(dateToYear(ms));
		}
		return out;
	}

	const stepMs = step * (unit === 'hour' ? 3600000 : 60000);
	for (let ms = Math.ceil(loMs / stepMs) * stepMs; ms <= hiMs; ms += stepMs) {
		out.push(dateToYear(ms));
	}
	return out;
}

// ---------------------------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------------------------

/** Label of a tick: only the finest unit, the bigger ones are written once under the axis */
function tickLabel(t: number, unit: TimeUnit, locale: string): string {
	const date = yearToDate(t);
	if (!date) return String(Math.round(t));
	switch (unit) {
		case 'year':
			return String(Math.round(t));
		case 'month':
			return fmt(date, locale, { month: 'short' });
		case 'day':
			return String(date.getUTCDate());
		case 'hour':
			return `${date.getUTCHours()}h`;
		case 'minute':
			return pad2(date.getUTCMinutes());
	}
}

type PeriodLevel = 'year' | 'month' | 'day' | 'hour';

function periodStart(ms: number, level: PeriodLevel): number {
	const d = new Date(ms);
	switch (level) {
		case 'year':
			return yearStartMs(d.getUTCFullYear());
		case 'month': {
			const m = new Date(0);
			m.setUTCFullYear(d.getUTCFullYear(), d.getUTCMonth(), 1);
			m.setUTCHours(0, 0, 0, 0);
			return m.getTime();
		}
		case 'day':
			return Math.floor(ms / 86400000) * 86400000;
		case 'hour':
			return Math.floor(ms / 3600000) * 3600000;
	}
}

function nextPeriodStart(start: number, level: PeriodLevel): number {
	const d = new Date(start);
	switch (level) {
		case 'year':
			return yearStartMs(d.getUTCFullYear() + 1);
		case 'month': {
			const m = new Date(0);
			m.setUTCFullYear(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
			m.setUTCHours(0, 0, 0, 0);
			return m.getTime();
		}
		case 'day':
			return start + 86400000;
		case 'hour':
			return start + 3600000;
	}
}

interface LevelSpec {
	level: PeriodLevel;
	label: (d: Date, locale: string) => string;
	short?: (d: Date, locale: string) => string;
}

const dayMonth = (d: Date, locale: string) => fmt(d, locale, { day: 'numeric', month: 'short' });
const yearLevel: LevelSpec = { level: 'year', label: (d) => String(d.getUTCFullYear()) };

/** Rows written under the ticks of each unit (finest first) */
const LEVEL_SPECS: Record<TimeUnit, LevelSpec[]> = {
	year: [],
	month: [yearLevel],
	day: [
		{
			level: 'month',
			label: (d, l) => fmt(d, l, { month: 'long' }),
			short: (d, l) => fmt(d, l, { month: 'short' })
		},
		yearLevel
	],
	hour: [{ level: 'day', label: dayMonth }, yearLevel],
	minute: [
		{ level: 'hour', label: (d) => `${d.getUTCHours()}h` },
		{ level: 'day', label: dayMonth },
		yearLevel
	]
};

function buildLevels(lo: number, hi: number, unit: TimeUnit, locale: string): AxisGroup[][] {
	const loDate = yearToDate(lo);
	const hiDate = yearToDate(hi);
	if (!loDate || !hiDate) return [];

	return LEVEL_SPECS[unit].map((spec) => {
		const groups: AxisGroup[] = [];
		let start = periodStart(loDate.getTime(), spec.level);
		// The tick unit keeps spans small, the guard only protects against pathological ranges
		for (let guard = 0; start < hiDate.getTime() && guard < 50; guard++) {
			const next = nextPeriodStart(start, spec.level);
			const date = new Date(start);
			const label = spec.label(date, locale);
			groups.push({
				lo: Math.max(lo, dateToYear(start)),
				hi: Math.min(hi, dateToYear(next)),
				label,
				short: spec.short ? spec.short(date, locale) : label
			});
			start = next;
		}
		return groups;
	});
}

/** Full date, down to the precision of the given tick unit (used by the tooltip) */
export function formatPreciseDate(t: number, unit: TimeUnit, locale: string): string {
	const date = yearToDate(t);
	if (!date) return String(Math.round(t));
	switch (unit) {
		case 'year':
			return String(Math.round(t));
		case 'month':
			return fmt(date, locale, { month: 'long', year: 'numeric' });
		case 'day':
			return fmt(date, locale, { day: 'numeric', month: 'long', year: 'numeric' });
		case 'hour':
			return `${fmt(date, locale, { day: 'numeric', month: 'long', year: 'numeric' })}, ${date.getUTCHours()}h`;
		case 'minute':
			return `${fmt(date, locale, { day: 'numeric', month: 'long', year: 'numeric' })}, ${date.getUTCHours()}:${pad2(date.getUTCMinutes())}`;
	}
}

/** "99 years", "3 months", "12 hours"... for the condensed periods */
export function formatDuration(years: number, locale: string): string {
	const choices: { unit: string; value: number }[] = [
		{ unit: 'year', value: years },
		{ unit: 'month', value: years * 12 },
		{ unit: 'day', value: years * DAYS_PER_YEAR },
		{ unit: 'hour', value: years * DAYS_PER_YEAR * 24 },
		{ unit: 'minute', value: years * DAYS_PER_YEAR * 1440 }
	];
	const chosen = choices.find((c) => c.value >= 1) ?? choices[choices.length - 1];
	return new Intl.NumberFormat(locale, {
		style: 'unit',
		unit: chosen.unit,
		unitDisplay: 'long',
		maximumFractionDigits: 0
	}).format(Math.max(1, Math.round(chosen.value)));
}

// ---------------------------------------------------------------------------------------------
// Axis construction
// ---------------------------------------------------------------------------------------------

/** Fills the ticks and the context rows (month, year...) of a segment */
export function finalizeSegment(segment: AxisSegment, locale: string): void {
	const { unit, step } = chooseUnit(segment.hi - segment.lo);
	segment.unit = unit;
	segment.step = step;
	segment.levels = buildLevels(segment.lo, segment.hi, unit, locale);
	segment.ticks = tickPositions(segment.lo, segment.hi, unit, step).map((t) => ({
		t,
		label: tickLabel(t, unit, locale)
	}));
}

export function buildSegmentedAxis(
	mixture: SkewNormalParameter[],
	innerWidth: number,
	locale: string
): SegmentedAxis {
	const totalWeight = mixture.reduce((sum, c) => sum + (c.weight > 0 ? c.weight : 1), 0) || 1;

	// 1. One interval per scenario (central 99% of its own mass), padded a little
	const intervals = mixture
		.map((comp) => {
			let lo = skewNormalMixtureQuantile(LOWER_QUANTILE, [comp]);
			let hi = skewNormalMixtureQuantile(UPPER_QUANTILE, [comp]);
			if (!(hi - lo > 0)) {
				lo = comp.xi - comp.omega;
				hi = comp.xi + comp.omega;
			}
			const pad = (hi - lo) * PADDING_RATIO;
			return { lo: lo - pad, hi: hi + pad, weight: comp.weight > 0 ? comp.weight : 1 };
		})
		.sort((a, b) => a.lo - b.lo);

	// 2. Merge overlapping intervals: they share a segment
	const merged: { lo: number; hi: number; weight: number }[] = [];
	for (const interval of intervals) {
		const last = merged[merged.length - 1];
		if (last && interval.lo <= last.hi) {
			last.hi = Math.max(last.hi, interval.hi);
			last.weight += interval.weight;
		} else {
			merged.push({ ...interval });
		}
	}

	// 3. Share the pixels: fixed-width gaps, then segments weighted by their mass
	const gapCount = merged.length - 1;
	const available = Math.max(10, innerWidth - gapCount * GAP_WIDTH);
	const shares = merged.map((s) => 0.5 + s.weight / totalWeight);
	const shareSum = shares.reduce((a, b) => a + b, 0);

	const segments: AxisSegment[] = [];
	const gaps: AxisGap[] = [];
	let cursor = 0;
	merged.forEach((s, i) => {
		const width = (shares[i] / shareSum) * available;
		segments.push({
			lo: s.lo,
			hi: s.hi,
			x0: cursor,
			x1: cursor + width,
			mass: s.weight / totalWeight,
			unit: 'year',
			step: 1,
			levels: [],
			ticks: []
		});
		cursor += width;
		if (i < gapCount) {
			gaps.push({
				after: i,
				x0: cursor,
				x1: cursor + GAP_WIDTH,
				years: merged[i + 1].lo - s.hi
			});
			cursor += GAP_WIDTH;
		}
	});

	for (const segment of segments) finalizeSegment(segment, locale);

	const toX = (t: number): number => {
		const first = segments[0];
		if (t <= first.lo) return first.x0;
		for (let i = 0; i < segments.length; i++) {
			const s = segments[i];
			if (t <= s.hi) return s.x0 + ((t - s.lo) / (s.hi - s.lo)) * (s.x1 - s.x0);
			const gap = gaps[i];
			const next = segments[i + 1];
			if (gap && next && t < next.lo) {
				return gap.x0 + ((t - s.hi) / (next.lo - s.hi)) * (gap.x1 - gap.x0);
			}
		}
		return segments[segments.length - 1].x1;
	};

	const toT = (x: number): number => {
		const first = segments[0];
		if (x <= first.x0) return first.lo;
		for (let i = 0; i < segments.length; i++) {
			const s = segments[i];
			if (x <= s.x1) return s.lo + ((x - s.x0) / (s.x1 - s.x0)) * (s.hi - s.lo);
			const gap = gaps[i];
			const next = segments[i + 1];
			if (gap && next && x < gap.x1) {
				return s.hi + ((x - gap.x0) / (gap.x1 - gap.x0)) * (next.lo - s.hi);
			}
		}
		return segments[segments.length - 1].hi;
	};

	const segmentIndexAt = (t: number): number => {
		for (let i = 0; i < segments.length; i++) {
			if (t <= segments[i].hi) return t >= segments[i].lo ? i : -1;
		}
		return -1;
	};

	return { segments, gaps, toX, toT, segmentIndexAt };
}
