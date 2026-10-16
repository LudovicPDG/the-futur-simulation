import { z } from 'zod';
import { UncertaintySchema } from './event/EvolutionType';
import { isProbabilityFunction } from './event/EvolutionFunction';

/**
 * The probability, over time, that something exists (or that an event occurs): an evolution that only
 * accepts values between 0 and 1. It replaces the start / end distributions and the impossibilities.
 */
export const ExistenceSchema = z.object({
	evolution: z
		.array(
			z.object({
				function: z
					.string()
					.refine(
						isProbabilityFunction,
						'Not a valid mathjs expression of t giving a probability between 0 and 1'
					)
					.describe(
						'A mathjs expression of the time t, where t is the calendar year as a decimal number (2026.75 = October 2026). It gives a PROBABILITY: for every t the result must be between 0 and 1 (use min/max to be sure). Use a smooth step such as "0.5 * (1 + tanh((t - 1977.17) / 0.0005))" for a probability that goes from 0 to 1 around a moment, and multiply two steps to start and stop (e.g. "0.99 * 0.5 * (1 + tanh((t - 1977.17) / 0.0005)) * 0.5 * (1 - tanh((t - 2060) / 5))"). The thing is considered to exist from the moment the probability goes over 0.5 until the moment it goes under 0.5.'
					),
				weight: z.number().positive().describe('The weight of this function in the mix of functions.'),
				uncertainty: UncertaintySchema
			})
		)
		.min(1)
		.describe(
			'The probability depending on the time t, as a weighted mix of mathematical functions. Almost always use ONE single component (weight 1).'
		),
	unit: z.literal('probability').describe('Always "probability"')
});

export type ExistenceData = z.infer<typeof ExistenceSchema>;

/** Probability, over time, that the given kind of element exists. */
export function existenceSchema(subject: string, details = '') {
	return ExistenceSchema.describe(
		`Probability (0 to 1) that the ${subject} exists, depending on the time t. It is 0 before the ${subject} begins, close to 1 while it exists (lower if its existence is uncertain), and back to 0 after it ends; it never exceeds 1.${details ? ` ${details}` : ''} Give the moments as precisely as possible (year, month, day, hour), converted to decimal years.`
	);
}

/** Probability, over time, that the given event occurs. */
export function occurrenceSchema(subject: string, details = '') {
	return ExistenceSchema.describe(
		`Probability (0 to 1) that the ${subject} occurs, depending on the time t. It is 0 before the ${subject} can happen, close to 1 while it takes place (lower if it is uncertain that it occurs), and back to 0 once it is over; it never exceeds 1.${details ? ` ${details}` : ''} Give the moments as precisely as possible (year, month, day, hour), converted to decimal years.`
	);
}
