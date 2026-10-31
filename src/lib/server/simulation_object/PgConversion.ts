function escapePgQuotedValue(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function quotePgValue(value: string): string {
	return `"${escapePgQuotedValue(value)}"`;
}

function convertToPgArrayElement(value: unknown): string {
	if (value === null || value === undefined) {
		return 'NULL';
	}

	if (typeof value === 'string') {
		return quotePgValue(value);
	}

	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}

	return quotePgValue(convertToPg(value));
}

function convertToPgCompositeField(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}

	if (typeof value === 'string') {
		return quotePgValue(value);
	}

	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}

	return quotePgValue(convertToPg(value));
}

export function convertToPg(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}

	if (Array.isArray(value)) {
		return `{${value.map((item) => convertToPgArrayElement(item)).join(',')}}`;
	}

	if (typeof value === 'object') {
		const object = value as Record<string, unknown>;

		// other_fact_t stores its second field as JSONB.
		if ('name' in object && 'value' in object && !('description' in object)) {
			return `(${convertToPgCompositeField(object.name)},${convertToPgCompositeField(JSON.stringify(object.value))})`;
		}

		// evolution_t stores its mix of functions as JSONB.
		if ('evolution' in object && 'unit' in object && Object.keys(object).length === 2) {
			return `(${convertToPgCompositeField(JSON.stringify(object.evolution))},${convertToPgCompositeField(object.unit)})`;
		}

		return `(${Object.values(object).map(convertToPgCompositeField).join(',')})`;
	}

	if (typeof value === 'string') {
		return quotePgValue(value);
	}

	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}

	throw new Error(`Unsupported value: ${typeof value}`);
}

export function convertToPgNullable(value: unknown): string | null {
	return value === null || value === undefined ? null : convertToPg(value);
}
