import { z } from 'zod';
import { TranslationSchema } from './Translation';
import { ProofSchema } from './Proof';

export const RelationConnexionSchema = z.object({
	SourceProperty: z.string().describe('The property of the source that is the source of the link'),
	TargetProperty: z.string().describe('The property of the target that is the target of the link'),
	impact: z.number().describe('The level of relation between the source and the target')
});

export const RelationSchema = z.object({
	name: TranslationSchema.describe('The name of the relation'),
	description: TranslationSchema.describe('The description of the relation'),
	TargetID: z.string().describe('The ID of element that are the target of the link'),
	TargetType: z.enum(['organization', 'fact', 'action']), // TODO : extend this list
	connexions: z.array(RelationConnexionSchema).default([]).describe('Connexions of the relation'),
	impossibility: z
		.number()
		.min(0)
		.max(1)
		.describe(
			'describe the impossibility that the relation happen. This number will after normalize the probability distribution.'
		),

	probability_distribution: z
		.string()
		.describe(
			'The probability distribution of the relation happening depending of time variable t. Don t take in account that after the function will be normalized by a value that describe the impossibility that the relation happen. Give the expression of the function that describe the probability distribution.'
		),
	originality: z
		.number()
		.min(0)
		.max(100)
		.describe(
			'Originality of the relation compared with other relations. Its for avoid that people spam same thing and increase the probability of certain things.'
		),

	proofs: z.array(ProofSchema).default([]).describe('Proofs for the relation')
});

export type RelationData = z.infer<typeof RelationSchema>;
