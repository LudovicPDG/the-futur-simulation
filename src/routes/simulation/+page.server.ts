import type { Actions } from './$types';
import { Genie } from '$lib/server/simulation_object/Genie';
import { fail } from '@sveltejs/kit';
import { RelationRefusal, RelationServer } from '$lib/server/simulation_object/Relation';
import { isValueListField } from '$lib/server/simulation_object/Value';

export const actions: Actions = {
	askGenie: async ({ request }) => {
		const data = await request.formData();
		const prompt = data.get('prompt')?.toString();

		if (!prompt || !prompt.trim()) {
			return fail(400, { missing: true, message: 'Prompt is required' });
		}

		const debateProofId = data.get('debate_proof_id')?.toString() || undefined;

		const addValueFactId = data.get('add_value_fact_id')?.toString();
		const addValueField = data.get('add_value_field')?.toString();
		const addValue =
			addValueFactId && isValueListField(addValueField)
				? { factId: addValueFactId, field: addValueField }
				: undefined;

		const parseJson = (raw: string | undefined) => {
			try {
				return raw ? JSON.parse(raw) : undefined;
			} catch {
				return undefined;
			}
		};
		const addProofId = data.get('add_proof_id')?.toString();
		const addProofKind = data.get('add_proof_kind')?.toString();
		const addProofValueName = parseJson(data.get('add_proof_value_name')?.toString());
		const addProof =
			addProofId && (addProofKind === 'fact' || addProofKind === 'relation') && addProofValueName
				? { id: addProofId, kind: addProofKind as 'fact' | 'relation', valueName: addProofValueName }
				: undefined;

		const addRelationElementId = data.get('add_relation_element_id')?.toString();
		const addRelation = addRelationElementId
			? {
					elementId: addRelationElementId,
					valueName: parseJson(data.get('add_relation_value_name')?.toString())
				}
			: undefined;

		const genie = new Genie();
		try {
			const result = await genie.ask(prompt, { debateProofId, addValue, addProof, addRelation });
			return { success: true, result };
		} catch (error) {
			// The genie says in its bubble why this relation is impossible
			if (error instanceof RelationRefusal) return { success: false, refusal: error.code };
			throw error;
		}
	},

	/** Saves the interpolation table Pi of one score of one value of a relation (points [[Vi, Pi], ...]; empty: computed again). */
	setScoreTable: async ({ request }) => {
		const data = await request.formData();
		const relationId = data.get('relation_id')?.toString();
		const valueName = data.get('value_name')?.toString();
		const score = data.get('score')?.toString();
		let points: unknown;
		try {
			points = JSON.parse(data.get('points')?.toString() ?? '[]');
		} catch {
			return fail(400, { message: 'Invalid points' });
		}
		const valid =
			Array.isArray(points) &&
			points.every((point) => Array.isArray(point) && point.length === 2 && point.every((n) => typeof n === 'number'));
		if (!relationId || !valueName || !score || !valid) return fail(400, { message: 'Invalid score table' });
		const tables = await RelationServer.instance.setScoreTable(relationId, valueName, score, points as [number, number][]);
		return { success: true, tables };
	}
};

export async function load() {
	const all_data = await Genie.get_all_data();
	return { all_data };
}
