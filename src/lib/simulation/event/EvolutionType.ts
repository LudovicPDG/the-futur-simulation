import { z } from 'zod';
import {
	isValidEvolutionFunction,
	isValidUncertaintyFunction,
	splineExpression,
	type CurveEdit,
	type EvolutionComponent
} from './EvolutionFunction';

/**
 * The genie never writes a function of the time as a formula: it gives interpolation points at precise dates, each
 * holding the value of every curve at this date (the value of an evolution, its uncertainty above and below, the
 * veracity, the impact...). The system draws each curve through its points with a monotone cubic spline (PCHIP),
 * and follows a free expression before the first and after the last point, joined smoothly (C1).
 */

/** One curve given by the points: what its number means at a date, the range of this number and its extrapolation. */
export interface CurveColumn {
	description: string;
	min?: number;
	max?: number;
	/** 'distance': an uncertainty, whose extrapolation is an expression of t and of the value v of the function. */
	kind?: 'value' | 'distance';
}

export type CurveColumns = Record<string, CurveColumn>;

/** The curves as the genie gives them: the points, then the extrapolation of each curve on each side. */
export interface CurvesInput {
	points: ({ date: number } & Record<string, number | null>)[];
	before: Record<string, string | null>;
	after: Record<string, string | null>;
}

const DateSchema = z
	.number()
	.describe(
		'The date of the point, as a decimal calendar year: 2026.75 = October 2026, 1985.29 = mid-April 1985. Use the real dates of the moments that matter.'
	);

function pointValue(column: CurveColumn, partial: boolean) {
	let value = z.number();
	if (column.min !== undefined) value = value.min(column.min);
	if (column.max !== undefined) value = value.max(column.max);
	const described = value.describe(column.description);
	return partial
		? described.nullable().describe(`${column.description} Null when this curve does not change at this date.`)
		: described;
}

function sideSchema(columns: CurveColumns, side: 'before' | 'after', partial: boolean) {
	const where = side === 'before' ? 'before the first point' : 'after the last point';
	return z
		.object(
			Object.fromEntries(
				Object.entries(columns).map(([key, column]) => [
					key,
					z
						.string()
						.nullable()
						.describe(
							`The "${key}" curve ${where}: a mathjs expression of the time t (the decimal calendar year)${
								column.kind === 'distance' ? ' and of v, the value of the function at t (e.g. "0.1 * abs(v)")' : ''
							}, any function you want (exponential, logistic, linear, tanh...), e.g. "2e9 * 1.08^(t - 2026)". The system bends it near the point so that the curve stays smooth (same value and same slope). ${
								partial ? 'Null to keep the current one.' : 'Null: the curve stays at the value of that point.'
							}`
						)
				])
			)
		)
		.describe(
			side === 'before'
				? 'How each curve goes on before the first point (into the past).'
				: 'How each curve goes on after the last point (into the future). Give a trend for a forecast instead of leaving it flat when the value is expected to keep changing.'
		);
}

/**
 * Curves of the time given as interpolation points. Partial: the edit of a proof, which gives only the points of the
 * period and the curves it changes.
 */
export function curvesSchema(columns: CurveColumns, partial = false) {
	return z.object({
		points: z
			.array(
				z.object({
					date: DateSchema,
					...Object.fromEntries(Object.entries(columns).map(([key, column]) => [key, pointValue(column, partial)]))
				})
			)
			.min(partial ? 0 : 1)
			.describe(
				partial
					? 'The interpolation points of the period this proof changes, at precise dates. Give ONLY points inside this period: the current points of the period are replaced by yours, the points outside of it are kept. In each point, give a number only for the curves the request changes and null for the others. Empty when no curve changes.'
					: 'The interpolation points, at precise dates, from the beginning to the end of what is described (its creation or birth, its key moments, today, forecasts). Usually 4 to 15 points, closer where the curves change quickly: the curve goes through every point and is interpolated between them by a monotone cubic spline that never overshoots, so put a point at every peak, trough and change of trend. For a sudden change, put two points very close in time. Each point gives the value of EVERY curve at its date.'
			),
		before: sideSchema(columns, 'before', partial),
		after: sideSchema(columns, 'after', partial)
	}) as unknown as z.ZodType<CurvesInput>;
}

/** The new points and extrapolations of one curve (the column key), or null when the curves do not change it. */
export function curveEdit(curves: CurvesInput, key: string): CurveEdit | null {
	const points = curves.points.flatMap((point) => {
		const value = point[key];
		return typeof value === 'number' && Number.isFinite(value) ? [[point.date, value] as [number, number]] : [];
	});
	const before = curves.before?.[key] ?? null;
	const after = curves.after?.[key] ?? null;
	if (points.length === 0 && before === null && after === null) return null;
	return {
		points,
		...(before !== null ? { before } : {}),
		...(after !== null ? { after } : {})
	};
}

/** The expression of one curve given in full (all its points), as a spline. */
export function curveExpression(curves: CurvesInput, key: string, column?: CurveColumn): string {
	const edit = curveEdit(curves, key);
	return splineExpression(
		{ points: edit?.points ?? [], before: edit?.before ?? null, after: edit?.after ?? null },
		column?.kind === 'distance' ? isValidUncertaintyFunction : isValidEvolutionFunction
	);
}

const UNCERTAINTY_ABOVE =
	'How far ABOVE the value the real value can be at this date: a distance in the unit of the value, about 2 standard deviations, never negative. Judge it on its own: it is usually different from the uncertainty below. Narrow for a well measured past, wider for an estimate or a forecast far from today.';
const UNCERTAINTY_BELOW =
	'How far BELOW the value the real value can be at this date: a distance in the unit of the value, about 2 standard deviations, never negative. Judge it on its own: it is usually different from the uncertainty above. Narrow for a well measured past, wider for an estimate or a forecast far from today.';

/** The curves of an evolution: its value and its uncertainty above and below. */
export function evolutionColumns(valueDescription = 'The value at this date, in the unit of the evolution.'): CurveColumns {
	return {
		value: { description: valueDescription },
		uncertainty_above: { description: UNCERTAINTY_ABOVE, min: 0, kind: 'distance' },
		uncertainty_below: { description: UNCERTAINTY_BELOW, min: 0, kind: 'distance' }
	};
}

/** The evolution (one component of weight 1) drawn through the curves "value", "uncertainty_above" and "uncertainty_below". */
export function evolutionFromCurves(curves: CurvesInput): EvolutionComponent[] {
	const columns = evolutionColumns();
	return [
		{
			function: curveExpression(curves, 'value', columns.value),
			weight: 1,
			uncertainty_down: curveExpression(curves, 'uncertainty_below', columns.uncertainty_below),
			uncertainty_up: curveExpression(curves, 'uncertainty_above', columns.uncertainty_above)
		}
	];
}

/** An evolution as the genie gives it (points), stored as its functions: one spline for the value and each uncertainty. */
export function evolutionPointsSchema(valueColumn?: CurveColumn) {
	const columns = evolutionColumns(valueColumn?.description);
	if (valueColumn) columns.value = valueColumn;
	return (curvesSchema(columns) as z.ZodType<CurvesInput>).transform(evolutionFromCurves);
}

export const EvolutionFunctionSchema = evolutionPointsSchema().describe(
	'The evolution of the value over time, given as interpolation points at precise dates: the value and its uncertainty above and below at each date.'
);

export const EvolutionTypeSchema = z.object({
	evolution: EvolutionFunctionSchema,
	unit: z.string().describe('The unit of this evolution')
});
