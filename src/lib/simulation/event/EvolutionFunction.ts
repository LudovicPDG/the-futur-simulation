import { all, create, type EvalFunction, type MathNode } from 'mathjs';

/**
 * One component of an evolution: a mathematical function of the time t and its weight.
 * An evolution is a weighted mix of these components, but nearly all evolutions have only one.
 */
export interface EvolutionComponent {
	function: string;
	weight: number;
	/** Distance (about 2 sigma) below the function, as a mathjs expression of t and of its value v at t. */
	uncertainty_down: string;
	/** Distance (about 2 sigma) above the function, as a mathjs expression of t and of its value v at t. */
	uncertainty_up: string;
}

/** The two sides of an uncertainty at one moment: the function is the median, each side has its own spread. */
export interface EvolutionUncertainty {
	down: number;
	up: number;
}

const math = create(all);

/**
 * A function of the time given by interpolation points: the curve goes through every point and is interpolated
 * between them by a monotone cubic spline (PCHIP). Before the first point and after the last one, it follows its
 * extrapolations, joined to the spline with the same value and the same slope (C1).
 */
export interface Spline {
	/** The interpolation points [date, value], the date as a decimal year. */
	points: [number, number][];
	/** Expression of t (and of v for an uncertainty) before the first point; null: the curve stays at its value. */
	before: string | null;
	/** Expression of t (and of v for an uncertainty) after the last point; null: the curve stays at its value. */
	after: string | null;
}

/** The points sorted by date, without the ones that are not computable; on the same date, the last one given wins. */
function cleanPoints(points: [number, number][]): [number, number][] {
	const byDate = new Map<number, number>();
	for (const [date, value] of points) {
		if (Number.isFinite(date) && Number.isFinite(value)) byDate.set(date, value);
	}
	return [...byDate.entries()].sort((a, b) => a[0] - b[0]);
}

/**
 * The slopes of the PCHIP (Fritsch-Carlson) at each point: the weighted harmonic mean of the slopes around it, 0 at a
 * peak or a trough, so that the curve never overshoots between two points. At an end without an extrapolation the
 * curve is flat (it stays at its value afterwards); at an end with one, the usual one-sided PCHIP slope.
 */
function pchipSlopes(xs: number[], ys: number[], flatStart: boolean, flatEnd: boolean): number[] {
	const n = xs.length;
	if (n < 2) return [0];
	const h = xs.slice(1).map((x, i) => x - xs[i]);
	const delta = h.map((step, i) => (ys[i + 1] - ys[i]) / step);
	const slopes = new Array<number>(n).fill(0);
	if (n === 2) {
		slopes[0] = slopes[1] = delta[0];
	} else {
		for (let k = 1; k < n - 1; k++) {
			if (delta[k - 1] * delta[k] <= 0) continue;
			const w1 = 2 * h[k] + h[k - 1];
			const w2 = h[k] + 2 * h[k - 1];
			slopes[k] = (w1 + w2) / (w1 / delta[k - 1] + w2 / delta[k]);
		}
		const end = (h0: number, h1: number, d0: number, d1: number) => {
			const slope = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
			if (Math.sign(slope) !== Math.sign(d0)) return 0;
			if (Math.sign(d0) !== Math.sign(d1) && Math.abs(slope) > 3 * Math.abs(d0)) return 3 * d0;
			return slope;
		};
		slopes[0] = end(h[0], h[1], delta[0], delta[1]);
		slopes[n - 1] = end(h[n - 2], h[n - 3], delta[n - 2], delta[n - 3]);
	}
	if (flatStart) slopes[0] = 0;
	if (flatEnd) slopes[n - 1] = 0;
	return slopes;
}

/** The cubic Hermite spline through the points with these slopes, at a moment t between the first and the last point. */
function hermiteAt(xs: number[], ys: number[], slopes: number[], t: number): number {
	if (xs.length === 1) return ys[0];
	let lo = 0;
	let hi = xs.length - 1;
	while (hi - lo > 1) {
		const middle = (lo + hi) >> 1;
		if (xs[middle] <= t) lo = middle;
		else hi = middle;
	}
	const step = xs[hi] - xs[lo];
	const s = (t - xs[lo]) / step;
	const s2 = s * s;
	const s3 = s2 * s;
	return (
		(2 * s3 - 3 * s2 + 1) * ys[lo] +
		(s3 - 2 * s2 + s) * step * slopes[lo] +
		(-2 * s3 + 3 * s2) * ys[hi] +
		(s3 - s2) * step * slopes[hi]
	);
}

