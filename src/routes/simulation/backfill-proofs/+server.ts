import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ProofServer } from '$lib/server/simulation_object/Proof';

/** Creates the missing founding proofs of the material resources of the existing actions. */
export const POST: RequestHandler = async () => {
	const result = await ProofServer.instance.backfillMaterialProofs();
	return json(result);
};
