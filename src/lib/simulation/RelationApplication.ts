import type { ProofData } from './Proof';
import {
	parseEvolutionValue,
	buildEvolutionFunction,
	combineEvolution,
	splineDates,
	splineExpression,
	type EvolutionComponent
} from './event/EvolutionFunction';
import { resolveAtDate, resolveProofs, resolveValue, valueNames } from './ProofResolution';
import { dateToYear } from './TimeAxis';
import { belowThreshold, isCounted, type CountedScore } from './CountThreshold';
import { relationValueName, type RelationConnexionData, type RelationData, type RelationValueEntry } from './Relation';
import {
	combineRelations,
	estimateAt,
	impactAt,
	invertEstimate,
	POLE_MARGIN,
	toEstimateFunction,
	type Bounds,
	type EstimateFunction,
	type RelationInput
} from './RelationInfluence';

/**
 * Applies the relations to the values of the elements at the moment t: when two values are linked, each one is moved
 * by the other, as RelationInfluence decides. It runs on the elements already decided by their proofs (resolveAtDate).
 *
 * - The sources are read before anything is written: a value is moved by the values the proofs decided, never by a
 *   value another relation has just moved, so the order of the relations and the loops (A moves B, B moves A) change
 *   nothing.
 * - A value that is an evolution keeps the shape of its curve: the curve is shifted so that it gives the decided value
 *   at the moment t.
 * - The impact of a link follows the known points exactly: at each interpolation date of the two stored curves (before
 *   the proofs) up to today, Ii = V0 / Vi. After today the estimate of the genie is free (it is the function the
 *   relation believes in, kept inside the plausible range of the quantity), so the future impact is the one of that
 *   function. Where the two values have no usable points (a constant, a number), the estimate of the genie is used.
 * - A link without anchors and without a usable estimate function has no effect.
 */

type Element = Record<string, unknown>;

/** One numeric value of an element that a relation can read or move. */
interface ValueNode {
	/** Every name the proofs of this value use (lowercase). */
	names: string[];
	unit: string;
	/** The dates of the interpolation points of its curve (empty for a number). */
	dates: number[];
	/** The value as a function of the time (the text of its expression). */
	expression: string;
	/** Its uncertainty above and below as functions of the time (only for an evolution). */
	uncertainty?: { up: string; down: string };
	read(t: number): number | undefined;
	/** Gives the value its decided number at t, on the element given (a copy). */
	write(element: Element, decided: number, t: number): void;
}

const DIRECTIONS = [
	['symmetric', 'symmetric_value_to_modify'],
	['element1_element2', 'element1_element2_value_to_modify'],
	['element2_element1', 'element2_element1_value_to_modify']
] as const;

/** Properties that cannot go under 0. */
const NON_NEGATIVE = new Set([
	'human_resource',
	'human_mobilized',
	'human_necessary',
	'number_of_units',
	'fund_used',
	'fund_necessary'
]);

const clampScore = (value: number) => Math.min(100, Math.max(0, value));

/** The curve shifted by a constant: same shape and uncertainty, a different level. */
function shifted(components: EvolutionComponent[], delta: number): EvolutionComponent[] {
	const mix = combineEvolution(components);
	return [{ ...mix, function: `(${mix.function}) + (${delta})`, weight: 1 }];
}

