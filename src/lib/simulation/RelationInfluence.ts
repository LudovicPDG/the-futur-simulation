import { hermiteAt, pchipSlopes } from './event/EvolutionFunction';

/**
 * How the relations of a value are combined with it.
 *
 *            V0·(A0·E0)² + Σ ( Vi·Ai·Ei·Ri·Ii·Oi )
 *   V  =  ───────────────────────────────────────────
 *               (A0·E0)² + Σ ( Ai·Ei·Ri·Oi )
 *
 * Ii does not weigh the relation: it converts the other value Vi into an estimate of V0. What is stored and
 * interpolated is this estimate Pi(Vi) = Vi·Ii(Vi) (so nothing is divided, and Vi = 0 is fine). V is then the
 * weighted average of V0 and of the estimates Pi(Vi) of the relations. With Ii = V0/Vi at the known points, Pi = V0:
 * a consistent relation does not move the value, and an inconsistent one pulls it toward its estimate.
 *
 * The scores (veracity, originality) are percentages (0..100), used as shares (0..1). Both weights have four score
 * factors, so the result does not depend on that scale.
 */

/** The estimate of V0 that a relation gives from the other value Vi: Pi(Vi) = Vi·Ii(Vi). */
export type EstimateFunction =
	/** Pi = factor·Vi: Ii is constant, the usual ratio. */
	| { kind: 'proportional'; factor: number }
	/** Pi = Vi + offset: "adds 5". */
	| { kind: 'additive'; offset: number }
	/** Pi = constant / Vi: the more Vi, the less V0. Not defined in Vi = 0 (then the relation does not vote). */
	| { kind: 'inverse'; constant: number }
	/** Pi goes through the points [Vi, Pi] (monotone cubic interpolation, flat outside of them). */
	| { kind: 'points'; points: [number, number][] };

/** The range in which an estimate is plausible for the quantity (in its own unit). */
export interface Bounds {
	min?: number;
	max?: number;
}

export interface RelationInput {
	/** The other value Vi. */
	value: number;
	/** The estimate function Pi, with Ii(Vi) = Pi(Vi) / Vi. */
	estimate: EstimateFunction;
	/** Veracity of the other value, from 0 to 100. */
	valueVeracity: number;
	/** Veracity of the element of the other value, from 0 to 100. */
	elementVeracity: number;
	/** Veracity of the relation, from 0 to 100. */
	relationVeracity: number;
	/** Originality of the relation, from 0 to 100. */
	originality: number;
}

export interface RelationContribution {
	/** The estimate of V0 given by the relation, bounded; undefined when it cannot be computed. */
	estimate?: number;
	/** The weight of the relation in the average (0..1 scale); 0 when it does not vote. */
	weight: number;
	/** Ii(Vi) = Pi(Vi) / Vi, derived for display; undefined in Vi = 0. */
	impact?: number;
	/** Pi(Vi) - V0: how much the relation contradicts V0 (0 = consistent). Undefined without estimate. */
	conflict?: number;
}

export interface RelationResult {
	/** The decided value; undefined when nothing has any weight (0 / 0). */
	value?: number;
	contributions: RelationContribution[];
}

/** The estimate function written by the genie (flat form), or undefined when it is not usable. */
export function toEstimateFunction(data: {
	kind: string;
	parameter?: number;
	points?: { source_value: number; estimated_value: number }[];
}): EstimateFunction | undefined {
	const parameter = Number(data.parameter);
	switch (data.kind) {
		case 'proportional':
			return Number.isFinite(parameter) ? { kind: 'proportional', factor: parameter } : undefined;
		case 'additive':
			return Number.isFinite(parameter) ? { kind: 'additive', offset: parameter } : undefined;
		case 'inverse':
			return Number.isFinite(parameter) ? { kind: 'inverse', constant: parameter } : undefined;
		case 'points': {
			const points = (data.points ?? [])
				.map((point): [number, number] => [Number(point.source_value), Number(point.estimated_value)])
				.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
			return new Set(points.map(([x]) => x)).size >= 2 ? { kind: 'points', points } : undefined;
		}
	}
	return undefined;
}

/**
 * The same link seen from the other end: the function that estimates the source from the target. A symmetric relation
 * is one link, so each direction uses the inverse of the other. Undefined when it has no inverse (a proportional
 * factor of 0, or points that do not go in one direction only).
 */
