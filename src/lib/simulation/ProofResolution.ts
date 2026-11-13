import { valueKind, type ProofData } from './Proof';
import { isCounted, SCORE_THRESHOLD } from './CountThreshold';
import { relationValueName, type RelationConnexionData } from './Relation';
import { combineEvolution, countAt, scoreAt, toScoreFunction, type EvolutionComponent } from './event/EvolutionFunction';

/**
 * The votes of the proofs. Every proof gives a desired value, but only the fields it really changed (its
 * edited_fields) vote, next to the status quo:
 * - a debated proof is changed by its sub-proofs, next to its "original proof" copy (the proof before the debate);
 * - a value of an element is changed by its top-level proofs, the founding proof among them.
 * A text, a boolean... is decided by the voter with the best veracity * relevance, a boolean by the weighted vote of
 * the voters and a number or an evolution by their weighted average, with the weight veracity * relevance * originality.
 * The sub-proofs are resolved first (from the deepest), so that each proof votes with its debated scores.
 * The veracity, the uncertainty, the relevance and the originality are functions of the time: everything is decided at
 * one moment t.
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
	'relevance',
	'originality'
] as const;

/** The parts of a value of an element that its top-level proofs can change. */
export const VALUE_EDIT_FIELDS = ['value', 'veracity', 'uncertainty', 'impact', 'people_impacted', 'originality'] as const;

/**
 * The parts of an evolution that a proof changes on its own: the function and each side of its uncertainty. A proof
 * saved with the whole "value" changed edits all of them. The evolution has no general uncertainty score.
 */
export const EVOLUTION_PARTS = ['function', 'uncertainty_above', 'uncertainty_below'] as const;
export type EvolutionPart = (typeof EVOLUTION_PARTS)[number];

const SCORE_FIELDS = new Set<string>(['veracity', 'uncertainty', 'relevance', 'impact', 'originality']);
/** The scores that are functions of the time: all of them. */
const SCORE_FUNCTION_FIELDS = new Set<string>(['veracity', 'uncertainty', 'relevance', 'impact', 'people_impacted', 'originality']);
/** The scores of a value of an element (a proof has a relevance instead of an impact). */
const VALUE_SCORE_FUNCTION_FIELDS = ['veracity', 'uncertainty', 'impact', 'people_impacted', 'originality'];

/** The scores of a proof at one moment. */
type Scores = { veracity: number; uncertainty: number; relevance: number; originality: number };
type Voter<T = unknown> = { value: T; scores: Scores };

/** Whether a proof counts at all: a veracity, a relevance or an originality under the threshold takes it out (see CountThreshold). */
const counts = (scores: Scores) =>
	isCounted({ veracity: scores.veracity, relevance: scores.relevance, originality: scores.originality });
/** The score that decides a text or an array: the best one wins. */
const pickScore = (scores: Scores) => scores.veracity * scores.relevance;
/** The weight of a vote: the originality keeps copies of the same proof from adding up; 0 when it does not count. */
const voteWeight = (scores: Scores) => (counts(scores) ? scores.veracity * scores.relevance * scores.originality : 0);