/** The numeric value of the element that the name designates: a property, or an "other" value. */
function locate(element: Element, name: string): ValueNode | undefined {
	const key = name in element ? name : undefined;
	if (key) {
		const raw = element[key];
		if (key === 'evolution' && Array.isArray(raw)) {
			const components = raw as EvolutionComponent[];
			const unit = typeof element.unit === 'string' ? element.unit : '';
			return {
				names: [key],
				unit,
				dates: datesOf(components),
				expression: combineEvolution(components).function,
				uncertainty: uncertaintyOf(components),
				read: (t) => finite(buildEvolutionFunction(components)(t)),
				write: (target, decided, t) => {
					const current = buildEvolutionFunction(components)(t);
					if (Number.isFinite(current)) target.evolution = shifted(components, decided - current);
				}
			};
		}
		if (typeof raw === 'number') {
			return {
				names: [key],
				unit: '',
				dates: [],
				expression: String(raw),
				read: () => raw,
				write: (target, decided) => void (target[key] = decided)
			};
		}
		const evolution = parseEvolutionValue(raw);
		if (evolution) {
			return {
				names: [key],
				unit: evolution.unit,
				dates: datesOf(evolution.evolution),
				expression: combineEvolution(evolution.evolution).function,
				uncertainty: uncertaintyOf(evolution.evolution),
				read: (t) => finite(buildEvolutionFunction(evolution.evolution)(t)),
				write: (target, decided, t) => {
					const current = buildEvolutionFunction(evolution.evolution)(t);
					if (Number.isFinite(current)) {
						target[key] = { evolution: shifted(evolution.evolution, decided - current), unit: evolution.unit };
					}
				}
			};
		}
		return undefined;
	}

	const others = element.other;
	if (!Array.isArray(others)) return undefined;
	const index = others.findIndex((entry) => valueNames((entry as { name?: unknown })?.name).includes(name));
	if (index === -1) return undefined;
	const entry = others[index] as { name: unknown; value: unknown };
	const names = valueNames(entry.name).map((each) => each.toLowerCase());
	const replace = (target: Element, value: unknown) => {
		target.other = (target.other as unknown[]).map((each, i) => (i === index ? { ...(each as object), value } : each));
	};
	if (typeof entry.value === 'number') {
		const raw = entry.value;
		return { names, unit: '', dates: [], expression: String(raw), read: () => raw, write: (target, decided) => replace(target, decided) };
	}
	const evolution = parseEvolutionValue(entry.value);
	if (!evolution) return undefined;
	return {
		names,
		unit: evolution.unit,
		dates: datesOf(evolution.evolution),
		expression: combineEvolution(evolution.evolution).function,
		uncertainty: uncertaintyOf(evolution.evolution),
		read: (t) => finite(buildEvolutionFunction(evolution.evolution)(t)),
		write: (target, decided, t) => {
			const current = buildEvolutionFunction(evolution.evolution)(t);
			if (Number.isFinite(current)) {
				replace(target, { evolution: shifted(evolution.evolution, decided - current), unit: evolution.unit });
			}
		}
	};
}

/**
 * The uncertainty above and below an evolution as functions of the time only: the value v they may use is replaced by
 * the curve itself, and a negative distance is 0.
 */
function uncertaintyOf(components: EvolutionComponent[]): { up: string; down: string } {
	const mix = combineEvolution(components);
	const ofTime = (expression: string) => `max(0, (${expression.replace(/v/g, `(${mix.function})`)}))`;
	return { up: ofTime(mix.uncertainty_up), down: ofTime(mix.uncertainty_down) };
}

/** The dates of the interpolation points of the curve of an evolution. */
function datesOf(components: EvolutionComponent[]): number[] {
	return [...new Set(components.flatMap((component) => splineDates(component.function)))].sort((a, b) => a - b);
}

const finite = (value: number): number | undefined => (Number.isFinite(value) ? value : undefined);

/** The plausible range of a quantity, from its unit and its kind. */
function boundsOf(name: string, node: ValueNode): Bounds {
	if (node.unit.trim() === '%') return { min: 0, max: 100 };
	return NON_NEGATIVE.has(name) ? { min: 0 } : {};
}

/** The value as a function of the time, kept inside its plausible range (a probability never goes under 0). */
function boundedExpression(name: string, node: ValueNode): string {
	const { min, max } = boundsOf(name, node);
	let expression = `(${node.expression})`;
	if (min !== undefined) expression = `max(${min}, ${expression})`;
	if (max !== undefined) expression = `min(${max}, ${expression})`;
	return expression;
}

