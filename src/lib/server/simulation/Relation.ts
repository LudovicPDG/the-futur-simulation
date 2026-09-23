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
	Element1ID: z.string().describe('The ID of element 1'),
	Element1Type: z.enum(['organization', 'fact', 'action']), // TODO : extend this list
	Element2ID: z.string().describe('The ID of element 2'),
	Element2Type: z.enum(['organization', 'fact', 'action']), // TODO : extend this list
	element1_element2_connexions: z
		.array(RelationConnexionSchema)
		.default([])
		.describe('Connexions from element 1 to element 2'),
	element2_element1_connexions: z
		.array(RelationConnexionSchema)
		.default([])
		.describe('Connexions from element 2 to element 1'),
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
		)
});

export type RelationData = z.infer<typeof RelationSchema>;

export const ProofRelationConnexionSchema = z.object({
	SourceProperty: z.string().describe('The property of the source that is the source of the link'),
	impact: z.number().describe('The level of relation between the source and the target')
});

export const ProofRelationSchema = z.object({
	name: TranslationSchema.describe('The name of the relation'),
	description: TranslationSchema.describe('The description of the relation'),
	SourceID: z.string().describe('The ID of element that are the source of the link'),
	SourceType: z.enum(['organization', 'fact', 'action']), // TODO : extend this list
	TargetID: z.string().describe('The ID of element that are the target of the link'),
	connexions: z.array(RelationConnexionSchema).default([]).describe('Connexions of the relation')
});

export type ProofRelationData = z.infer<typeof ProofRelationSchema>;
