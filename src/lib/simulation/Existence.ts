import { z } from 'zod';
import { UncertaintyDownSchema, UncertaintyUpSchema } from './event/EvolutionType';
import { isPercentageFunction } from './event/EvolutionFunction';

/**
 * An evolution that only accepts values between 0 and 100 (a percentage), over the time t.
 * It is used for the existence of the facts (and the occurrence of the events).
 */
export const PercentageEvolutionSchema = z.object({
	evolution: z
		.array(
			z.object({
				function: z
					.string()
					.refine(
						isPercentageFunction,
						'Not a valid mathjs expression of t giving a percentage between 0 and 100'
					)
					.describe(
						'A mathjs expression of the time t, where t is the calendar year as a decimal number (2026.75 = October 2026). It gives a PERCENTAGE: for every t the result must be between 0 and 100 (use min/max to be sure). A constant such as "80" is fine for something that does not change. Use a smooth step such as "50 * (1 + tanh((t - 1977.17) / 0.0005))" for a value that goes from 0 to 100 around a moment, and multiply steps to rise and fall.'
					),
				weight: z.number().positive().describe('The weight of this function in the mix of functions.'),
				uncertainty_down: UncertaintyDownSchema,
				uncertainty_up: UncertaintyUpSchema
			})
		)
		.min(1)
		.describe(
			'The percentage depending on the time t, as a weighted mix of mathematical functions. Almost always use ONE single component (weight 1).'
		),
	unit: z.literal('%').describe('Always "%"')
});

export type PercentageEvolutionData = z.infer<typeof PercentageEvolutionSchema>;

/** Evolution, in percent over time, of the existence of the given kind of element. */
export function existenceSchema(subject: string, details = '') {
	return PercentageEvolutionSchema.describe(
		`Evolution of the existence of the ${subject}, in percent (0 to 100), depending on the time t. It is 0 before the ${subject} begins, close to 100 while it exists (lower if its existence is uncertain), and back to 0 after it ends; it never exceeds 100. The ${subject} is considered to exist from the moment this value goes over 50 until the moment it goes under 50.${details ? ` ${details}` : ''} Give the moments as precisely as possible (year, month, day, hour), converted to decimal years. Example for a ${subject} that begins in 1977.17 and ends in 2060: "99 * 0.5 * (1 + tanh((t - 1977.17) / 0.0005)) * 0.5 * (1 - tanh((t - 2060) / 5))".`
	);
}

/** Evolution, in percent over time, of the existence of the given event (the event takes place while it exists). */
export function occurrenceSchema(subject: string, details = '') {
	return existenceSchema(
		subject,
		`It takes place while this value is over 50.${details ? ` ${details}` : ''}`
	);
}