/** The veracity (0..100) that the proofs decide for a value of an element at t; 100 where no proof speaks of it. */
function veracityOf(elementId: unknown, names: string[], proofs: ProofData[], t: number): number {
	const group = proofs.filter(
		(proof) =>
			!proof.parent_proof_id &&
			(proof.fact_id ?? proof.relation_id) === elementId &&
			valueNames(proof.value_name).some((name) => names.includes(name.toLowerCase()))
	);
	const veracity = group.length > 0 ? resolveValue(group, t).veracity : undefined;
	return veracity === undefined || !Number.isFinite(veracity) ? 100 : clampScore(veracity);
}

/** The probability (0..100) that the element exists at t: the veracity of the element itself. */
export function existenceOf(element: Element, t: number): number {
	const evolution = parseEvolutionValue(element.existence);
	if (!evolution) return 100;
	const value = buildEvolutionFunction(evolution.evolution)(t);
	return Number.isFinite(value) ? clampScore(value) : 100;
}

interface Edge {
	relation: RelationData;
	direction: (typeof DIRECTIONS)[number][0];
	connexion: RelationConnexionData;
	sourceId: string;
	sourceProperty: string;
	targetId: string;
	targetProperty: string;
	estimate: EstimateFunction;
}

/** Every link of a relation as source → target edges; a symmetric link is one edge each way. */
function edgesOf(relation: RelationData): Edge[] {
	const edges: Edge[] = [];
	for (const [direction, list] of DIRECTIONS) {
		for (const connexion of relation[list] ?? []) {
			const estimate = connexion.estimate ? toEstimateFunction(connexion.estimate) : undefined;
			if (!estimate) continue;
			const forward: Edge = {
				relation,
				direction,
				connexion,
				sourceId: relation.Element1ID,
				sourceProperty: connexion.Element1Property,
				targetId: relation.Element2ID,
				targetProperty: connexion.Element2Property,
				estimate
			};
			if (direction === 'element1_element2') edges.push(forward);
			else if (direction === 'element2_element1') {
				edges.push({
					...forward,
					sourceId: relation.Element2ID,
					sourceProperty: connexion.Element2Property,
					targetId: relation.Element1ID,
					targetProperty: connexion.Element1Property
				});
			} else {
				edges.push(forward);
				const backward = invertEstimate(estimate);
				if (backward) {
					edges.push({
						...forward,
						sourceId: relation.Element2ID,
						sourceProperty: connexion.Element2Property,
						targetId: relation.Element1ID,
						targetProperty: connexion.Element1Property,
						estimate: backward
					});
				}
			}
		}
	}
	return edges;
}

/** A known date of the two curves: the source value, the target value and the estimate the relation gives there. */
interface Anchor {
	date: number;
	source: number;
	estimate: number;
}

/**
 * The anchors of an edge, from the two stored curves. Up to today the estimate is the target value itself (Ii = V0 / Vi,
 * exactly); after today it is the estimate of the genie at the source value (free), or the target value when the genie
 * has no usable estimate there. Both are kept inside the plausible range of the target, so an impossible value (a
 * probability under 0) never gives an impact.
 */
function anchorsOf(edge: Edge, sourceBase: ValueNode, targetBase: ValueNode, bounds: Bounds): Anchor[] {
	const sourceBounds = boundsOf(edge.sourceProperty, sourceBase);
	const today = dateToYear(Date.now());
	const dates = [...new Set([...sourceBase.dates, ...targetBase.dates])].sort((a, b) => a - b);
	const within = (value: number, range: Bounds = bounds) =>
		Math.min(range.max ?? Infinity, Math.max(range.min ?? -Infinity, value));
	const anchors: Anchor[] = [];
	for (const date of dates) {
		const rawSource = sourceBase.read(date);
		const source = rawSource === undefined ? undefined : within(rawSource, sourceBounds);
		const target = targetBase.read(date);
		if (source === undefined || target === undefined) continue;
		const genie = date > today ? estimateAt(edge.estimate, source) : Number.NaN;
		anchors.push({ date, source, estimate: within(Number.isFinite(genie) ? genie : target) });
	}
	return anchors;
}

