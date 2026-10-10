import { all, create } from 'mathjs';

/**
 * One component of an evolution: a mathematical function of the time t and its weight.
 * An evolution is a weighted mix of these components, but nearly all evolutions have only one.
 */
export interface EvolutionComponent {
	function: string;
	weight: number;
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

function evaluateCompiled(compiled: { evaluate: (scope: object) => unknown }, t: number): number {
	try {
		const value = compiled.evaluate({ t });
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
		components.push({ function: expression, weight: Number.isFinite(weight) && weight > 0 ? weight : 1 });
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
		return text === '' ? null : [{ function: text, weight: 1 }];
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
