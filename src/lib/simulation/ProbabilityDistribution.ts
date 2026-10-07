import { z } from 'zod';

/**
 * Skew Normal Distribution Parameter
 * Represents one skew-normal component in a mixture of distributions.
 * 
 * Formula for skew-normal density:
 *   f(t) = 2 * phi((t - xi) / omega) * Phi(alpha * (t - xi) / omega) / omega
 *
 * where:
 *   - xi: location parameter representing the most probable or center time/date (in years)
 *   - omega: scale parameter representing the uncertainty / dispersion (omega > 0)
 *   - alpha: shape/skewness parameter (alpha > 0 right/positive skew, alpha < 0 left/negative skew, alpha = 0 standard normal)
 *   - weight: relative mixture weight (default 1)
 */
export const SkewNormalParameterSchema = z.object({
	xi: z
		.number()
		.describe('Location parameter (xi): the most probable time or reference date in years.'),
	omega: z
		.number()
		.positive()
		.describe('Scale parameter (omega): the uncertainty or standard deviation of the time estimation (must be > 0).'),
	alpha: z
		.number()
		.default(0)
		.describe('Shape/skewness parameter (alpha): asymmetry of the distribution (0 = symmetric Gaussian, >0 = right skew tail towards future, <0 = left skew tail towards past).'),
	weight: z
		.number()
		.positive()
		.default(1)
		.describe('Mixture component weight: relative weight of this scenario in the overall mixture.')
});

export type SkewNormalParameter = z.infer<typeof SkewNormalParameterSchema>;

export const ProbabilityDistributionSchema = z
	.array(SkewNormalParameterSchema)
	.min(1)
	.describe(
		'The probability distribution as a mixture of skew normal distributions over time variable t in years. Each element in the array represents a scenario/component with xi (most probable date/time in years), omega (uncertainty/dispersion), alpha (asymmetry/skewness), and optional weight.'
	);

export type ProbabilityDistribution = z.infer<typeof ProbabilityDistributionSchema>;

/**
 * Standard Normal PDF: phi(x) = (1 / sqrt(2*pi)) * exp(-x^2 / 2)
 */
export function standardNormalPdf(x: number): number {
	return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

/**
 * Standard Normal CDF: Phi(x) using the Error Function (erf)
 * Phi(x) = 0.5 * (1 + erf(x / sqrt(2)))
 */
export function standardNormalCdf(x: number): number {
	return 0.5 * (1 + erf(x / Math.SQRT2));
}

/**
 * Error Function: erf(x) approximation via Abramowitz and Stegun (formula 7.1.26)
 * Max error <= 1.5e-7
 */
export function erf(x: number): number {
	const sign = x >= 0 ? 1 : -1;
	const absX = Math.abs(x);

	const a1 = 0.254829592;
	const a2 = -0.284496736;
	const a3 = 1.421413741;
	const a4 = -1.453152027;
	const a5 = 1.061405429;
	const p = 0.3275911;

	const t = 1.0 / (1.0 + p * absX);
	const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

	return sign * y;
}

/**
 * Evaluates a single Skew Normal Probability Density Function at point t:
 *   f(t; xi, omega, alpha) = (2 / omega) * phi((t - xi) / omega) * Phi(alpha * (t - xi) / omega)
 */
export function skewNormalPdf(t: number, param: SkewNormalParameter): number {
	const omega = Math.max(1e-6, param.omega);
	const xi = param.xi;
	const alpha = param.alpha ?? 0;

	const z = (t - xi) / omega;
	const phi = standardNormalPdf(z);
	const Phi = standardNormalCdf(alpha * z);

	return (2 / omega) * phi * Phi;
}

/**
 * Owen's T function: T(h, a) = 1/(2*pi) * integral_0^a exp(-h^2 (1 + x^2) / 2) / (1 + x^2) dx
 * Computed with composite Simpson's rule (the integrand is smooth), T(h, -a) = -T(h, a).
 */
export function owenT(h: number, a: number): number {
	if (a === 0) return 0;
	const sign = a < 0 ? -1 : 1;
	const upper = Math.abs(a);
	const steps = 64; // even
	const dx = upper / steps;
	const f = (x: number) => Math.exp(-0.5 * h * h * (1 + x * x)) / (1 + x * x);

	let sum = f(0) + f(upper);
	for (let i = 1; i < steps; i++) {
		sum += f(i * dx) * (i % 2 === 0 ? 2 : 4);
	}
	return (sign * (sum * dx) / 3) / (2 * Math.PI);
}

/**
 * Skew Normal CDF: F(t) = Phi(z) - 2 * T(z, alpha), with z = (t - xi) / omega
 * Unlike an integral from 0, this accumulates from -infinity, so it is valid for any real t.
 */
export function skewNormalCdf(t: number, param: SkewNormalParameter): number {
	const omega = Math.max(1e-6, param.omega);
	const z = (t - param.xi) / omega;
	const value = standardNormalCdf(z) - 2 * owenT(z, param.alpha ?? 0);
	return Math.min(1, Math.max(0, value));
}

/**
 * Cumulative distribution function of a weighted mixture of Skew Normal distributions (0 to 1)
 */
export function evaluateSkewNormalMixtureCdf(t: number, mixture: SkewNormalParameter[]): number {
	if (!Array.isArray(mixture) || mixture.length === 0) return 0;

	let totalWeight = 0;
	let weightedSum = 0;

	for (const comp of mixture) {
		const w = comp.weight !== undefined && comp.weight > 0 ? comp.weight : 1;
		totalWeight += w;
		weightedSum += w * skewNormalCdf(t, comp);
	}

	return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Inverse of the mixture CDF (quantile function), found by bisection.
 */
export function skewNormalMixtureQuantile(p: number, mixture: SkewNormalParameter[]): number {
	let lo = Infinity;
	let hi = -Infinity;
	for (const comp of mixture) {
		// A skew normal has essentially all of its mass within xi +/- 10 omega
		lo = Math.min(lo, comp.xi - 10 * comp.omega);
		hi = Math.max(hi, comp.xi + 10 * comp.omega);
	}

	for (let i = 0; i < 60; i++) {
		const mid = (lo + hi) / 2;
		if (evaluateSkewNormalMixtureCdf(mid, mixture) < p) lo = mid;
		else hi = mid;
	}
	return (lo + hi) / 2;
}

/**
 * Evaluates a mixture of Skew Normal distributions at point t
 */
export function evaluateSkewNormalMixture(t: number, mixture: SkewNormalParameter[]): number {
	if (!Array.isArray(mixture) || mixture.length === 0) return 0;

	let totalWeight = 0;
	let weightedSum = 0;

	for (const comp of mixture) {
		const w = comp.weight !== undefined && comp.weight > 0 ? comp.weight : 1;
		totalWeight += w;
		weightedSum += w * skewNormalPdf(t, comp);
	}

	return totalWeight > 0 ? weightedSum / totalWeight : 0;
}