/** The estimate of an edge through its anchors. Undefined when they give fewer than two different source values. */
function anchoredEstimate(
	edge: Edge,
	sourceBase: ValueNode | undefined,
	targetBase: ValueNode | undefined,
	bounds: Bounds
): { estimate: EstimateFunction; anchors: Anchor[] } | undefined {
	if (!sourceBase || !targetBase) return undefined;
	const anchors = anchorsOf(edge, sourceBase, targetBase, bounds);
	if (new Set(anchors.map((anchor) => anchor.source)).size < 2) return undefined;
	return { estimate: { kind: 'points', points: anchors.map((a) => [a.source, a.estimate] as [number, number]) }, anchors };
}

/**
 * The value of a value to modify of a relation, Ii = V0 / Vi (the target divided by the source), at the moment t and as
 * a function of the time: exactly the curve of the target divided by the curve of the source.
 */
export function relationImpact<T extends object>(
	relation: RelationData,
	connexion: RelationConnexionData,
	resolved: T[],
	base: T[],
	t: number
): { now?: number; expression?: string; below?: CountedScore[]; counted?: boolean } {
	const edge = edgesOf(relation).find((each) => each.connexion === connexion);
	if (!edge) return {};
	const nodeOf = (list: T[], id: string, property: string) => {
		const element = list.find((each) => (each as { id?: unknown }).id === id) as Element | undefined;
		return element ? locate(element, property) : undefined;
	};
	const sourceBase = nodeOf(base, edge.sourceId, edge.sourceProperty);
	const targetBase = nodeOf(base, edge.targetId, edge.targetProperty);
	const bounds = targetBase ? boundsOf(edge.targetProperty, targetBase) : {};
	const anchored = anchoredEstimate(edge, sourceBase, targetBase, bounds);
	const estimate = anchored?.estimate ?? edge.estimate;
	const sourceResolved = nodeOf(resolved, edge.sourceId, edge.sourceProperty);
	const sourceRange = sourceResolved ? boundsOf(edge.sourceProperty, sourceResolved) : {};
	const rawResolved = sourceResolved?.read(t);
	const source =
		rawResolved === undefined ? undefined : Math.min(sourceRange.max ?? Infinity, Math.max(sourceRange.min ?? -Infinity, rawResolved));
	let now = source === undefined ? undefined : impactAt(estimate, source);
	// The value of the link is exactly V0 / Vi (the target divided by the source) at every date, read on the values
	// decided by the proofs at t (the ones the user sees), each one kept in its plausible range: a probability that the
	// curve takes slightly under 0 is 0, and where the source is 0 the ratio does not exist.
	if (sourceBase && targetBase) {
		const decided = resolveAtDate(base, t);
		const sourceNow = nodeOf(decided, edge.sourceId, edge.sourceProperty) ?? sourceBase;
		const targetNow = nodeOf(decided, edge.targetId, edge.targetProperty) ?? targetBase;
		const sourceBounds = boundsOf(edge.sourceProperty, sourceNow);
		const within = (value: number, range: Bounds) => Math.min(range.max ?? Infinity, Math.max(range.min ?? -Infinity, value));
		const rawSource = sourceNow.read(t);
		const vi = rawSource === undefined ? undefined : within(rawSource, sourceBounds);
		const v0 = targetNow.read(t);
		now = vi !== undefined && v0 !== undefined && Math.abs(vi) >= POLE_MARGIN ? within(v0, bounds) / vi : undefined;
	}
	// As a function of the time: the curve of the target divided by the curve of the source, exactly.
	const expression =
		sourceBase && targetBase
			? `${boundedExpression(edge.targetProperty, targetBase)} / ${boundedExpression(edge.sourceProperty, sourceBase)}`
			: undefined;
	// The scores of the link under their threshold (see CountThreshold): the veracity of its value, the certainty that
	// the relation exists, its originality and its impact. The veracity of the source value and the existence of its
	// element also decide whether the link counts.
	const proofs = resolved.filter((each) => (each as { type?: unknown }).type === 'proof') as unknown as ProofData[];
	const relationValue = relationValueName(edge.direction, edge.connexion).toLowerCase();
	const below = [
		...belowThreshold({
			veracity: veracityOf(relation.id, [relationValue], proofs, t),
			existence: existenceOf(relation as unknown as Element, t),
			originality: Number(relation.originality)
		}),
		...belowThreshold({ impact: now }, true)
	];
	const sourceElement = resolved.find((each) => (each as { id?: unknown }).id === edge.sourceId) as Element | undefined;
	const sourceNode = sourceElement ? locate(sourceElement, edge.sourceProperty) : undefined;
	const sourceCounted =
		!sourceElement ||
		(isCounted({ existence: existenceOf(sourceElement, t) }) &&
			isCounted({ veracity: sourceNode ? veracityOf(edge.sourceId, sourceNode.names, proofs, t) : undefined }));
	return {
		now,
		below,
		counted: below.length === 0 && sourceCounted,
		expression
	};
}

