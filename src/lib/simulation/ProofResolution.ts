import { valueKind, type ProofData } from './Proof';
import { relationValueName, type RelationConnexionData } from './Relation';
import type { EvolutionComponent } from './event/EvolutionFunction';

/**
 * The votes of the proofs. Every proof gives a desired value, but only the fields it really changed (its
 * edited_fields) vote, next to the status quo:
 * - a debated proof is changed by its sub-proofs, next to its "original proof" copy (the proof before the debate);
 * - a value of an element is changed by its top-level proofs, the founding proof among them.
 * A text, a boolean... is decided by the voter with the best veracity * impact, a boolean by the weighted vote of
 * the voters and a number or an evolution by their weighted average, with the weight veracity * impact * originality.
 * The sub-proofs are resolved first (from the deepest), so that each proof votes with its debated scores.
 */

/** The fields of a debated proof that its sub-proofs can change (never its desired value). */
export const PROOF_EDIT_FIELDS = [
	'name',
	'description',
	'verification_method',
	'falsifiability_method',
	'source',
	'veracity',
	'uncertainty',
	'impact',
	'originality'
] as const;

/** The parts of a value of an element that its top-level proofs can change. */
export const VALUE_EDIT_FIELDS = ['value', 'veracity', 'uncertainty', 'impact', 'originality'] as const;

const SCORE_FIELDS = new Set<string>(['veracity', 'uncertainty', 'impact', 'originality']);

type Scores = Pick<ProofData, 'veracity' | 'uncertainty' | 'impact' | 'originality'>;
type Voter<T = unknown> = { value: T; scores: Scores };

/** The score that decides a text or an array: the best one wins. */
const pickScore = (scores: Scores) => scores.veracity * scores.impact;
/** The weight of a vote: the originality keeps copies of the same proof from adding up. */
const voteWeight = (scores: Scores) => scores.veracity * scores.impact * scores.originality;

/** The value of the voter with the best veracity * impact; on a tie, the first one (the status quo). */
function pickBest(voters: Voter[]): unknown {
	let best = voters[0];
	for (const voter of voters) if (pickScore(voter.scores) > pickScore(best.scores)) best = voter;
	return best?.value;
}

/** The weighted average of the numbers, or undefined when no voter has a weight. */
function weightedAverage(voters: Voter[]): number | undefined {
	let sum = 0;
	let total = 0;
	for (const { value, scores } of voters) {
		const weight = voteWeight(scores);
		if (typeof value !== 'number' || !Number.isFinite(value) || weight <= 0) continue;
		sum += weight * value;
		total += weight;
	}
	return total > 0 ? sum / total : undefined;
}

/** The side (true or false) with the biggest total weight, or undefined on a tie. */
function weightedVote(voters: Voter[]): boolean | undefined {
	let balance = 0;
	for (const { value, scores } of voters) {
		if (typeof value === 'boolean') balance += value ? voteWeight(scores) : -voteWeight(scores);
	}
	return balance === 0 ? undefined : balance > 0;
}

type Evolution = { evolution: EvolutionComponent[]; unit: string };

/**
 * The weighted average of the evolutions: an evolution is already the weighted average of its functions, so the
 * functions of every voter are put together, each voter weighing as much as its vote in total.
 */
function mergeEvolutions(voters: Voter[]): Evolution | undefined {
	const counted = voters.filter(({ value, scores }) => valueKind(value) === 'evolution' && voteWeight(scores) > 0);
	const total = counted.reduce((sum, { scores }) => sum + voteWeight(scores), 0);
	if (total <= 0) return undefined;
	const evolution = counted.flatMap(({ value, scores }) => {
		const components = (value as Evolution).evolution;
		const own = components.reduce((sum, component) => sum + component.weight, 0) || 1;
		return components.map((component) => ({
			...component,
			weight: (voteWeight(scores) / total) * (component.weight / own)
		}));
	});
	return { evolution, unit: (counted[0].value as Evolution).unit };
}