/** A spline ready to be computed: its points, its slopes and its compiled extrapolations. */
interface SplineModel {
	time: EvalFunction;
	xs: number[];
	ys: number[];
	slopes: number[];
	before: EvalFunction | null;
	after: EvalFunction | null;
	/** Time scale over which an extrapolation is bent to join the spline: the length of the interval at that end. */
	scaleBefore: number;
	scaleAfter: number;
}

const splineModels = new WeakMap<MathNode, SplineModel>();

function toNumbers(raw: unknown): number[] {
	const array = typeof raw === 'object' && raw !== null && 'toArray' in raw ? (raw as { toArray: () => unknown }).toArray() : raw;
	return Array.isArray(array) ? array.flat(Infinity).map(Number) : [Number(array)];
}

/** An extrapolation argument of pchip: null (none) or an expression of t. */
function extrapolation(node: MathNode | undefined): EvalFunction | null {
	if (!node || (node.type === 'ConstantNode' && (node as unknown as { value: unknown }).value === null)) return null;
	return node.compile();
}

function splineModel(args: MathNode[]): SplineModel {
	const known = splineModels.get(args[1]);
	if (known) return known;
	const dates = toNumbers(args[1].compile().evaluate({}));
	const values = toNumbers(args[2].compile().evaluate({}));
	const points = cleanPoints(dates.map((date, i) => [date, values[i]] as [number, number]));
	if (points.length === 0) throw new Error('A spline needs at least one point');
	const xs = points.map(([date]) => date);
	const ys = points.map(([, value]) => value);
	const before = extrapolation(args[3]);
	const after = extrapolation(args[4]);
	const n = xs.length;
	const model: SplineModel = {
		time: args[0].compile(),
		xs,
		ys,
		slopes: pchipSlopes(xs, ys, !before, !after),
		before,
		after,
		scaleBefore: n > 1 ? xs[1] - xs[0] : 1,
		scaleAfter: n > 1 ? xs[n - 1] - xs[n - 2] : 1
	};
	splineModels.set(args[1], model);
	return model;
}

/**
 * An extrapolation f joined to the spline at the point (x0, y0) of slope d0: f + (A + B (t - x0)) exp(-((t - x0) / tau)^2),
 * with A and B such that the value and the slope are the ones of the spline at x0. Far from x0, it is f itself.
 */
function joined(f: EvalFunction, x0: number, y0: number, d0: number, tau: number, t: number, v: unknown): number {
	const at = (time: number) => {
		const value = f.evaluate(v === undefined ? { t: time } : { t: time, v });
		return typeof value === 'number' ? value : Number.NaN;
	};
	const h = Math.max(1e-6, tau * 1e-4);
	const a = y0 - at(x0);
	const b = d0 - (at(x0 + h) - at(x0 - h)) / (2 * h);
	const x = t - x0;
	return at(t) + (a + b * x) * Math.exp(-((x / tau) ** 2));
}

/**
 * pchip(t, [dates], [values], before, after): the spline through the points at the moment t (see Spline). Its
 * arguments are read raw, so that the extrapolations can be computed at other moments than t.
 */
function pchip(args: MathNode[], _math: unknown, scope: Map<string, unknown>): number {
	if (args.length < 3) throw new Error('pchip(t, dates, values, before, after)');
	const model = splineModel(args);
	const t = Number(model.time.evaluate(scope));
	const { xs, ys, slopes } = model;
	const last = xs.length - 1;
	const v = scope.has('v') ? scope.get('v') : undefined;
	if (t < xs[0]) return model.before ? joined(model.before, xs[0], ys[0], slopes[0], model.scaleBefore, t, v) : ys[0];
	if (t > xs[last]) {
		return model.after ? joined(model.after, xs[last], ys[last], slopes[last], model.scaleAfter, t, v) : ys[last];
	}
	return hermiteAt(xs, ys, slopes, t);
}
(pchip as unknown as { rawArgs: boolean }).rawArgs = true;
math.import({ pchip });