/**
 * The curves of the two values a link joins, as functions of the time: A (the property of element 1) and B (the
 * property of element 2): their real functions (the ones the value of the link divides), kept in their range.
 */
/** The curve of one of the two values a link joins, and its uncertainty above and below (for an evolution). */
export interface LinkedCurve {
	expression: string;
	unit: string;
	uncertainty?: { up: string; down: string };
}

export function relationCurves<T extends object>(
	relation: RelationData,
	connexion: RelationConnexionData,
	base: T[]
): { a?: LinkedCurve; b?: LinkedCurve } {
	const curveOf = (id: string, property: string) => {
		const element = base.find((each) => (each as { id?: unknown }).id === id && (each as { type?: unknown }).type !== 'proof') as
			| Element
			| undefined;
		const node = element ? locate(element, property) : undefined;
		return node ? { expression: boundedExpression(property, node), unit: node.unit, uncertainty: node.uncertainty } : undefined;
	};
	return {
		a: curveOf(relation.Element1ID, connexion.Element1Property),
		b: curveOf(relation.Element2ID, connexion.Element2Property)
	};
}

/** The scores of a value that a relation moves, the same way it moves the value itself. */
export type ScoreKind = 'veracity' | 'uncertainty' | 'impact' | 'people_impacted' | 'relevance' | 'originality';

/** The scores that are percentages (0..100); the number of people impacted is a count (0 and above). */
const boundsOfScore = (kind: ScoreKind): Bounds => (kind === 'people_impacted' ? { min: 0 } : { min: 0, max: 100 });

/** The score of a value at t, decided by its proofs (resolved by resolveProofs); undefined where no proof gives it. */
function scoreOf(kind: ScoreKind, elementId: unknown, names: string[], proofs: ProofData[], t: number): number | undefined {
	const group = proofs.filter(
		(proof) =>
			!proof.parent_proof_id &&
			(proof.fact_id ?? proof.relation_id) === elementId &&
			valueNames(proof.value_name).some((name) => names.includes(name.toLowerCase()))
	);
	if (group.length === 0) return undefined;
	const score = resolveValue(group, t)[kind];
	if (score === undefined || !Number.isFinite(score)) return undefined;
	return kind === 'people_impacted' ? Math.max(0, score) : clampScore(score);
}

/**
 * The estimate Pi of a score of the target from the same score of the source, as a table of points [source, target]
 * taken at each known date of the two curves (the base, before the proofs): the first table of a link is the score of the
 * source against the score of the target, i.e. Ii = target / source at each date. A point whose source is at a pole of that
 * ratio (a source score of 0) is not kept, so the table has no vertical asymptote. With fewer than two distinct sources
 * the estimate is the single ratio, proportional. Undefined when no date gives both scores.
 */
