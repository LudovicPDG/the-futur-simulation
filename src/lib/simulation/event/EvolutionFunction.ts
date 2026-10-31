import { all, create, type EvalFunction } from 'mathjs';

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
const compile = math.compile;

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
