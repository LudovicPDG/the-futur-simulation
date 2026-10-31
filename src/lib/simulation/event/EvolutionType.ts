import { z } from 'zod';
import { isValidEvolutionFunction, isValidUncertaintyFunction } from './EvolutionFunction';

/** One side of the uncertainty of a function: the function is the median, each side has its own size. */
function uncertaintySide(side: 'below' | 'above') {
	return z
		.string()
		.refine(isValidUncertaintyFunction, 'Not a valid mathjs expression of t and v giving a distance')
		.describe(
			`How far ${side} the function the real value can be: a mathjs expression of t (the calendar year as a decimal number) and of v (the value of the function at t). It gives a DISTANCE in the unit of the value, about 2 standard deviations, never negative. The uncertainty is usually asymmetric: judge this side on its own, and give it a different expression from the other side when the risks are not the same. Make it evolve with t: a measured past is narrow and a forecast widens with the distance from today. Use abs(v) for a share of the value and max(0, t - 2026) for the time since today (never a bare sqrt(t - 2026), which is not computable in the past). Examples: "5" (a stable, well measured quantity), "0.02 * abs(v)" (a constant share of the value), "0.02 * abs(v) + 0.5 * sqrt(max(0, t - 2026))" (random shocks that add up), "0.02 * abs(v) + 0.1 * max(0, t - 2026)" (an unknown trend), "1 + 3 * tanh(max(0, t - 2026) / 10)" (a physically limited quantity).`
		);
}

export const UncertaintyDownSchema = uncertaintySide('below');
export const UncertaintyUpSchema = uncertaintySide('above');

export const EvolutionComponentSchema = z.object({
	function: z
		.string()
		.refine(isValidEvolutionFunction, 'Not a valid mathjs expression of t')
		.describe(
			'A mathjs expression of the time t, where t is the calendar year as a decimal number (2026.75 = October 2026). It gives the value of the unit at time t, e.g. "100 * 1.03^(t - 2026)", "50 + 20 * tanh((t - 2035) / 5)", "80 + 6 * sin(2 * pi * t)". Only use t, numbers, + - * / ^, and mathjs functions (exp, log, sqrt, sin, tanh, min, max...).'
		),
	weight: z.number().positive().describe('The weight of this function in the mix of functions.'),
	uncertainty_down: UncertaintyDownSchema,
	uncertainty_up: UncertaintyUpSchema
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