function scoreEstimate(
	kind: ScoreKind,
	edge: Edge,
	sourceNames: string[],
	targetNames: string[],
	dates: number[],
	proofsAt: (date: number) => ProofData[]
): EstimateFunction | undefined {
	const points: [number, number][] = [];
	for (const date of dates) {
		const proofs = proofsAt(date);
		const source = scoreOf(kind, edge.sourceId, sourceNames, proofs, date);
		const target = scoreOf(kind, edge.targetId, targetNames, proofs, date);
		if (source === undefined || target === undefined || Math.abs(source) < POLE_MARGIN) continue;
		points.push([source, target]);
	}
	if (new Set(points.map(([x]) => x)).size >= 2) return { kind: 'points', points };
	const last = points[points.length - 1];
	return last ? { kind: 'proportional', factor: last[1] / last[0] } : undefined;
}

/**
 * The veracity or the uncertainty of a value moved by the links that reach it, at t, with the same formula as its
 * value: V = (V0·(A0·E0)^2.5 + Σ Pi(Vi)·Ai·Ei·Ri·Fi·Oi) / ((A0·E0)^2.5 + Σ Ai·Ei·Ri·Fi·Oi), where V0 and Vi are the scores.
 * `names` are the lowercase names of the target value. Undefined when no link reaches it or it has no such score.
 */
export function relationScore<T extends object>(
	kind: ScoreKind,
	targetId: unknown,
	names: string[],
	resolved: T[],
	base: T[],
	t: number
): number | undefined {
	const typeOf = (element: T) => (element as { type?: unknown }).type;
	const idOf = (element: T) => (element as { id?: unknown }).id;
	const resolvedProofs = resolved.filter((element) => typeOf(element) === 'proof') as unknown as ProofData[];
	const storedProofs = base.filter((element) => typeOf(element) === 'proof') as unknown as ProofData[];
	const relations = resolved.filter(
		(element) => typeOf(element) === 'relation' && 'Element1ID' in element && 'Element2ID' in element
	) as unknown as RelationData[];
	const elementOf = (list: T[], id: unknown) =>
		list.find((element) => idOf(element) === id && typeOf(element) !== 'proof' && typeOf(element) !== 'relation') as
			| Element
			| undefined;

	const proofCache = new Map<number, ProofData[]>();
	const proofsAt = (date: number) => {
		if (!proofCache.has(date)) proofCache.set(date, resolveProofs(storedProofs, date));
		return proofCache.get(date)!;
	};

	const inputs: RelationInput[] = [];
	let target: Element | undefined;
	let targetNames: string[] = [];
	for (const relation of relations) {
		const relationExistence = existenceOf(relation as unknown as Element, t);
		for (const edge of edgesOf(relation)) {
			if (edge.targetId !== targetId || !names.includes(edge.targetProperty.toLowerCase())) continue;
			const source = elementOf(resolved, edge.sourceId);
			target = elementOf(resolved, edge.targetId);
			const sourceNode = source && locate(source, edge.sourceProperty);
			const targetNode = target && locate(target, edge.targetProperty);
			if (!source || !sourceNode || !targetNode) continue;
			targetNames = targetNode.names;
			const sourceScore = scoreOf(kind, edge.sourceId, sourceNode.names, resolvedProofs, t);
			if (sourceScore === undefined) continue;
			const sourceBase = elementOf(base, edge.sourceId);
			const targetBase = elementOf(base, edge.targetId);
			const sourceBaseNode = (sourceBase && locate(sourceBase, edge.sourceProperty)) || sourceNode;
			const targetBaseNode = (targetBase && locate(targetBase, edge.targetProperty)) || targetNode;
			const dates = [...new Set([...sourceBaseNode.dates, ...targetBaseNode.dates, t])].sort((a, b) => a - b);
			const estimate = scoreEstimate(kind, edge, sourceNode.names, targetNode.names, dates, proofsAt);
			if (!estimate) continue;
			const relationValue = relationValueName(edge.direction, edge.connexion).toLowerCase();
			inputs.push({
				value: sourceScore,
				estimate,
				valueVeracity: veracityOf(edge.sourceId, sourceNode.names, resolvedProofs, t),
				elementVeracity: existenceOf(source, t),
				relationVeracity: veracityOf(relation.id, [relationValue], resolvedProofs, t),
				relationExistence,
				originality: Number(relation.originality)
			});
		}
	}
	if (!target || inputs.length === 0) return undefined;
	const initial = scoreOf(kind, targetId, targetNames, resolvedProofs, t);
	if (initial === undefined) return undefined;
	const { value } = combineRelations(
		{ value: initial, veracity: veracityOf(targetId, targetNames, resolvedProofs, t), elementVeracity: existenceOf(target, t) },
		inputs,
		boundsOfScore(kind),
		false
	);
	return value !== undefined && Number.isFinite(value) ? value : undefined;
}

