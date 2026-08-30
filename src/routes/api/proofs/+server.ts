import { json } from '@sveltejs/kit';
import { Proof } from '$lib/simulation/Proof';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const targetId = url.searchParams.get('targetId');
		const proofId = url.searchParams.get('proofId');
		const type = url.searchParams.get('type') as 'argument' | 'counterArgument' | null;
		const page = parseInt(url.searchParams.get('page') || '1', 10);
		const pageSize = parseInt(url.searchParams.get('pageSize') || '5', 10);

		if (proofId && type) {
			const result = await Proof.getChildProofs(proofId, type, page, pageSize);
			return json(result);
		}

		if (targetId) {
			const result = await Proof.getProofsForTarget(targetId, page, pageSize);
			return json(result);
		}

		return json({ error: 'targetId or (proofId and type) parameter is required' }, { status: 400 });
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Failed to fetch proofs';
		console.error('API /api/proofs error:', error);
		return json({ error: message, proofs: [], total: 0 }, { status: 500 });
	}
};