/** The content decided by the voters, according to its kind; the first voter is the status quo. */
function resolveContent(voters: Voter[]): unknown {
	const fallback = voters[0]?.value;
	switch (valueKind(fallback)) {
		case 'number':
			return weightedAverage(voters) ?? fallback;
		case 'boolean':
			return weightedVote(voters) ?? fallback;
		case 'evolution':
			return mergeEvolutions(voters) ?? fallback;
		default:
			return pickBest(voters);
	}
}

function scoresOf(proof: ProofData): Scores {
	return {
		veracity: proof.veracity,
		uncertainty: proof.uncertainty,
		impact: proof.impact,
		originality: proof.originality
	};
}

/** The fields the proof really changed. Without the information, all of them. */
function editedFields(proof: ProofData): readonly string[] {
	if (proof.edited_fields) return proof.edited_fields;
	return proof.parent_proof_id && !proof.original_proof_id ? PROOF_EDIT_FIELDS : VALUE_EDIT_FIELDS;
}

/** The voters of one field: the status quo first, then each proof that changed this field. */
function votersOf(field: string, statusQuo: Voter | undefined, proofs: ProofData[]): Voter[] {
	const voters = statusQuo ? [statusQuo] : [];
	for (const proof of proofs) {
		const value = (proof.desired_value as Record<string, unknown>)[field];
		if (editedFields(proof).includes(field) && value !== null && value !== undefined) {
			voters.push({ value, scores: scoresOf(proof) });
		}
	}
	return voters;
}

/**
 * Every proof as it stands after its debate: each debated proof gets the fields voted by its sub-proofs (resolved
 * first, from the deepest). The original proof copies stay unchanged: they are the status quo of the debate.
 */
export function resolveProofs(proofs: ProofData[]): ProofData[] {
	const children = new Map<string, ProofData[]>();
	for (const proof of proofs) {
		if (!proof.parent_proof_id) continue;
		children.set(proof.parent_proof_id, [...(children.get(proof.parent_proof_id) ?? []), proof]);
	}

	const resolved = new Map<string, ProofData>();
	const resolve = (proof: ProofData): ProofData => {
		const known = proof.id ? resolved.get(proof.id) : undefined;
		if (known) return known;

		const kids = proof.id ? (children.get(proof.id) ?? []) : [];
		// Oldest first (the proofs come newest first), so that a tie keeps the earliest proof.
		const debaters = kids.filter((kid) => !kid.original_proof_id).map(resolve).reverse();
		let result = proof;
		if (debaters.length > 0) {
			// The status quo: the proof before its debate (its copy), or the proof itself before the copies existed.
			const before = kids.find((kid) => kid.original_proof_id) ?? proof;
			result = { ...proof };
			for (const field of PROOF_EDIT_FIELDS) {
				const statusQuo = { value: (before as Record<string, unknown>)[field], scores: scoresOf(before) };
				const voters = votersOf(field, statusQuo, debaters);
				const decided = SCORE_FIELDS.has(field)
					? (weightedAverage(voters) ?? statusQuo.value)
					: pickBest(voters);
				(result as Record<string, unknown>)[field] = decided;
			}
		}
		if (proof.id) resolved.set(proof.id, result);
		return result;
	};

	return proofs.map(resolve);
}

/**
 * The parts of one value of an element decided by its top-level proofs (resolved by resolveProofs first, newest
 * first): its content and its scores. A part that no proof gives is undefined.
 */
export function resolveValue(proofs: ProofData[]): {
	value?: unknown;
	veracity?: number;
	uncertainty?: number;
	impact?: number;
	originality?: number;
} {
	// Oldest first: the founding proof is the status quo of a tie.
	const ordered = [...proofs].reverse();
	const result: Record<string, unknown> = {};
	for (const field of VALUE_EDIT_FIELDS) {
		const voters = votersOf(field, undefined, ordered);
		if (voters.length === 0) continue;
		result[field] = field === 'value' ? resolveContent(voters) : weightedAverage(voters);
	}
	return result;
}