// Taken before the import below: afterwards, math.compile would be rebuilt on the forbidden parse.
const mathCompile = math.compile;
const mathParse = math.parse;

const compiledExpressions = new Map<string, EvalFunction>();

/** The values are read again at every step of the time machine: each expression is compiled only once. */
function compile(expression: string): EvalFunction {
	let compiled = compiledExpressions.get(expression);
	if (!compiled) {
		compiled = mathCompile(expression);
		compiledExpressions.set(expression, compiled);
	}
	return compiled;
}

// The expressions come from the model: forbid everything that could reach outside of a pure
// computation (recommended mathjs hardening for untrusted expressions).
const forbidden = () => {
	throw new Error('Function not allowed in an evolution');
};
math.import(
	{
		import: forbidden,
		createUnit: forbidden,
		reviver: forbidden,
		evaluate: forbidden,
		parse: forbidden,
		simplify: forbidden,
		derivative: forbidden,
		resolve: forbidden
	},
	{ override: true }
);

/** Reference date used to check that a function is computable (decimal year, 2026.75 = Oct. 2026). */
const CHECK_YEARS = [2026.75, 2035, 2050, 2075];
/** Values of a function used to check that an uncertainty is computable. */
const CHECK_VALUES = [1, 100];

function evaluateCompiled(compiled: { evaluate: (scope: object) => unknown }, t: number, v?: number): number {
	try {
		const value = compiled.evaluate(v === undefined ? { t } : { t, v });
		return typeof value === 'number' ? value : Number.NaN;
	} catch {
		return Number.NaN;
	}
}

/** True when the expression compiles and gives a finite number for t in the next decades. */
export function isValidEvolutionFunction(expression: string): boolean {
	try {
		const compiled = compile(expression);
		return CHECK_YEARS.some((t) => Number.isFinite(evaluateCompiled(compiled, t)));
	} catch {
		return false;
	}
}

/** True when the expression compiles and gives a distance (a finite number, not negative) for t in the next decades. */
export function isValidUncertaintyFunction(expression: string): boolean {
	try {
		const compiled = compile(expression);
		return CHECK_YEARS.some((t) =>
			CHECK_VALUES.some((v) => {
				const distance = evaluateCompiled(compiled, t, v);
				return Number.isFinite(distance) && distance >= 0;
			})
		);
	} catch {
		return false;
	}
}

/** Builds the function (t, v) -> distance of one side of an uncertainty: 0 where it is negative or not computable. */
function buildDistance(expression: string): (t: number, v: number) => number {
	let compiled: EvalFunction;
	try {
		compiled = compile(expression);
	} catch {
		return () => 0;
	}
	return (t, v) => {
		const distance = evaluateCompiled(compiled, t, v);
		return Number.isFinite(distance) ? Math.max(0, distance) : 0;
	};
}

/**
 * Builds the function t -> distances (about 2 sigma) of the uncertainty of an evolution below and above it: on each
 * side, the weighted average of the distance of each of its components.
 */
export function buildEvolutionUncertainty(components: EvolutionComponent[]): (t: number) => EvolutionUncertainty {
	const parts = components.map((component) => ({
		valueAt: buildEvolutionFunction([component]),
		down: buildDistance(component.uncertainty_down),
		up: buildDistance(component.uncertainty_up),
		weight: component.weight
	}));
	const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
	return (t: number) => {
		const uncertainty = { down: 0, up: 0 };
		for (const part of parts) {
			const v = part.valueAt(t);
			uncertainty.down += (part.weight * part.down(t, v)) / totalWeight;
			uncertainty.up += (part.weight * part.up(t, v)) / totalWeight;
		}
		return uncertainty;
	};
}

/**
 * A score of a proof (veracity, uncertainty, impact) as a function of t, from 0 to 100, without uncertainty: an
 * expression, or a number saved before the scores were functions, which becomes a constant function.
 */
export function toScoreFunction(raw: unknown): string {
	if (typeof raw === 'object' && raw !== null && 'function' in raw) return toScoreFunction(raw.function);
	const text = String(raw ?? '').trim();
	// A score saved with an uncertainty (a JSON text) keeps its function only.
	if (text.startsWith('{')) {
		try {
			return toScoreFunction(JSON.parse(text));
		} catch {
			// not a JSON score: an expression
		}
	}
	return text !== '' && Number.isFinite(Number(text)) ? String(Number(text)) : text;
}

