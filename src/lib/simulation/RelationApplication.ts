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
 * - The impact of a link is anchored on the known points: at each interpolation date of the two curves, the estimate
 *   gives back the value of the target (Ii = V0 / Vi), as the stored curves (before the proofs) have them. The
 *   estimate of the genie may only move these points by DEVIATION at most ("close to", not necessarily equal). Where
 *   the two values have no usable points (a constant, a number), the estimate of the genie is used as it is.
 * - A link without anchors and without a usable estimate function has no effect.
 */

/** How far (as a share of the target value) the genie may move the estimate away from V0 at a known point. */
export const DEVIATION = 0.25;

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
function existenceOf(element: Element, t: number): number {
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

/**
 * The estimate of an edge anchored on the known points: at each interpolation date of the two stored curves, the point
 * [source value, target value] (Ii = V0 / Vi). The estimate of the genie, when it has one, may move the target of a point
 * by DEVIATION at most. Undefined when the curves give fewer than two different source values.
 */
function anchoredEstimate(
	edge: Edge,
	sourceBase: ValueNode | undefined,
	targetBase: ValueNode | undefined
): { estimate: EstimateFunction; points: [number, number][] } | undefined {
	if (!sourceBase || !targetBase) return undefined;
	const dates = [...new Set([...sourceBase.dates, ...targetBase.dates])].sort((a, b) => a - b);
	const points: [number, number][] = [];
	for (const date of dates) {
		const source = sourceBase.read(date);
		const target = targetBase.read(date);
		if (source === undefined || target === undefined) continue;
		let estimated = target;
		const genie = estimateAt(edge.estimate, source);
		if (Number.isFinite(genie)) {
			const room = Math.abs(target) * DEVIATION;
			estimated = Math.min(target + room, Math.max(target - room, genie));
		}
		points.push([source, estimated]);
	}
	return new Set(points.map(([x]) => x)).size >= 2 ? { estimate: { kind: 'points', points }, points } : undefined;
}

/**
 * The impact of a value to modify of a relation, Ii = Pi(Vi) / Vi, now (at the moment t) and as a function of the time
 * (the impact at each known date, joined by a spline). Undefined without anchors or estimate.
 */
export function relationImpact<T extends object>(
	relation: RelationData,
	connexion: RelationConnexionData,
	resolved: T[],
	base: T[],
	t: number
): { now?: number; expression?: string } {
	const edge = edgesOf(relation).find((each) => each.connexion === connexion);
	if (!edge) return {};
	const nodeOf = (list: T[], id: string, property: string) => {
		const element = list.find((each) => (each as { id?: unknown }).id === id) as Element | undefined;
		return element ? locate(element, property) : undefined;
	};
	const sourceBase = nodeOf(base, edge.sourceId, edge.sourceProperty);
	const targetBase = nodeOf(base, edge.targetId, edge.targetProperty);
	const estimate = anchoredEstimate(edge, sourceBase, targetBase)?.estimate ?? edge.estimate;
	const source = nodeOf(resolved, edge.sourceId, edge.sourceProperty)?.read(t);
	const now = source === undefined ? undefined : impactAt(estimate, source);
	const dates =
		sourceBase && targetBase ? [...new Set([...sourceBase.dates, ...targetBase.dates])].sort((a, b) => a - b) : [];
	const points = dates.flatMap((date): [number, number][] => {
		const value = sourceBase?.read(date);
		const impact = value === undefined ? undefined : impactAt(estimate, value);
		return impact === undefined ? [] : [[date, impact]];
	});
	return { now, expression: points.length > 0 ? splineExpression({ points, before: null, after: null }) : undefined };
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
		const relationExistence = existenceOf(relation as unknown as Element, t) / 100;
		for (const edge of edgesOf(relation)) {
			const source = byId.get(edge.sourceId);
			const target = byId.get(edge.targetId);
			if (!source || !target) continue;
			const sourceNode = locate(source, edge.sourceProperty);
			const sourceValue = sourceNode?.read(t);
			if (!sourceNode || sourceValue === undefined || !locate(target, edge.targetProperty)) continue;
			const sourceBase = baseById.get(edge.sourceId);
			const targetBase = baseById.get(edge.targetId);
			const estimate =
				anchoredEstimate(
					edge,
					sourceBase && locate(sourceBase, edge.sourceProperty),
					targetBase && locate(targetBase, edge.targetProperty)
				)?.estimate ?? edge.estimate;

			const key = `${edge.targetId}|${edge.targetProperty}`;
			const entry = incoming.get(key) ?? { targetId: edge.targetId, targetProperty: edge.targetProperty, inputs: [] };
			const relationValue = relationValueName(edge.direction, 'modify', edge.connexion).toLowerCase();
			entry.inputs.push({
				value: sourceValue,
				estimate,
				valueVeracity: veracityOf(edge.sourceId, sourceNode.names, proofs, t),
				elementVeracity: existenceOf(source, t),
				relationVeracity: veracityOf(relation.id, [relationValue], proofs, t) * relationExistence,
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
