import { z } from 'zod';
import { TranslationSchema } from './Translation';
import { ProofSchema } from './Proof';
import { RelationSchema } from './Relation';

export const FactSchema = z.object({
	name: TranslationSchema.describe('The name of the fact'),

	type: z.string().default('fact').describe('The type of the fact'),

	description: TranslationSchema.describe('The description of the fact'),

	other: z.any().optional().describe('Other data about the fact'),

	impossibility: z
		.number()
		.min(0)
		.max(1)
		.describe(
			'describe the impossibility of the fact. This number will after normalize the probability distribution.'
		),

	probability_distribution: z
		.string()
		.describe(
			'The probability distribution of the fact happening depending of time variable t. Don t take in account that after the function will be normalized by a value that describe the impossibility that the fact happen. Give the expression of the function that describe the probability distribution.'
		),

	originality: z
		.number()
		.min(0)
		.max(100)
		.describe(
			'Originality of the fact compared with other facts. Its for avoid that people spam same thing and increase the probability of certain things.'
		),

	relation: z.array(RelationSchema).default([]).describe('Relation of the fact with other data'),

	proofs: z.array(ProofSchema).default([]).describe('Proofs for the fact')
});

export type FactData = z.infer<typeof FactSchema>;