/** The value of a score of a proof at the moment t, between 0 and 100; NaN where it cannot be computed. */
export function scoreAt(score: unknown, t: number): number {
	try {
		const value = evaluateCompiled(compile(toScoreFunction(score)), t);
		return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : Number.NaN;
	} catch {
		return Number.NaN;
	}
}

/** True when the expression gives different values over the next decades: a constant is not a function of the time. */
export function dependsOnTime(expression: string): boolean {
	try {
		const compiled = compile(expression);
		const values = [1990, 2026.75, 2050, 2100].map((t) => evaluateCompiled(compiled, t)).filter(Number.isFinite);
		return values.some((value) => Math.abs(value - values[0]) > 1e-9);
	} catch {
		return false;
	}
}

/** The two sides of an uncertainty as a short text (numbers, not expressions): a single ± when they are the same. */
export function formatUncertainty(down: string, up: string): string {
	return down === up ? `± ${down}` : `− ${down} | + ${up}`;
}

/**
 * Builds the function t -> value of an evolution: the weighted average of its components.
 * Gives NaN where a component cannot be computed.
 */
export function buildEvolutionFunction(components: EvolutionComponent[]): (t: number) => number {
	const compiled = components.map((component) => {
		try {
			return { compiled: compile(component.function), weight: component.weight };
		} catch {
			return null;
		}
	});
	const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);

	return (t: number) => {
		if (compiled.length === 0 || compiled.some((item) => item === null)) return Number.NaN;
		let sum = 0;
		for (const item of compiled) sum += item!.weight * evaluateCompiled(item!.compiled, t);
		return sum / totalWeight;
	};
}

/**
 * The mix of functions as one single function: the weighted average of the components, written as one expression,
 * with the weighted average of their uncertainties. In an uncertainty, v is the value of its own component: it is
 * replaced by this component, since v would otherwise become the value of the whole mix.
 */
export function combineEvolution(components: EvolutionComponent[]): EvolutionComponent {
	if (components.length === 1) return components[0];
	const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
	const mix = (expressionOf: (component: EvolutionComponent) => string) =>
		components
			.map((component) => `${Math.round((component.weight / totalWeight) * 10000) / 10000} * (${expressionOf(component)})`)
			.join(' + ');
	// A side is kept at 0 or above on its own, as it is when the components are computed separately.
	const distance = (expressionOf: (component: EvolutionComponent) => string) =>
		mix((component) => `max(0, ${expressionOf(component).replace(/\bv\b/g, () => `(${component.function})`)})`);
	return {
		function: mix((component) => component.function),
		weight: 1,
		uncertainty_down: distance((component) => component.uncertainty_down),
		uncertainty_up: distance((component) => component.uncertainty_up)
	};
}

/** Splits a postgres record literal like ("a ""b""",c) into its raw fields. */
function parsePgRecord(literal: string): (string | null)[] | null {
	const input = literal.trim();
	if (!input.startsWith('(') || !input.endsWith(')')) return null;
	const fields: (string | null)[] = [];
	let field = '';
	let quoted = false;
	let wasQuoted = false;
	for (let i = 1; i < input.length - 1; i++) {
		const c = input[i];
		if (quoted) {
			if (c === '\\' && i + 1 < input.length - 1) field += input[++i];
			else if (c === '"' && input[i + 1] === '"') {
				field += '"';
				i++;
			} else if (c === '"') quoted = false;
			else field += c;
		} else if (c === '"') {
			quoted = true;
			wasQuoted = true;
		} else if (c === ',') {
			fields.push(field === '' && !wasQuoted ? null : field);
			field = '';
			wasQuoted = false;
		} else field += c;
	}
	fields.push(field === '' && !wasQuoted ? null : field);
	return fields;
}