export function invertEstimate(estimate: EstimateFunction): EstimateFunction | undefined {
	switch (estimate.kind) {
		case 'proportional':
			return estimate.factor === 0 ? undefined : { kind: 'proportional', factor: 1 / estimate.factor };
		case 'additive':
			return { kind: 'additive', offset: -estimate.offset };
		case 'inverse':
			return estimate;
		case 'points': {
			const sorted = [...estimate.points].sort((a, b) => a[0] - b[0]);
			const increasing = sorted.every(([, y], i) => i === 0 || y > sorted[i - 1][1]);
			const decreasing = sorted.every(([, y], i) => i === 0 || y < sorted[i - 1][1]);
			if (!increasing && !decreasing) return undefined;
			return { kind: 'points', points: sorted.map(([x, y]) => [y, x] as [number, number]) };
		}
	}
}

const share = (percent: number): number => (Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) / 100 : 0);

/** Pi(Vi): the estimate of V0 given by the other value, or NaN where it is not defined. */
export function estimateAt(estimate: EstimateFunction, vi: number): number {
	switch (estimate.kind) {
		case 'proportional':
			return estimate.factor * vi;
		case 'additive':
			return vi + estimate.offset;
		case 'inverse':
			return vi === 0 ? Number.NaN : estimate.constant / vi;
		case 'points': {
			// One point per source value (the last one given wins), sorted.
			const byX = new Map<number, number>();
			for (const [x, y] of estimate.points) if (Number.isFinite(x) && Number.isFinite(y)) byX.set(x, y);
			const points = [...byX.entries()].sort((a, b) => a[0] - b[0]);
			if (points.length === 0) return Number.NaN;
			const xs = points.map(([x]) => x);
			const ys = points.map(([, y]) => y);
			if (vi <= xs[0]) return ys[0];
			if (vi >= xs[xs.length - 1]) return ys[ys.length - 1];
			return hermiteAt(xs, ys, pchipSlopes(xs, ys, true, true), vi);
		}
	}
}

/** Ii(Vi) = Pi(Vi) / Vi, only for display: undefined in Vi = 0. */
export function impactAt(estimate: EstimateFunction, vi: number): number | undefined {
	const p = estimateAt(estimate, vi);
	return vi !== 0 && Number.isFinite(p) ? p / vi : undefined;
}

/**
 * How much the function is trusted at Vi, from 0 to 1: 1 inside the known points, less and less far from them,
 * since the function only extrapolates there. Only the interpolated functions have known points.
 */
export function extrapolationTrust(estimate: EstimateFunction, vi: number): number {
	if (estimate.kind !== 'points' || estimate.points.length < 2) return 1;
	const xs = estimate.points.map(([x]) => x);
	const low = Math.min(...xs);
	const high = Math.max(...xs);
	const distance = vi < low ? low - vi : vi > high ? vi - high : 0;
	const span = high - low;
	return span > 0 ? span / (span + distance) : 1;
}

function bounded(value: number, bounds: Bounds): number {
	return Math.min(bounds.max ?? Infinity, Math.max(bounds.min ?? -Infinity, value));
}

/**
 * The value V0 combined with its relations. The estimates are bounded to the plausible range of the quantity, so the
 * result (a weighted average) is bounded too. A relation whose estimate cannot be computed does not vote.
 * Without any weight (A0·E0 = 0 and no relation), the value is undefined.
 */
export function combineRelations(
	initial: { value: number; veracity: number; elementVeracity: number },
	relations: RelationInput[],
	bounds: Bounds = {}
): RelationResult {
	let numerator = 0;
	let denominator = 0;
	// (A0·E0)²: four factors like a relation, so that both weigh the same at the same level of veracity.
	const initialWeight = (share(initial.veracity) * share(initial.elementVeracity)) ** 2;
	if (Number.isFinite(initial.value)) {
		numerator += initial.value * initialWeight;
		denominator += initialWeight;
	}

	const contributions = relations.map((relation): RelationContribution => {
		const raw = estimateAt(relation.estimate, relation.value);
		if (!Number.isFinite(raw)) return { weight: 0 };
		const estimate = bounded(raw, bounds);
		// Far from its known points, the function extrapolates: the relation is less veracious there.
		const weight =
			share(relation.valueVeracity) *
			share(relation.elementVeracity) *
			share(relation.relationVeracity) *
			share(relation.originality) *
			extrapolationTrust(relation.estimate, relation.value);
		numerator += estimate * weight;
		denominator += weight;
		return {
			estimate,
			weight,
			impact: impactAt(relation.estimate, relation.value),
			conflict: Number.isFinite(initial.value) ? estimate - initial.value : undefined
		};
	});

	return { value: denominator > 0 ? numerator / denominator : undefined, contributions };
}
