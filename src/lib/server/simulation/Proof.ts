import { z } from 'zod';
import { TranslationSchema } from './Translation';

const ChangesSchema = z.object({
	targetElement: z.string().describe('The element that is changed'),
	new_value: z.any().describe('The new value of the element'),
	impact: z.number().min(0).max(100).describe('Impact of the change')
});

export const ProofSchema: z.ZodType = z.lazy(() =>
	z.object({
		name: TranslationSchema.describe('The name of the proof'),

		description: TranslationSchema.describe('The description of the proof'),

		changes: z.array(ChangesSchema).describe('List of change this proof implies'),
		debates: z
			.array(ProofSchema)
			.default([])
			.describe('Proofs for debate about the truth of the proof'),

		verification_method: TranslationSchema.describe('How to verify the truth of the proof'),
		falsifiability_method: TranslationSchema.describe('How to falsify the truth of the proof'),

		source: z.array(z.string()).default([]).describe('Sources for the proof'),

		impossibility: z
			.number()
			.min(0)
			.max(1)
			.describe(
				'describe the impossibility that the proof happen. This number will after normalize the probability distribution.'
			),

		probability_distribution: z
			.string()
			.describe(
				'The probability distribution of the proof happening depending of time variable t. Don t take in account that after the function will be normalized by a value that describe the impossibility that the proof happen. Give the expression of the function that describe the probability distribution.'
			),
		originality: z.number().min(0).max(100).describe('Originality of the proof')
	})
);

export type ProofData = z.infer<typeof ProofSchema>;

export class Provable {
	add_proof(description: string) {}
}