function toComponents(raw: unknown): EvolutionComponent[] | null {
	if (!Array.isArray(raw) || raw.length === 0) return null;
	const components: EvolutionComponent[] = [];
	for (const item of raw) {
		if (typeof item !== 'object' || item === null) return null;
		const expression = (item as Record<string, unknown>).function;
		const weight = Number((item as Record<string, unknown>).weight ?? 1);
		if (typeof expression !== 'string' || expression.trim() === '') return null;
		const record = item as Record<string, unknown>;
		const legacy = legacyUncertainty(record.uncertainty);
		components.push({
			function: expression,
			weight: Number.isFinite(weight) && weight > 0 ? weight : 1,
			uncertainty_down: parseDistance(record.uncertainty_down) ?? legacy,
			uncertainty_up: parseDistance(record.uncertainty_up) ?? legacy
		});
	}
	return components;
}

/**
 * Reads the mix of functions of an evolution from whatever the app receives: the array itself, its
 * JSON text, or (legacy) a plain expression of t. Returns null when it is none of them.
 */
export function parseEvolutionFunction(raw: unknown): EvolutionComponent[] | null {
	if (typeof raw === 'string') {
		const text = raw.trim();
		if (text.startsWith('[') || text.startsWith('{')) {
			try {
				return parseEvolutionFunction(JSON.parse(text));
			} catch {
				return null;
			}
		}
		if (text === '') return null;
		const legacy = legacyUncertainty(DEFAULT_UNCERTAINTY);
		return [{ function: text, weight: 1, uncertainty_down: legacy, uncertainty_up: legacy }];
	}
	if (typeof raw === 'object' && raw !== null && !Array.isArray(raw) && 'function' in raw) {
		return toComponents([raw]);
	}
	return toComponents(raw);
}

export interface EvolutionValue {
	evolution: EvolutionComponent[];
	unit: string;
}

export const DEFAULT_UNCERTAINTY = 0.1;

/** Reads one side of an uncertainty (an expression or a number), or undefined when it is not given. */
function parseDistance(raw: unknown): string | undefined {
	if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return String(raw);
	return typeof raw === 'string' && raw.trim() !== '' ? raw : undefined;
}

/**
 * The expression of the uncertainty saved before it had two sides: one number or numeric text, a share of the value
 * (0.1 = +-10%), falling back to the default one.
 */
function legacyUncertainty(raw: unknown): string {
	const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
	const share = typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(value, 1) : DEFAULT_UNCERTAINTY;
	return share === 0 ? '0' : `${share} * abs(v)`;
}

/**
 * Reads an evolution_t value ({ evolution, unit }) given either as an object or as the raw
 * postgres record literal. Returns null when the value is not an evolution.
 */
export function parseEvolutionValue(raw: unknown): EvolutionValue | null {
	let value = raw;
	if (typeof value === 'string') {
		const fields = parsePgRecord(value);
		if (!fields || fields.length !== 2 || fields[0] === null) return null;
		value = { evolution: fields[0], unit: fields[1] ?? '' };
	}
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	if (!('evolution' in record) || !('unit' in record)) return null;
	const evolution = parseEvolutionFunction(record.evolution);
	if (!evolution) return null;
	return { evolution, unit: typeof record.unit === 'string' ? record.unit : '' };
}

/** Years scanned to check that a probability stays between 0 and 1 (and to find when something exists). */
const SCAN_START = 0;
const SCAN_END = 3500;
const SCAN_STEP = 0.25;

/** True when the expression compiles and never gives a number outside of [0, 100] (a percentage). */
export function isPercentageFunction(expression: string): boolean {
	try {
		const compiled = compile(expression);
		let finite = 0;
		for (let t = SCAN_START; t <= SCAN_END; t += SCAN_STEP) {
			const value = evaluateCompiled(compiled, t);
			if (!Number.isFinite(value)) continue;
			if (value < -1e-7 || value > 100 + 1e-7) return false;
			finite++;
		}
		return finite > 0;
	} catch {
		return false;
	}
}

export interface ExistenceInterval {
	/** False when the existence never goes over 50% */
	exists: boolean;
	/** First moment (decimal year) the existence goes over 50%, -Infinity if it already is at the start of the scan */
	from: number;
	/** Last moment the existence is over 50%, Infinity if it still is at the end of the scan */
	to: number;
}

const intervals = new Map<string, ExistenceInterval>();

/**
 * Period during which the existence (in percent) is over 50%: the thing is considered to exist from the
 * moment it is more probable than not until the moment it is not anymore.
 */