/** Every language-keyed name of a value ("description" or {fr, en, de, es}). */
export function valueNames(name: unknown): string[] {
	if (typeof name === 'string') return [name];
	if (typeof name === 'object' && name !== null) {
		return Object.values(name).filter((value): value is string => typeof value === 'string');
	}
	return [];
}

/** The lists whose entries are values on their own: the "other" values, and the titled items (capabilities, willingness). */
export const VALUE_LISTS = [
	['other', 'value'],
	['power', 'description'],
	['willing', 'description'],
	['material_resource_used', 'description'],
	['material_resource_necessary', 'description'],
	['rankings', 'value']
] as const;

const RELATION_SIDES = [
	['element1_element2', 'modify', 'element1_element2_value_to_modify'],
	['element1_element2', 'add', 'element1_element2_new_value'],
	['element2_element1', 'modify', 'element2_element1_value_to_modify'],
	['element2_element1', 'add', 'element2_element1_new_value']
] as const;

/**
 * Gives the named value of the element its new content, wherever it is: a primary property, a value to modify or
 * to add of a relation, an "other" value or a titled item. The entries of a plain list are left alone: they all
 * share the name of the list, so their proofs cannot be told apart.
 */
function setValue(element: Record<string, unknown>, name: unknown, value: unknown): void {
	const names = valueNames(name);
	const key = names.find((candidate) => candidate in element);
	if (key) {
		if (Array.isArray(element[key]) && key !== 'evolution') return;
		if (key === 'evolution' && valueKind(value) === 'evolution') {
			// An evolution element holds its functions and its unit side by side.
			element.evolution = (value as Evolution).evolution;
			element.unit = (value as Evolution).unit;
		} else if (key !== 'evolution') {
			element[key] = value;
		}
		return;
	}

	for (const [direction, kind, list] of RELATION_SIDES) {
		const entries = element[list];
		if (!Array.isArray(entries)) continue;
		const index = entries.findIndex((entry) =>
			names.includes(relationValueName(direction, kind, entry as RelationConnexionData))
		);
		if (index === -1) continue;
		element[list] = entries.map((entry, i) =>
			i === index ? { ...entry, [kind === 'modify' ? 'impact' : 'value']: value } : entry
		);
		return;
	}

	for (const [list, valueKey] of VALUE_LISTS) {
		const entries = element[list];
		if (!Array.isArray(entries)) continue;
		const index = entries.findIndex(
			(entry) =>
				typeof entry === 'object' &&
				entry !== null &&
				valueNames((entry as { name?: unknown }).name).some((candidate) => names.includes(candidate))
		);
		if (index === -1) continue;
		element[list] = entries.map((entry, i) => (i === index ? { ...entry, [valueKey]: value } : entry));
		return;
	}
}

/** The top-level proofs of the element, grouped by the value they are about. */
function proofsByValue(elementId: string, proofs: ProofData[]): ProofData[][] {
	const groups: { names: string[]; proofs: ProofData[] }[] = [];
	for (const proof of proofs) {
		if (proof.parent_proof_id || (proof.fact_id ?? proof.relation_id) !== elementId) continue;
		const names = valueNames(proof.value_name).map((name) => name.toLowerCase());
		const group = groups.find((candidate) => candidate.names.some((name) => names.includes(name)));
		if (group) group.proofs.push(proof);
		else groups.push({ names, proofs: [proof] });
	}
	return groups.map((group) => group.proofs);
}

/** The element with every value decided by its proofs (resolved by resolveProofs first). */
export function resolveElement<T extends object>(element: T, proofs: ProofData[]): T {
	const id = (element as { id?: unknown }).id;
	if (typeof id !== 'string') return element;
	const groups = proofsByValue(id, proofs);
	if (groups.length === 0) return element;
	const result = { ...element } as Record<string, unknown>;
	for (const group of groups) {
		const { value } = resolveValue(group);
		if (value !== undefined) setValue(result, group[0].value_name, value);
	}
	return result as T;
}
