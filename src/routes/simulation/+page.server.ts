import type { Actions } from './$types';
import { Genie } from '$lib/server/simulation/Genie';
import { fail } from '@sveltejs/kit';

export const actions: Actions = {
	askGenie: async ({ request }) => {
		const data = await request.formData();
		const prompt = data.get('prompt')?.toString();

		if (!prompt || !prompt.trim()) {
			return fail(400, { missing: true, message: 'Prompt is required' });
		}

		const result = await Genie.ask(prompt);
		return { success: true, result };
	}
};