export function existenceInterval(components: EvolutionComponent[]): ExistenceInterval {
	const key = JSON.stringify(components);
	const cached = intervals.get(key);
	if (cached) return cached;

	const valueAt = buildEvolutionFunction(components);
	const over = (t: number) => valueAt(t) >= 50;
	// Moment between a point where the probability is under 50% and one where it is over, to the second
	const edge = (outside: number, inside: number) => {
		let a = outside;
		let b = inside;
		for (let i = 0; i < 40; i++) {
			const middle = (a + b) / 2;
			if (over(middle)) b = middle;
			else a = middle;
		}
		return (a + b) / 2;
	};

	let first: number | null = null;
	let last = SCAN_START;
	for (let t = SCAN_START; t <= SCAN_END; t += SCAN_STEP) {
		if (!over(t)) continue;
		first ??= t;
		last = t;
	}

	const result: ExistenceInterval =
		first === null
			? { exists: false, from: -Infinity, to: Infinity }
			: {
					exists: true,
					from: first <= SCAN_START ? -Infinity : edge(first - SCAN_STEP, first),
					to: last >= SCAN_END - SCAN_STEP ? Infinity : edge(last + SCAN_STEP, last)
				};
	intervals.set(key, result);
	return result;
}

/** A number written so that mathjs reads it back exactly. */
function numberText(value: number): string {
	return String(value);
}

/**
 * The expression of a spline: pchip(t, [dates], [values], before, after). An extrapolation that is not computable
 * (checked with isValid, an expression of t or of t and v) is left out: the curve stays at its value there.
 */
export function splineExpression(
	spline: Spline,
	isValid: (expression: string) => boolean = isValidEvolutionFunction
): string {
	const points = cleanPoints(spline.points);
	if (points.length === 0) return '0';
	const side = (expression: string | null) =>
		expression && expression.trim() !== '' && isValid(expression) ? `(${expression})` : 'null';
	return `pchip(t, [${points.map(([date]) => numberText(date)).join(', ')}], [${points
		.map(([, value]) => numberText(value))
		.join(', ')}], ${side(spline.before)}, ${side(spline.after)})`;
}

function pchipNodes(expression: string): MathNode[] {
	try {
		return mathParse(expression).filter(
			(node) => node.type === 'FunctionNode' && (node as unknown as { fn: { name?: string } }).fn.name === 'pchip'
		);
	} catch {
		return [];
	}
}

/** The spline the expression is, when it is exactly one pchip(...); null for any other expression. */
export function parseSpline(expression: unknown): Spline | null {
	if (typeof expression !== 'string') return null;
	let node: MathNode;
	try {
		node = mathParse(expression);
	} catch {
		return null;
	}
	while (node.type === 'ParenthesisNode') node = (node as unknown as { content: MathNode }).content;
	if (node.type !== 'FunctionNode' || (node as unknown as { fn: { name?: string } }).fn.name !== 'pchip') return null;
	const args = (node as unknown as { args: MathNode[] }).args;
	if (args.length < 3) return null;
	try {
		const dates = toNumbers(args[1].compile().evaluate({}));
		const values = toNumbers(args[2].compile().evaluate({}));
		const side = (arg: MathNode | undefined) => {
			if (!arg || extrapolation(arg) === null) return null;
			let content = arg;
			while (content.type === 'ParenthesisNode') content = (content as unknown as { content: MathNode }).content;
			return content.toString();
		};
		return {
			points: cleanPoints(dates.map((date, i) => [date, values[i]] as [number, number])),
			before: side(args[3]),
			after: side(args[4])
		};
	} catch {
		return null;
	}
}

/** The dates of the interpolation points of every spline in the expression (a mix of proofs holds several). */
export function splineDates(expression: unknown): number[] {
	if (typeof expression !== 'string') return [];
	const dates = new Set<number>();
	for (const node of pchipNodes(expression)) {
		const args = (node as unknown as { args: MathNode[] }).args;
		try {
			for (const date of toNumbers(args[1].compile().evaluate({}))) if (Number.isFinite(date)) dates.add(date);
		} catch {
			// not a constant list of dates
		}
	}
	return [...dates].sort((a, b) => a - b);
}