/** The value of the voter with the best veracity * relevance; on a tie, the first one (the status quo). */
function pickBest(voters: Voter[]): unknown {
	let best = voters[0];
	// A voter that does not count only wins when nobody counts (the status quo stays).
	for (const voter of voters) {
		if (!counts(voter.scores)) continue;
		if (!counts(best.scores) || pickScore(voter.scores) > pickScore(best.scores)) best = voter;
	}
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

/** Whether the proof changed this part of its evolution, on its own or with the whole value. */
export function editsEvolutionPart(proof: ProofData, part: EvolutionPart): boolean {
	const fields = editedFields(proof);
	return fields.includes(part) || fields.includes('value');
}

/** The proofs voting for a part of the evolution, with the evolution they desire. */
function evolutionVoters(proofs: ProofData[], t: number, part?: EvolutionPart): Voter<Evolution>[] {
	return proofs.flatMap((proof) => {
		const value = (proof.desired_value as Record<string, unknown>).value;
		const edits = part ? editsEvolutionPart(proof, part) : EVOLUTION_PARTS.some((each) => editsEvolutionPart(proof, each));
		if (valueKind(value) !== 'evolution' || !edits) return [];
		return [{ value: value as Evolution, scores: scoresOf(proof, t) }];
	});
}

/**
 * One side of the uncertainty decided by its voters: the average of their expressions, weighted like their votes.
 * In it, v is the value of the function that was decided.
 */
function mixUncertainty(voters: Voter<Evolution>[], side: 'uncertainty_up' | 'uncertainty_down'): string | undefined {
	const counted = voters.filter(({ scores }) => voteWeight(scores) > 0);
	const total = counted.reduce((sum, { scores }) => sum + voteWeight(scores), 0);
	if (total <= 0) return undefined;
	if (counted.length === 1) return combineEvolution(counted[0].value.evolution)[side];
	return counted
		.map(({ value, scores }) => `${voteWeight(scores) / total} * max(0, ${combineEvolution(value.evolution)[side]})`)
		.join(' + ');
}

/**
 * The evolution decided by the proofs of a value: its function, its uncertainty above and its uncertainty below are
 * three separate votes, each by the proofs that changed it, so that a proof can change one without the others.
 */
function resolveEvolution(proofs: ProofData[], t: number): Evolution | undefined {
	const functionVoters = evolutionVoters(proofs, t, 'function');
	// Without any proof of the function, the evolution of the proofs of the uncertainty gives it.
	const merged = mergeEvolutions(functionVoters.length > 0 ? functionVoters : evolutionVoters(proofs, t));
	if (!merged) return undefined;
	const up = mixUncertainty(evolutionVoters(proofs, t, 'uncertainty_above'), 'uncertainty_up');
	const down = mixUncertainty(evolutionVoters(proofs, t, 'uncertainty_below'), 'uncertainty_down');
	return {
		unit: merged.unit,
		evolution: merged.evolution.map((component) => ({
			...component,
			uncertainty_up: up ?? component.uncertainty_up,
			uncertainty_down: down ?? component.uncertainty_down
		}))
	};
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

/** The scores of the proof at the moment t: a score that cannot be computed there gives the proof no weight. */
function scoresOf(proof: ProofData, t: number): Scores {
	return {
		veracity: scoreAt(proof.veracity, t) || 0,
		uncertainty: scoreAt(proof.uncertainty, t) || 0,
		relevance: scoreAt(proof.relevance, t) || 0,
		originality: scoreAt(proof.originality, t) || 0
	};
}

/** The weighted average of one score at the moment t. */
function averageScore(field: string, voters: Voter[], t: number): number | undefined {
	if (!SCORE_FUNCTION_FIELDS.has(field)) return weightedAverage(voters);
	return weightedAverage(
		voters.map((voter) => ({ ...voter, value: field === 'people_impacted' ? countAt(voter.value, t) : scoreAt(voter.value, t) }))
	);
}

/** The fields the proof really changed. Without the information, all of them. */
function editedFields(proof: ProofData): readonly string[] {
	if (proof.edited_fields) return proof.edited_fields;
	return proof.parent_proof_id && !proof.original_proof_id ? PROOF_EDIT_FIELDS : VALUE_EDIT_FIELDS;
}

/** The voters of one field: the status quo first, then each proof that changed this field. */
function votersOf(field: string, statusQuo: Voter | undefined, proofs: ProofData[], t: number): Voter[] {
	const voters = statusQuo ? [statusQuo] : [];
	for (const proof of proofs) {
		const value = (proof.desired_value as Record<string, unknown>)[field];
		if (editedFields(proof).includes(field) && value !== null && value !== undefined) {
			voters.push({ value, scores: scoresOf(proof, t) });
		}
	}
	return voters;
}

/**
 * Every proof as it stands after its debate: each debated proof gets the fields voted by its sub-proofs (resolved
 * first, from the deepest). The original proof copies stay unchanged: they are the status quo of the debate.
 * A score function that a vote changed becomes its value at the moment t; one that nobody changed stays whole.
 */
export function resolveProofs(proofs: ProofData[], t: number): ProofData[] {
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
				const statusQuo = { value: (before as Record<string, unknown>)[field], scores: scoresOf(before, t) };
				const voters = votersOf(field, statusQuo, debaters, t);
				let decided: unknown;
				if (!SCORE_FIELDS.has(field)) {
					decided = pickBest(voters);
				} else {
					const average = voters.length > 1 ? averageScore(field, voters, t) : undefined;
					if (average === undefined) decided = statusQuo.value;
					else decided = SCORE_FUNCTION_FIELDS.has(field) ? String(average) : average;
				}
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
 * first) at the moment t: its content and its scores. A part that no proof gives is undefined.
 */
export function resolveValue(proofs: ProofData[], t: number): {
	value?: unknown;
	veracity?: number;
	uncertainty?: number;
	impact?: number;
	people_impacted?: number;
	originality?: number;
} {
	// Oldest first: the founding proof is the status quo of a tie.
	const ordered = [...proofs].reverse();
	const result: Record<string, unknown> = {};
	const evolution = resolveEvolution(ordered, t);
	for (const field of VALUE_EDIT_FIELDS) {
		if (field === 'value' && evolution) {
			result.value = evolution;
			continue;
		}
		// An evolution has no general uncertainty: only the uncertainty above and below its function.
		if (field === 'uncertainty' && evolution) continue;
		const voters = votersOf(field, undefined, ordered, t);
		if (voters.length === 0) continue;
		result[field] = field === 'value' ? resolveContent(voters) : averageScore(field, voters, t);
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
	['symmetric', 'symmetric_value_to_modify'],
	['element1_element2', 'element1_element2_value_to_modify'],
	['element2_element1', 'element2_element1_value_to_modify']
] as const;

/**
 * Gives the named value of the element its new content, wherever it is: a primary property, a value to modify of a relation, an "other" value or a titled item. The entries of a plain list are left alone: they all
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

	for (const [direction, list] of RELATION_SIDES) {
		const entries = element[list];
		if (!Array.isArray(entries)) continue;
		const index = entries.findIndex((entry) =>
			names.includes(relationValueName(direction, entry as RelationConnexionData))
		);
		if (index === -1) continue;
		element[list] = entries.map((entry, i) =>
			i === index ? { ...entry, impact: value } : entry
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

/** The element with every value decided by its proofs at the moment t (resolved by resolveProofs first). */
export function resolveElement<T extends object>(element: T, proofs: ProofData[], t: number): T {
	const id = (element as { id?: unknown }).id;
	if (typeof id !== 'string') return element;
	const groups = proofsByValue(id, proofs);
	if (groups.length === 0) return element;
	const result = { ...element } as Record<string, unknown>;
	for (const group of groups) {
		const { value } = resolveValue(group, t);
		if (value !== undefined) setValue(result, group[0].value_name, value);
	}
	return result as T;
}

/** The whole simulation as it stands at the moment t: every proof after its debate and every value of every element. */
export function resolveAtDate<T extends object>(elements: T[], t: number): T[] {
	const isProof = (element: T) => (element as { type?: unknown }).type === 'proof';
	const stored = elements.filter(isProof) as unknown as ProofData[];
	const proofs = resolveProofs(stored, t);
	const resolved = new Map<unknown, ProofData>(stored.map((proof, index) => [proof, proofs[index]]));
	return elements.map((element) =>
		isProof(element) ? (resolved.get(element) as unknown as T) : resolveElement(element, proofs, t)
	);
}

/**
 * The veracity, uncertainty, impact and originality of one value as functions of t: what resolveValue gives at one moment, written
 * as one expression (the weighted average of the scores of the proofs that changed it, weighted like their votes).
 */
export function resolveValueFunctions(proofs: ProofData[]): {
	veracity?: string;
	uncertainty?: string;
	impact?: string;
	people_impacted?: string;
	originality?: string;
} {
	const clamp = (expression: string) => `max(0, min(100, ${expression}))`;
	const count = (expression: string) => `max(0, ${expression})`;
	const ordered = [...proofs].reverse();
	const result: Record<string, string> = {};
	for (const field of VALUE_SCORE_FUNCTION_FIELDS) {
		const voters = ordered.filter((proof) => {
			const desired = (proof.desired_value as Record<string, unknown>)[field];
			return editedFields(proof).includes(field) && desired !== null && desired !== undefined;
		});
		if (voters.length === 0) continue;
		const scores = voters.map((proof) => toScoreFunction((proof.desired_value as Record<string, unknown>)[field]));
		if (voters.length === 1) {
			result[field] = scores[0];
			continue;
		}
		// The weight is 0 where the veracity, the relevance or the originality is under the threshold (see CountThreshold).
		const weights = voters.map((proof) => {
			const [veracity, relevance, originality] = [proof.veracity, proof.relevance, proof.originality].map((score) =>
				clamp(toScoreFunction(score))
			);
			return `${veracity} * ${relevance} * ${originality} * ((${veracity}) >= ${SCORE_THRESHOLD} and (${relevance}) >= ${SCORE_THRESHOLD} and (${originality}) >= ${SCORE_THRESHOLD} ? 1 : 0)`;
		});
		result[field] = `(${scores
			.map((score, index) => `(${weights[index]}) * ${field === 'people_impacted' ? count(score) : clamp(score)}`)
			.join(' + ')}) / (${weights.map((weight) => `(${weight})`).join(' + ')})`;
	}
	return result;
}
