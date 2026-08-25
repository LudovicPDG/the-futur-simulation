import { genie } from '$lib/simulation/Genie';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { prompt } = await request.json();

		if (!prompt || typeof prompt !== 'string') {
			return json({ error: 'Prompt field is required' }, { status: 400 });
		}

		const result = await genie.ask(prompt);
		return json({ success: true, result });
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'An error occurred';
		console.error('Error executing Genie.ask:', error);
		return json({ error: message }, { status: 500 });
	}
};