/** The change a proof makes to a curve: new points over a period, and maybe new extrapolations (undefined: kept). */
export interface CurveEdit {
	points: [number, number][];
	before?: string | null;
	after?: string | null;
}

/** Dates at which a curve that is not a spline is read, to become one: its own points, else every decade around today. */
function samplingDates(expression: string): number[] {
	const dates = splineDates(expression);
	if (dates.length > 0) return dates;
	const today = Math.round(new Date().getUTCFullYear() / 10) * 10;
	return Array.from({ length: 11 }, (_, i) => today - 50 + 10 * i);
}

/**
 * The curve after the edit: the points of the current curve inside the period of the new points are replaced by them,
 * the others are kept, and so are the extrapolations it does not give. A current curve that is not one spline (a mix
 * of proofs, or saved before the splines) is kept as the extrapolation around the new points.
 */
export function editSpline(
	current: string,
	edit: CurveEdit,
	isValid: (expression: string) => boolean = isValidEvolutionFunction
): string {
	const points = cleanPoints(edit.points);
	const spline = parseSpline(current);
	if (spline) {
		const from = points[0]?.[0] ?? Infinity;
		const to = points.at(-1)?.[0] ?? -Infinity;
		return splineExpression(
			{
				points: [...spline.points.filter(([date]) => date < from || date > to), ...points],
				before: edit.before === undefined ? spline.before : edit.before,
				after: edit.after === undefined ? spline.after : edit.after
			},
			isValid
		);
	}
	if (points.length > 0) {
		return splineExpression(
			{
				points,
				before: edit.before === undefined ? current : edit.before,
				after: edit.after === undefined ? current : edit.after
			},
			isValid
		);
	}
	// Only the extrapolations change: the curve becomes the spline of its own values.
	const compiled = (() => {
		try {
			return compile(current);
		} catch {
			return null;
		}
	})();
	const sampled = samplingDates(current).map(
		(date) => [date, compiled ? evaluateCompiled(compiled, date, 0) : 0] as [number, number]
	);
	return editSpline(splineExpression({ points: sampled, before: current, after: current }, isValid), edit, isValid);
}

/** A period of time, as decimal years; null for a side that has no end (before the first or after the last point). */
export type TimeRange = [number | null, number | null];

/**
 * The period over which two curves differ: where a proof really changes a curve. Null when they are the same. For an
 * uncertainty, valueAt gives the value v of the function at each moment.
 */
export function changedRange(
	before: string,
	after: string,
	valueAt?: (t: number) => number
): TimeRange | null {
	let old: EvalFunction;
	let edited: EvalFunction;
	try {
		old = compile(before);
		edited = compile(after);
	} catch {
		return [null, null];
	}
	const dates = [...splineDates(before), ...splineDates(after)];
	const first = dates.length > 0 ? Math.min(...dates) : new Date().getUTCFullYear();
	const last = dates.length > 0 ? Math.max(...dates) : first;
	// Far enough for the junction of an extrapolation to have faded out.
	const pad = 5 * Math.max(last - first, 5);
	const lo = first - pad;
	const hi = last + pad;
	const STEPS = 2000;
	const times = [...Array.from({ length: STEPS + 1 }, (_, i) => lo + ((hi - lo) * i) / STEPS), ...dates].sort((a, b) => a - b);
	const pairs = times.map((t) => {
		const v = valueAt?.(t);
		return [evaluateCompiled(old, t, v), evaluateCompiled(edited, t, v)];
	});
	// A relative difference at each moment, and an absolute one for a curve that crosses 0 (scale of its points).
	const scale = Math.max(
		1e-9,
		...pairs.filter((_, i) => times[i] >= first && times[i] <= last).flat().filter(Number.isFinite).map(Math.abs)
	);
	const differs = pairs.map(
		([a, b]) =>
			Number.isFinite(a) !== Number.isFinite(b) ||
			(Number.isFinite(a) && Math.abs(a - b) > 1e-6 * Math.max(Math.abs(a), Math.abs(b)) + 1e-9 * scale)
	);
	const start = differs.indexOf(true);
	if (start === -1) return null;
	const end = differs.lastIndexOf(true);
	return [start === 0 ? null : times[start], end === times.length - 1 ? null : times[end]];
}
