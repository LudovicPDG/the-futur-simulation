import { z } from 'zod';
import { isValidEvolutionFunction } from './EvolutionFunction';

export const UncertaintySchema = z
	.number()
	.min(0)
	.max(1)
	.describe(
		'How uncertain the values of this function are, as a share of the value: 0.05 = the real value is within about +-5% of the function, 0.3 = +-30%. Use a small number (0.01-0.05) for well measured quantities, a large one (0.2-0.5) for rough estimates or speculative forecasts.'
	);

export const EvolutionComponentSchema = z.object({
	function: z
		.string()
		.refine(isValidEvolutionFunction, 'Not a valid mathjs expression of t')
		.describe(
			'A mathjs expression of the time t, where t is the calendar year as a decimal number (2026.75 = October 2026). It gives the value of the unit at time t, e.g. "100 * 1.03^(t - 2026)", "50 + 20 * tanh((t - 2035) / 5)", "80 + 6 * sin(2 * pi * t)". Only use t, numbers, + - * / ^, and mathjs functions (exp, log, sqrt, sin, tanh, min, max...).'
		),
	weight: z.number().positive().describe('The weight of this function in the mix of functions.'),
	uncertainty: UncertaintySchema
});

export const EvolutionFunctionSchema = z
	.array(EvolutionComponentSchema)
	.min(1)
	.describe(
		'The evolution of the unit depending on the time t, as a weighted mix of mathematical functions. Almost always use ONE single component (weight 1) with the simplest function that describes the evolution. The mixture exists for later use: do not split an evolution into many base functions.'
	);

export const EvolutionTypeSchema = z.object({
	evolution: EvolutionFunctionSchema,
	unit: z.string().describe('The unit of this evolution')
});
