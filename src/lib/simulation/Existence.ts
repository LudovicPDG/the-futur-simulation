import { z } from 'zod';
import { evolutionPointsSchema } from './event/EvolutionType';

/**
 * An evolution that only accepts values between 0 and 100 (a percentage), over the time t.
 * It is used for the existence of the facts (and the occurrence of the events).
 */
export const PercentageEvolutionSchema = z.object({
	evolution: evolutionPointsSchema({
		description:
			'The PERCENTAGE at this date, between 0 and 100. For a value that goes from 0 to 100 at a precise moment, put two points very close in time (e.g. 0 at 1977.169 and 99 at 1977.17).',
		min: 0,
		max: 100
	}).describe('The percentage over time, given as interpolation points at precise dates.'),
	unit: z.literal('%').describe('Always "%"')
});

export type PercentageEvolutionData = z.infer<typeof PercentageEvolutionSchema>;

/** Evolution, in percent over time, of the existence of the given kind of element. */
export function existenceSchema(subject: string, details = '') {
	return PercentageEvolutionSchema.describe(
		`Evolution of the existence of the ${subject}, in percent (0 to 100), over time. It is 0 before the ${subject} begins, close to 100 while it exists (lower if its existence is uncertain), and back to 0 after it ends; it never exceeds 100. This value is the VERACITY of the existence: how likely the ${subject} is to really exist in the real world. A fictional, invented, hypothetical, mythological or imaginary ${subject} (a fictional character, a made-up organization, a deity...) is NOT real: give it a very low value (0 to 5), never 99, even if it "exists" in the story or in the simulation. Only give a high value to a ${subject} that is established as real. The ${subject} is considered to exist from the moment this value goes over 50 until the moment it goes under 50.${details ? ` ${details}` : ''} Give the moments as precisely as possible (year, month, day, hour), converted to decimal years. Example for a ${subject} that begins in 1977.17 and ends in 2060: the points (1977.169, 0), (1977.17, 99), (2055, 99), (2060, 0), with nothing before and after (they stay at 0).`
	);
}

/** Evolution, in percent over time, of the impact of the given kind of element (a function of the time, not a single number). */
export function impactSchema(subject: string) {
	return PercentageEvolutionSchema.describe(
		`Evolution of the impact of the ${subject} on the simulation, in percent (0 to 100), over time: 0 = no effect on the world, 100 = it changes the whole world. The impact is a function of the time: it can be low before the ${subject} is known, grow as it spreads, and fade away later. Use the whole scale, e.g. 35 or 80. Give the moments as precisely as possible, converted to decimal years.`
	);
}

/** Evolution, in percent over time, of the existence of the given event (the event takes place while it exists). */
export function occurrenceSchema(subject: string, details = '') {
	return existenceSchema(
		subject,
		`It takes place while this value is over 50.${details ? ` ${details}` : ''}`
	);
}