/**
 * The same score as a function of the time: its value moved by the links at each known date of the target, joined by a
 * spline. The dates where it cannot be computed (no estimate: a pole) are left out, so the curve has no spike or dip there.
 */
export function relationScoreExpression<T extends object>(
	kind: ScoreKind,
	targetId: unknown,
	names: string[],
	base: T[],
	t: number
): string | undefined {
	const element = base.find(
		(each) => (each as { id?: unknown }).id === targetId && (each as { type?: unknown }).type !== 'proof'
	) as Element | undefined;
	const dates = new Set<number>([t]);
	for (const name of names) for (const date of (element && locate(element, name))?.dates ?? []) dates.add(date);
	const points = [...dates]
		.sort((a, b) => a - b)
		.flatMap((date): [number, number][] => {
			const score = relationScore(kind, targetId, names, resolveAtDate(base, date), base, date);
			return score === undefined ? [] : [[date, score]];
		});
	if (points.length === 0) return undefined;
	return points.length === 1 ? String(points[0][1]) : splineExpression({ points, before: null, after: null });
}

/**
 * The "relation" array of a relation: for each of its values to modify, its value (impact ratio), veracity,
 * uncertainty (above and below), impact (average and people impacted) and originality at the moment t.
 * `resolved` holds the elements and the proofs decided at t, `base` the stored ones (see relationImpact).
 */
export function relationValueMap<T extends object>(
	relation: RelationData,
	resolved: T[],
	base: T[],
	t: number
): RelationValueEntry[] {
	const proofs = resolved.filter((each) => (each as { type?: unknown }).type === 'proof') as unknown as ProofData[];
	const finite = (n: number | undefined): number | null => (n !== undefined && Number.isFinite(n) ? n : null);
	const entries: RelationValueEntry[] = [];
	for (const [direction, list] of DIRECTIONS) {
		for (const connexion of relation[list] ?? []) {
			const name = relationValueName(direction, connexion);
			const group = proofs.filter(
				(proof) =>
					!proof.parent_proof_id &&
					proof.relation_id === relation.id &&
					valueNames(proof.value_name).some((each) => each.toLowerCase() === name.toLowerCase())
			);
			const voted = group.length > 0 ? resolveValue(group, t) : {};
			const relationOriginality = Number(relation.originality);
			entries.push({
				direction,
				name,
				Element1Property: connexion.Element1Property,
				Element2Property: connexion.Element2Property,
				value: finite(relationImpact(relation, connexion, resolved, base, t).now ?? connexion.impact),
				veracity: finite(voted.veracity),
				uncertainty_above: finite(voted.uncertainty),
				uncertainty_below: finite(voted.uncertainty),
				impact: finite(voted.impact),
				people_impacted: finite(voted.people_impacted),
				originality: finite(voted.originality ?? relationOriginality)
			});
		}
	}
	return entries;
}

/** The relation with its "relation" array filled (see relationValueMap). */
export function withRelationValueMap<T extends object>(relation: RelationData, resolved: T[], base: T[], t: number): RelationData {
	return { ...relation, relation: relationValueMap(relation, resolved, base, t) };
}

