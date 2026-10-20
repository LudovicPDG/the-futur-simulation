import type { Actions } from './$types';
import { Genie } from '$lib/server/simulation_object/Genie';
import { fail } from '@sveltejs/kit';
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
		const result = await genie.ask(prompt, { debateProofId, addValue, addProof, addRelation });
		return { success: true, result };
	}
};

export async function load() {
	const all_data = await Genie.get_all_data();
	return { all_data };
}
