import { z } from 'zod';
import { TranslationSchema } from '../Translation';
import { RelationSchema } from '../Relation';
import { ProofSchema } from '../Proof';

export const EvolutionSchema = z.object({
	name: TranslationSchema.describe('The name of the evolution'),
	description: TranslationSchema.describe('The description of the evolution'),
	other: z.any().optional().describe('Other data about the evolution'),
	unit: z.string().describe('The unit of this evolution'),
	evolution: z
		.string()
		.describe('The evolution of the unit of this evolution depending of the time t.'),
	impossibility: z
		.number()
		.min(0)
		.max(1)
		.describe('describe the impossibility that this evolution happen.'),
	originality: z
		.number()
		.min(0)
		.max(100)
		.describe(
			'Originality of the evolution compared with other evolutions. Its for avoid that people spam same thing and increase the probability of certain things.'
		),
	relation: z
		.array(RelationSchema)
		.default([])
		.describe('Relation of the evolution with other data'),

	proofs: z.array(ProofSchema).default([]).describe('Proofs for the evolution')
});

export type EvolutionData = z.infer<typeof EvolutionSchema>;