/** The elements with every linked value moved by the values it is linked to, at the moment t. */
export function applyRelations<T extends object>(elements: T[], t: number, base: T[] = elements): T[] {
	const typeOf = (element: T) => (element as { type?: unknown }).type;
	const proofs = elements.filter((element) => typeOf(element) === 'proof') as unknown as ProofData[];
	const relations = elements.filter(
		(element) => typeOf(element) === 'relation' && 'Element1ID' in element && 'Element2ID' in element
	) as unknown as RelationData[];
	if (relations.length === 0) return elements;

	const byId = new Map<string, Element>();
	for (const element of elements) {
		const id = (element as { id?: unknown }).id;
		if (typeof id === 'string' && typeOf(element) !== 'relation' && typeOf(element) !== 'proof') {
			byId.set(id, element as Element);
		}
	}

	// The stored elements (before the proofs) hold the known points of the curves.
	const baseById = new Map<string, Element>();
	for (const element of base) {
		const id = (element as { id?: unknown }).id;
		if (typeof id === 'string') baseById.set(id, element as Element);
	}

	// The incoming links of each value, with the weights read from the decided (not the moved) values.
	const incoming = new Map<string, { targetId: string; targetProperty: string; inputs: RelationInput[] }>();
	for (const relation of relations) {
		// Fi: the certainty that the relation itself exists.
		const relationExistence = existenceOf(relation as unknown as Element, t);
		for (const edge of edgesOf(relation)) {
			const source = byId.get(edge.sourceId);
			const target = byId.get(edge.targetId);
			if (!source || !target) continue;
			const sourceNode = locate(source, edge.sourceProperty);
			const sourceValue = sourceNode?.read(t);
			const targetNode = locate(target, edge.targetProperty);
			if (!sourceNode || sourceValue === undefined || !targetNode) continue;
			const sourceBase = baseById.get(edge.sourceId);
			const targetBase = baseById.get(edge.targetId);
			const estimate =
				anchoredEstimate(
					edge,
					sourceBase && locate(sourceBase, edge.sourceProperty),
					targetBase && locate(targetBase, edge.targetProperty),
					targetNode ? boundsOf(edge.targetProperty, targetNode) : {}
				)?.estimate ?? edge.estimate;

			const key = `${edge.targetId}|${edge.targetProperty}`;
			const entry = incoming.get(key) ?? { targetId: edge.targetId, targetProperty: edge.targetProperty, inputs: [] };
			const relationValue = relationValueName(edge.direction, edge.connexion).toLowerCase();
			entry.inputs.push({
				value: sourceValue,
				estimate,
				valueVeracity: veracityOf(edge.sourceId, sourceNode.names, proofs, t),
				elementVeracity: existenceOf(source, t),
				relationVeracity: veracityOf(relation.id, [relationValue], proofs, t),
				relationExistence,
				originality: Number(relation.originality)
			});
			incoming.set(key, entry);
		}
	}

	const changed = new Map<string, Element>();
	for (const { targetId, targetProperty, inputs } of incoming.values()) {
		const original = byId.get(targetId)!;
		const node = locate(original, targetProperty);
		const initial = node?.read(t);
		if (!node || initial === undefined) continue;
		const { value } = combineRelations(
			{
				value: initial,
				veracity: veracityOf(targetId, node.names, proofs, t),
				elementVeracity: existenceOf(original, t)
			},
			inputs,
			boundsOf(targetProperty, node)
		);
		if (value === undefined || !Number.isFinite(value)) continue;
		// Several values of one element are written on the same copy.
		const copy = changed.get(targetId) ?? { ...original };
		node.write(copy, value, t);
		changed.set(targetId, copy);
	}

	return elements.map((element) => {
		const id = (element as { id?: unknown }).id;
		return (typeof id === 'string' ? (changed.get(id) as T | undefined) : undefined) ?? element;
	});
}
