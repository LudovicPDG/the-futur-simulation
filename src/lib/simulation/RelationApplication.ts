import type { ProofData } from './Proof';
import {
	parseEvolutionValue,
	buildEvolutionFunction,
	combineEvolution,
	splineDates,
	splineExpression,
	type EvolutionComponent
} from './event/EvolutionFunction';
import { resolveValue, valueNames } from './ProofResolution';
import { dateToYear } from './TimeAxis';
import { belowThreshold, isCounted, type CountedScore } from './CountThreshold';
import { relationValueName, type RelationConnexionData, type RelationData } from './Relation';
import {
	combineRelations,
	estimateAt,
	impactAt,
	invertEstimate,
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
				read: (t) => finite(buildEvolutionFunction(components)(t)),
				write: (target, decided, t) => {
					const current = buildEvolutionFunction(components)(t);
					if (Number.isFinite(current)) target.evolution = shifted(components, decided - current);
				}
			};
		}
		if (typeof raw === 'number') {
			return { names: [key], unit: '', dates: [], read: () => raw, write: (target, decided) => void (target[key] = decided) };
		}
		const evolution = parseEvolutionValue(raw);
		if (evolution) {
			return {
				names: [key],
				unit: evolution.unit,
				dates: datesOf(evolution.evolution),
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
		return { names, unit: '', dates: [], read: () => raw, write: (target, decided) => replace(target, decided) };
	}
	const evolution = parseEvolutionValue(entry.value);
	if (!evolution) return undefined;
	return {
		names,
		unit: evolution.unit,
		dates: datesOf(evolution.evolution),
		read: (t) => finite(buildEvolutionFunction(evolution.evolution)(t)),
		write: (target, decided, t) => {
			const current = buildEvolutionFunction(evolution.evolution)(t);
			if (Number.isFinite(current)) {
				replace(target, { evolution: shifted(evolution.evolution, decided - current), unit: evolution.unit });
			}
		}
	};
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
	const today = dateToYear(Date.now());
	const dates = [...new Set([...sourceBase.dates, ...targetBase.dates])].sort((a, b) => a - b);
	const within = (value: number) => Math.min(bounds.max ?? Infinity, Math.max(bounds.min ?? -Infinity, value));
	const anchors: Anchor[] = [];
	for (const date of dates) {
		const source = sourceBase.read(date);
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
 * The impact of a value to modify of a relation, Ii = Pi(Vi) / Vi, at the moment t and as a function of the time (the
 * impact at each known date, joined by a spline). Up to today it is exactly V0 / Vi; after, the one of the estimate.
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
	const source = nodeOf(resolved, edge.sourceId, edge.sourceProperty)?.read(t);
	let now = source === undefined ? undefined : impactAt(estimate, source);
	// Up to today the impact is exactly V0 / Vi, read on the curves at the date.
	if (sourceBase && targetBase && t <= dateToYear(Date.now())) {
		const vi = sourceBase.read(t);
		const v0 = targetBase.read(t);
		if (vi !== undefined && v0 !== undefined && vi !== 0) {
			now = Math.min(bounds.max ?? Infinity, Math.max(bounds.min ?? -Infinity, v0)) / vi;
		}
	}
	// The impact at each known date does not need distinct source values (a constant source has an impact too).
	const anchors = anchored?.anchors ?? (sourceBase && targetBase ? anchorsOf(edge, sourceBase, targetBase, bounds) : []);
	const points = anchors.flatMap((anchor): [number, number][] =>
		anchor.source === 0 ? [] : [[anchor.date, anchor.estimate / anchor.source]]
	);
	// The scores of the link under their threshold (see CountThreshold): the veracity of its value, the certainty that
	// the relation exists, its originality and its impact. The veracity of the source value and the existence of its
	// element also decide whether the link counts.
	const proofs = resolved.filter((each) => (each as { type?: unknown }).type === 'proof') as unknown as ProofData[];
	const relationValue = relationValueName(edge.direction, 'modify', edge.connexion).toLowerCase();
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
		expression: points.length > 0 ? splineExpression({ points, before: null, after: null }) : undefined
	};
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
			const relationValue = relationValueName(edge.direction, 'modify', edge.connexion).toLowerCase();
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
