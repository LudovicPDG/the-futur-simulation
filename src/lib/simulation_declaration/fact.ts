import { z } from 'zod';
import { TranslationSchema } from './Translation';

const otherSchema = z.array(
	z.object({
		name: z.string().describe('The name of one other data of the fact'),
		value: z
			.union([z.string(), z.number(), z.boolean()])
			.describe('The value of one other data of the fact')
	})
);

export const FactSchema = z.object({
	name: TranslationSchema.describe('The name of the fact'),

	type: z.string().default('fact').describe('The type of the fact'),

	description: TranslationSchema.describe('The description of the fact'),

	other: otherSchema.describe('Other data about the fact').nullable(),

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
		)
});

export type FactData = z.infer<typeof FactSchema>;
