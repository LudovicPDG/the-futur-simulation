import type { Actions } from './$types';
import { Genie } from '$lib/server/simulation_object/Genie';
import { fail } from '@sveltejs/kit';

export const actions: Actions = {
	askGenie: async ({ request }) => {
		const data = await request.formData();
		const prompt = data.get('prompt')?.toString();

		if (!prompt || !prompt.trim()) {
			return fail(400, { missing: true, message: 'Prompt is required' });
		}

		const genie = new Genie();
		const result = await genie.ask(prompt);
		return { success: true, result };
	}
};

export async function load() {
	const all_data = await Genie.get_all_data();
	return { all_data };
}
