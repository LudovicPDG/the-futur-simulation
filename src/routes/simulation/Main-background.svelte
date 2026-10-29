<script lang="ts">
	import type { RelationData } from '$lib/simulation/Relation';
	import type { SimulationElementWithId } from '$lib/stores/simulation';
	import { renderSimulationElementSvg } from '$lib/simulation/renderSvg';
	import { svg_shape as relation_svg_shape, relationValueName } from '$lib/simulation/Relation';
	import { parseTranslation } from '$lib/simulation/Translation';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { getLocale } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import EvolutionChart from './EvolutionChart.svelte';
	import ValueParameters, {
		type RelationInfluenceEntry,
		type ValueInfluence
	} from './ValueParameters.svelte';
	import {
		parseEvolutionFunction,
		parseEvolutionValue,
		buildEvolutionFunction,
		type EvolutionValue
	} from '$lib/simulation/event/EvolutionFunction';
	import type { ProofData } from '$lib/simulation/Proof';
	import { resolveValue } from '$lib/simulation/ProofResolution';
	import { onMount } from 'svelte';
	import {
		addProofTarget,
		addRelationTarget,
		addValueTarget,
		debateTarget,
		type ValueListField
	} from '$lib/stores/debate';

	type ItemParameter = { label: string; amount: string; uncertainty: string; unit: string };

	let {
		new_element,
		simulation_data = []
	}: { new_element?: any; simulation_data?: SimulationElementWithId[] } = $props();

	let cameraX = $state(400);
	let cameraY = $state(300);
	let zoom = $state(1);
	let hoveredElement = $state<SimulationElementWithId | null>(null);
	let selectedElement = $state<SimulationElementWithId | null>(null);

	onMount(() => {
		cameraX = window.innerWidth / 2;
		cameraY = window.innerHeight / 2;
	});

	let isPanning = $state(false);

	let lastPointerX = 0;
	let lastPointerY = 0;

	// Compute positioning of elements in a circular / spiraling web layout
	function getNodePosition(index: number, total: number) {
		if (total <= 1) return { x: 0, y: 0 };
		const angle = (index / total) * 2 * Math.PI;
		const radius = Math.min(450, 140 + total * 28);
		return {
			x: Math.cos(angle) * radius,
			y: Math.sin(angle) * radius
		};
	}

	function handlePointerDown(event: PointerEvent) {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		if ((event.target as Element | null)?.closest('.element-details')) return;
		if (getNodeElement(event.target)) {
			selectedElement = getSimulationElement(event.target);
			return;
		}

		isPanning = true;
		lastPointerX = event.clientX;
		lastPointerY = event.clientY;

		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function handlePointerMove(event: PointerEvent) {
		if (!isPanning) return;

		const dx = event.clientX - lastPointerX;
		const dy = event.clientY - lastPointerY;

		cameraX += dx;
		cameraY += dy;

		lastPointerX = event.clientX;
		lastPointerY = event.clientY;
	}

	function handlePointerUp(event: PointerEvent) {
		isPanning = false;

		if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) {
			(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
		}
	}

	function getNodeElement(target: EventTarget | null): Element | null {
		return target instanceof Element ? target.closest('.fact-node') : null;
	}

	function getSimulationElement(target: EventTarget | null): SimulationElementWithId | null {
		const node = getNodeElement(target);
		const index = Number(node?.closest('[data-element-index]')?.getAttribute('data-element-index'));
		if (!Number.isInteger(index)) return null;
		return (
			renderedElements.relations.find((item) => item.index === index)?.element ??
			renderedElements.nodes.find((item) => item.index === index)?.element ??
			null
		);
	}

	function handlePointerOver(event: PointerEvent) {
		const element = getSimulationElement(event.target);
		if (element) hoveredElement = element;
	}

	function handlePointerOut(event: PointerEvent) {
		const node = getNodeElement(event.target);
		const nextTarget = event.relatedTarget;
		const nextElement = nextTarget instanceof Element ? nextTarget : null;
		if (
			node &&
			!(nextTarget instanceof Node && node.contains(nextTarget)) &&
			!nextElement?.closest('.element-details') &&
			!getNodeElement(nextTarget)
		) {
			hoveredElement = null;
		}
	}

	function handleDetailsPointerLeave() {
		if (!selectedElement) hoveredElement = null;
	}

	function localizedValue(value: unknown): string {
		if (typeof value === 'string') {
			const parsed = parseTranslation(value);
			if (parsed) return parsed[currentLocale] || parsed.fr || parsed.en || '';
			return value;
		}

		if (Array.isArray(value)) {
			return value.map((item) => formatValue(item)).join('\n');
		}

		if (typeof value === 'object' && value !== null) {
			const record = value as Record<string, unknown>;
			const languageKeys = ['fr', 'en', 'de', 'es'];
			if (languageKeys.some((key) => key in record)) {
				return String(record[currentLocale] || record.fr || record.en || '');
			}
		}

		return '';
	}

	function parsePgArray(value: string): string[] | null {
		const input = value.trim();
		if (!input.startsWith('{') || !input.endsWith('}')) return null;
		const body = input.slice(1, -1);
		if (body === '') return [];
		const items: string[] = [];
		let item = '';
		let quoted = false;
		for (let i = 0; i < body.length; i++) {
			const c = body[i];
			if (c === '\\' && quoted && i + 1 < body.length) item += body[++i];
			else if (c === '"') quoted = !quoted;
			else if (c === ',' && !quoted) {
				items.push(item);
				item = '';
			} else item += c;
		}
		items.push(item);
		return items;
	}

	// The entries of a list. An entry with a title (capability, willingness...) is shown by its title, which is what
	// relations and proofs target; its description comes next.
	// A parameter of a list entry (quantity, level of wear...) shown as its number now, its uncertainty and its unit
	function entryParameter(key: string, raw: unknown): ItemParameter | null {
		const parsed = parseEvolutionValue(raw);
		if (!parsed) return null;
		const score = buildEvolutionFunction(parsed.evolution)(currentYear());
		const totalWeight = parsed.evolution.reduce((sum, item) => sum + item.weight, 0) || 1;
		const uncertainty =
			(parsed.evolution.reduce((sum, item) => sum + item.uncertainty * item.weight, 0) / totalWeight) * 100;
		return {
			label: formatLabel(key),
			amount: Number.isFinite(score)
				? new Intl.NumberFormat(currentLocale, { maximumFractionDigits: 2 }).format(score)
				: '—',
			uncertainty: uncertainty > 0 ? `±${Math.round(uncertainty * 10) / 10}%` : '',
			unit: parsed.unit
		};
	}

	function listItems(
		value: unknown
	): { name: unknown; title: string; description: string; parameters: ItemParameter[] }[] | null {
		const raw = typeof value === 'string' ? parsePgArray(value) : Array.isArray(value) ? value : null;
		if (!raw || raw.length === 0) return null;
		return raw.map((item) => {
			if (typeof item === 'object' && item !== null && 'name' in item) {
				const titled = item as {
					name: unknown;
					description?: unknown;
					quantity?: unknown;
					level_of_wear?: unknown;
				};
				// A material resource of an action has parameters (quantity, level of wear) after its description
				const parameters = (['quantity', 'level_of_wear'] as const).flatMap((key) => {
					const parameter = entryParameter(key, titled[key]);
					return parameter ? [parameter] : [];
				});
				return {
					name: titled.name,
					title: formatValue(titled.name),
					description: titled.description ? formatValue(titled.description) : '',
					parameters
				};
			}
			return { name: item, title: formatValue(item), description: '', parameters: [] };
		});
	}

	// "Add a value" on a list of the active element: the next prompt asks the genie to add a value to this list.
	function startAddValue(field: ValueListField) {
		if (!activeElement) return;
		const list =
			field === 'other'
				? m.simulation_section_other_information()
				: field.endsWith('value_to_modify')
					? m.simulation_field_value_to_modify()
					: field.endsWith('new_value')
						? m.simulation_field_new_value()
						: formatLabel(field);
		debateTarget.set(null);
		addProofTarget.set(null);
		addRelationTarget.set(null);
		addValueTarget.set({
			factId: activeElement.id as string,
			field,
			name: `${list} — ${formatValue(activeElement.name)}`
		});
	}

	// "Add a proof" on a value of the active element (or of the active relation).
	function startAddProof(valueName: unknown) {
		if (!activeElement) return;
		debateTarget.set(null);
		addValueTarget.set(null);
		addRelationTarget.set(null);
		addProofTarget.set({
			id: activeElement.id as string,
			kind: activeRelation ? 'relation' : 'fact',
			valueName,
			name: `${formatValue(valueName)} — ${formatValue(activeElement.name)}`
		});
	}

	// "Add a relation" on a value of the active element: the next prompt asks the genie for a relation about it.
	// A relation has no relation of its own: the new one is about the first element it connects.
	function startAddRelation(valueName: unknown) {
		if (!activeElement) return;
		debateTarget.set(null);
		addValueTarget.set(null);
		addProofTarget.set(null);
		addRelationTarget.set({
			elementId: (activeRelation ? activeRelation.Element1ID : activeElement.id) as string,
			valueName,
			name: `${formatValue(valueName)} — ${formatValue(activeElement.name)}`
		});
	}

	function formatValue(value: unknown): string {
		if (value === null || value === undefined || value === '') return '—';
		if (typeof value === 'string') return localizedValue(value);
		if (typeof value === 'number' || typeof value === 'boolean') return String(value);
		if (Array.isArray(value)) return localizedValue(value) || '—';
		if (typeof value === 'object') {
			const evolution = parseEvolutionValue(value);
			if (evolution) return formatEvolution(evolution);

			const translated = localizedValue(value);
			if (translated) return translated;

			return Object.entries(value as Record<string, unknown>)
				.map(([key, nestedValue]) => `${formatLabel(key)}: ${formatValue(nestedValue)}`)
				.join('\n');
		}
		return String(value);
	}

	// The entries of a ranking, ordered by their value now (highest first), each with its rank, number and unit.
	function rankingEntries(value: unknown) {
		if (!Array.isArray(value)) return [];
		const t = currentYear();
		return value
			.map((item) => {
				const record = (item ?? {}) as Record<string, unknown>;
				const evolution = parseEvolutionValue(record.value);
				const score = evolution ? buildEvolutionFunction(evolution.evolution)(t) : NaN;
				return {
					name: record.name,
					title: formatValue(record.name),
					description: record.description ? formatValue(record.description) : '',
					score,
					amount: Number.isFinite(score)
						? new Intl.NumberFormat(currentLocale, { maximumFractionDigits: 2 }).format(score)
						: '—',
					unit: evolution?.unit ?? ''
				};
			})
			.sort((a, b) => (Number.isFinite(b.score) ? b.score : -Infinity) - (Number.isFinite(a.score) ? a.score : -Infinity));
	}

	// Text summary of an evolution, for the places where its chart does not fit (lists...)
	function formatEvolution({ evolution, unit }: EvolutionValue): string {
		const mix = evolution
			.map((item) => (evolution.length > 1 ? `${item.weight} × (${item.function})` : item.function) + ` ±${Math.round(item.uncertainty * 1000) / 10}%`)
			.join(' + ');
		return unit ? `${mix} [${unit}]` : mix;
	}

	// The evolution drawn by the chart for a field: an evolution_t value, or the function of an evolution element
	function evolutionOfField(key: string, value: unknown): EvolutionValue | null {
		const nested = parseEvolutionValue(value);
		if (nested) return nested;
		if (key === 'evolution' && activeElement?.type === 'evolution') {
			const evolution = parseEvolutionFunction(value);
			const unit = (activeElement as Record<string, unknown>).unit;
			if (evolution) return { evolution, unit: typeof unit === 'string' ? unit : '' };
		}
		return null;
	}

	// Characters: financial resource in gold, human resource in blue, satisfaction in pink
	const ACCENTS: Record<string, { dark: string; light: string }> = {
		financial_resource: { dark: '#fbbf24', light: '#a16207' },
		human_resource: { dark: '#38bdf8', light: '#0369a1' },
		satisfaction: { dark: '#f472b6', light: '#be185d' }
	};

	function formatLabel(value: string): string {
		const key = value
			.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
			.replace(/[_\s-]+/g, '_')
			.toLowerCase();
		const labels: Record<string, () => string> = {
			description: m.simulation_field_description,
			existence: m.simulation_field_existence,
			originality: m.simulation_field_originality,
			name: m.simulation_field_name,
			type: m.simulation_field_type,
			value: m.simulation_field_value,
			quantity: m.simulation_field_quantity,
			level_of_wear: m.simulation_field_level_of_wear,
			evolution: m.simulation_field_evolution,
			financial_resource: m.simulation_field_financial_resource,
			power: m.simulation_field_power,
			human_resource: m.simulation_field_human_resource,
			unit: m.simulation_field_unit,
			rankings: m.simulation_field_rankings,
			material_resource_used: m.simulation_field_material_resource_used,
			material_resource_necessary: m.simulation_field_material_resource_necessary,
			fund_used: m.simulation_field_fund_used,
			fund_necessary: m.simulation_field_fund_necessary,
			human_mobilized: m.simulation_field_human_mobilized,
			human_necessary: m.simulation_field_human_necessary,
			number_of_units: m.simulation_field_number_of_units,
			financial_value: m.simulation_field_financial_value,
			new_value: m.simulation_field_new_value,
			value_to_modify: m.simulation_field_value_to_modify,
			verification_method: m.simulation_field_verification_method,
			falsifiability_method: m.simulation_field_falsifiability_method,
			source: m.simulation_field_source,
			element1_id: m.simulation_field_element1_id,
			element1_type: m.simulation_field_element1_type,
			element2_id: m.simulation_field_element2_id,
			element2_type: m.simulation_field_element2_type,
			element1_element2_connexions: m.simulation_field_element1_element2_connexions,
			element2_element1_connexions: m.simulation_field_element2_element1_connexions,
			connexions: m.simulation_field_connexions,
			source_property: m.simulation_field_source_property,
			target_property: m.simulation_field_target_property,
			impact: m.simulation_field_impact
		};

		return (
			labels[key]?.() ||
			value.replace(/[_-]+/g, ' ').replace(/^\w/, (character) => character.toUpperCase())
		);
	}

	function isRelationElement(
		element: SimulationElementWithId | null
	): element is SimulationElementWithId & RelationData {
		return element?.type === 'relation' && 'Element1ID' in element && 'Element2ID' in element;
	}

	function formatRelationProperty(property: string, element: SimulationElementWithId | undefined) {
		// Entries with a title: the other data, the capabilities and the willingness
		for (const list of ['other', 'power', 'willing']) {
			const entries = element ? (element as Record<string, unknown>)[list] : undefined;
			if (!Array.isArray(entries)) continue;
			const matchingProperty = entries.find((item) => {
				if (typeof item?.name === 'string') return item.name === property;
				return Object.values(item?.name ?? {}).some((translation) => translation === property);
			});
			if (matchingProperty) return formatValue(matchingProperty.name);
		}

		return formatLabel(property);
	}

	function formatType(value: string): string {
		const types: Record<string, () => string> = {
			fact: m.simulation_type_fact,
			person: m.simulation_type_person,
			organization: m.simulation_type_organization,
			interest_group: m.simulation_type_interest_group,
			character: m.simulation_type_character,
			evolution: m.simulation_type_evolution,
			ranking: m.simulation_type_ranking,
			event: m.simulation_type_event,
			action: m.simulation_type_action,
			material_resource: m.simulation_type_material_resource,
			proof: m.simulation_type_proof,
			relation: m.simulation_type_relation
		};

		return types[value]?.() || formatLabel(value);
	}

	function closeDetails() {
		selectedElement = null;
		hoveredElement = null;
	}

	function handleDetailsOutsideClick(event: MouseEvent) {
		if ((event.target as Element | null)?.closest('.fact-node')) return;
		closeDetails();
	}

	function handleWheel(event: WheelEvent) {
		if ((event.target as Element | null)?.closest('.element-details')) return;

		event.preventDefault();

		const canvas = event.currentTarget as HTMLElement;
		const rect = canvas.getBoundingClientRect();

		const mouseX = event.clientX - rect.left;
		const mouseY = event.clientY - rect.top;

		const worldX = (mouseX - cameraX) / zoom;
		const worldY = (mouseY - cameraY) / zoom;

		const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
		const newZoom = Math.min(10, Math.max(0.1, zoom * zoomFactor));

		cameraX = mouseX - worldX * newZoom;
		cameraY = mouseY - worldY * newZoom;

		zoom = newZoom;
	}

	const currentLocale = $derived.by(() => {
		try {
			return getLocale() as 'fr' | 'en' | 'de' | 'es';
		} catch {
			return 'fr';
		}
	});

	const renderedElements = $derived.by(() => {
		const list = (simulation_data || []).filter(
			(item): item is SimulationElementWithId => typeof item === 'object' && item !== null
		);
		// Proofs are listed in the details panel of the fact they debate, not drawn as nodes.
		const nodes = list.filter((element) => element.type !== 'relation' && element.type !== 'proof');
		const nodePositions = new Map<string, { x: number; y: number }>();
		const renderedNodes = nodes.map((element, index) => {
			const pos = getNodePosition(index, nodes.length);
			const id = element.id;
			if (id) nodePositions.set(id, pos);
			const svgContent = renderSimulationElementSvg(element, {
				x: pos.x,
				y: pos.y,
				radius: 50,
				locale: currentLocale
			});
			return {
				element,
				svgContent,
				index: list.indexOf(element)
			};
		});

		const renderedRelations: {
			element: SimulationElementWithId;
			svgContent: string;
			index: number;
		}[] = [];
		list.forEach((element, index) => {
			if (!('Element1ID' in element) || !('Element2ID' in element)) return;
			const source = nodePositions.get(element.Element1ID);
			const target = nodePositions.get(element.Element2ID);
			if (!source || !target) return;

			renderedRelations.push({
				element,
				svgContent: relation_svg_shape(element, {
					sourceX: source.x,
					sourceY: source.y,
					targetX: target.x,
					targetY: target.y,
					locale: currentLocale
				}),
				index
			});
		});

		return { relations: renderedRelations, nodes: renderedNodes };
	});

	const activeElement = $derived(hoveredElement ?? selectedElement);
	const activeRelation = $derived(isRelationElement(activeElement) ? activeElement : null);
	const relationElement1 = $derived(
		activeRelation
			? simulation_data.find((element) => element.id === activeRelation.Element1ID)
			: undefined
	);
	const relationElement2 = $derived(
		activeRelation
			? simulation_data.find((element) => element.id === activeRelation.Element2ID)
			: undefined
	);
	const activeFields = $derived(
		activeElement
			? Object.entries(activeElement as Record<string, unknown>).filter(
					([key]) =>
						key !== 'id' &&
						key !== 'name' &&
						key !== 'type' &&
						key !== 'other' &&
						!(activeElement.type === 'evolution' && key === 'unit') &&
						!/^element[12]_element[12]_(new_value|value_to_modify)$/.test(key) &&
						!(
							activeRelation &&
							[
								'Element1ID',
								'Element1Type',
								'Element2ID',
								'Element2Type',
								'element1_element2_connexions',
								'element2_element1_connexions'
							].includes(key)
						) &&
						!['existence', 'originality', 'impact'].includes(key)
				)
			: []
	);
	// The lists an element of each type has: shown even when empty, so that a value can be added to them
	const LISTS_OF_TYPE: Record<string, string[]> = {
		person: ['power'],
		organization: ['power'],
		interest_group: ['power', 'willing'],
		material_resource: ['power'],
		ranking: ['rankings']
	};
	const ENTRY_LISTS = ['power', 'willing', 'rankings'];
	const displayedFields = $derived.by((): [string, unknown][] => {
		if (!activeElement) return [];
		const missing = (LISTS_OF_TYPE[activeElement.type ?? ''] ?? []).filter(
			(list) => !activeFields.some(([key]) => key === list)
		);
		return [...activeFields, ...missing.map((list): [string, unknown] => [list, []])];
	});
	const activeParameters = $derived(
		activeElement
			? Object.entries(activeElement as Record<string, unknown>).filter(([key]) =>
					['originality', 'impact'].includes(key)
				)
			: []
	);
	// Probability that the element exists (or that the event occurs), titled after its type
	const existenceTitles: Record<string, () => string> = {
		person: m.simulation_existence_title_person,
		organization: m.simulation_existence_title_organization,
		interest_group: m.simulation_existence_title_interest_group,
		event: m.simulation_occurrence_title_event,
		ranking: m.simulation_occurrence_title_ranking,
		evolution: m.simulation_occurrence_title_evolution,
		action: m.simulation_existence_title_action,
		fact: m.simulation_existence_title_fact,
		material_resource: m.simulation_existence_title_material_resource,
		relation: m.simulation_existence_title_relation
	};
	function existenceTitle(): string {
		const type = (activeElement as Record<string, unknown> | null | undefined)?.type;
		return (typeof type === 'string' ? existenceTitles[type] : undefined)?.() ?? m.simulation_field_existence();
	}
	const activeExistence = $derived(
		activeElement ? parseEvolutionValue((activeElement as Record<string, unknown>).existence) : null
	);
	const activeOther = $derived(
		activeElement && Array.isArray((activeElement as Record<string, unknown>).other)
			? ((activeElement as Record<string, unknown>).other as Array<Record<string, unknown>>)
			: []
	);

	const allProofs = $derived(
		simulation_data.filter(
			(element): element is ProofData & { id: string } =>
				element.type === 'proof' && typeof element.id === 'string'
		)
	);
	function nameKeys(name: unknown): string[] {
		if (typeof name === 'string') return [name.toLowerCase()];
		if (typeof name === 'object' && name !== null) {
			return Object.values(name)
				.filter((item): item is string => typeof item === 'string')
				.map((item) => item.toLowerCase());
		}
		return [];
	}
	function currentYear(): number {
		const year = new Date().getUTCFullYear();
		return year + (Date.now() - Date.UTC(year, 0, 1)) / 31_557_600_000;
	}
	const allRelations = $derived(
		simulation_data.filter((element): element is SimulationElementWithId & RelationData =>
			isRelationElement(element)
		)
	);
	// Value parameters of a value of the active element: its veracity and uncertainty (from its latest proof),
	// its originality (only for the values of an array, such as the other data) and the proofs and relations
	// that influence it.
	function valueInfluence(
		name: unknown,
		inArray: boolean,
		item?: string,
		relationImpact?: number
	): ValueInfluence | null {
		if (!activeElement) return null;
		const id = activeElement.id;
		const own = allProofs.filter((proof) =>
			activeRelation ? proof.relation_id === id : proof.fact_id === id
		);
		const keys = nameKeys(name);
		const matches = (candidate: unknown) => nameKeys(candidate).some((key) => keys.includes(key));
		// For one item of a list, only the entries whose value is this item.
		const itemKey = item?.trim().toLowerCase();
		const isItem = (value: unknown) =>
			itemKey === undefined ||
			(typeof value === 'object' && value !== null
				? nameKeys(value).includes(itemKey)
				: String(value).trim().toLowerCase() === itemKey);

		// The top-level proofs of this value (newest first); for one item of a list, those whose desired content is this item.
		const proofs = own.filter(
			(proof) =>
				!proof.parent_proof_id &&
				matches(proof.value_name) &&
				'value' in proof.desired_value &&
				isItem(proof.desired_value.value)
		);

		// A relation influences the value when it modifies (or adds) it on the side of the active element.
		const relations = activeRelation
			? []
			: allRelations.flatMap((relation) => {
					const other = (otherId: string) => simulation_data.find((element) => element.id === otherId);
					const entries: RelationInfluenceEntry[] = [];
					if (relation.Element2ID === id) {
						const source = other(relation.Element1ID);
						for (const c of relation.element1_element2_value_to_modify ?? []) {
							if (matches(c.Element2Property)) {
								entries.push({ from: formatRelationProperty(c.Element1Property, source), to: formatLabel(c.Element2Property), impact: c.impact, added: false });
							}
						}
						for (const c of relation.element1_element2_new_value ?? []) {
							if (matches(c.Element2Property)) {
								entries.push({ from: formatRelationProperty(c.Element1Property, source), to: c.Element2Property, impact: c.impact, value: c.value, added: true });
							}
						}
					}
					if (relation.Element1ID === id) {
						const source = other(relation.Element2ID);
						for (const c of relation.element2_element1_value_to_modify ?? []) {
							if (matches(c.Element1Property)) {
								entries.push({ from: formatRelationProperty(c.Element2Property, source), to: formatLabel(c.Element1Property), impact: c.impact, added: false });
							}
						}
						for (const c of relation.element2_element1_new_value ?? []) {
							if (matches(c.Element1Property)) {
								entries.push({ from: formatRelationProperty(c.Element2Property, source), to: c.Element1Property, impact: c.impact, value: c.value, added: true });
							}
						}
					}
					const kept = itemKey === undefined ? entries : entries.filter((entry) => entry.added && isItem(entry.value));
					return kept.length > 0 ? [{ relation, entries: kept }] : [];
				});

		// Scores: the weighted average voted by the proofs of the value (the founding proof among them).
		const voted = resolveValue(proofs);
		const score = (key: 'veracity' | 'uncertainty' | 'impact' | 'originality'): number => voted[key] ?? NaN;
		const veracityNow = score('veracity');
		const uncertaintyNow = score('uncertainty');
		const impactNow = score('impact');
		// Only the values of an array and the values of a relation have an originality and an impact.
		const hasValueScores = inArray || relationImpact !== undefined;
		// Originality: the one of the relation for a value of a relation, else the latest desired one.
		let originalityNow = NaN;
		if (hasValueScores) {
			originalityNow =
				relationImpact !== undefined && activeRelation
					? Number(activeRelation.originality)
					: score('originality');
		}

		return {
			veracity: Number.isFinite(veracityNow) ? `${Math.round(veracityNow)}%` : null,
			uncertainty: Number.isFinite(uncertaintyNow) ? `±${Math.round(uncertaintyNow)}%` : null,
			impact:
				relationImpact !== undefined
					? formatValue(relationImpact)
					: hasValueScores && Number.isFinite(impactNow)
						? formatValue(impactNow)
						: null,
			originality: Number.isFinite(originalityNow) ? `${Math.round(originalityNow as number)}%` : null,
			allProofs,
			proofs,
			relations,
			addProof: () => startAddProof(name),
			addRelation: activeRelation ? undefined : () => startAddRelation(name)
		};
	}
	$effect(() => {
		console.log(
			'Rendered simulation elements count:',
			renderedElements.relations.length + renderedElements.nodes.length
		);
	});

	$effect(() => {
		console.log('Simulation data changed:', simulation_data);
	});
</script>

<main
	class="canvas"
	class:panning={isPanning}
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointercancel={handlePointerUp}
	onpointerover={handlePointerOver}
	onpointerout={handlePointerOut}
	onwheel={handleWheel}
>
	<svg class="world-svg" width="100%" height="100%">
		<g transform={`translate(${cameraX}, ${cameraY}) scale(${zoom})`}>
			<!-- Simulation Grid / Axes -->
			<circle class="grid-ring outer" r="600" fill="none" stroke-width="1" />
			<circle class="grid-ring middle" r="400" fill="none" stroke-width="1" />
			<circle class="grid-ring inner" r="200" fill="none" stroke-width="1" />

			<!-- Render relations first so their lines sit behind the connected nodes. -->
			{#each renderedElements.relations as item}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html `<g data-element-index="${item.index}">${item.svgContent}</g>`}
			{/each}
			{#each renderedElements.nodes as item}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html `<g data-element-index="${item.index}">${item.svgContent}</g>`}
			{/each}
		</g>
	</svg>

	{#if activeElement}
		<aside
			class="element-details"
			aria-label="Simulation element details"
			use:clickOutside={handleDetailsOutsideClick}
			onpointerleave={handleDetailsPointerLeave}
		>
			<header class="details-header">
				<div>
					<p class="element-type">{formatType(activeElement.type || 'fact')}</p>
					<h2>{formatValue(activeElement.name)}</h2>
				</div>
				<button
					class="close-details"
					type="button"
					aria-label="Close details"
					onclick={closeDetails}
				>
					×
				</button>
			</header>
			<dl>
				{#each displayedFields as [key, value]}
					{@const influence = valueInfluence(key, false)}
					<div class="detail-row">
						<dt>{formatLabel(key)}</dt>
						{#if evolutionOfField(key, value)}
							{@const evolution = evolutionOfField(key, value)!}
							<dd>
								<EvolutionChart
									evolution={evolution.evolution}
									unit={evolution.unit}
									accent={ACCENTS[key]}
									existence={activeExistence?.evolution}
								/>
							</dd>
						{:else if key === 'rankings' && rankingEntries(value).length > 0}
							<dd>
								<ol class="ranking-list">
									{#each rankingEntries(value) as entry, i}
										{@const entryInfluence = valueInfluence(entry.name, true)}
										<li class="ranking-entry rank-{i < 3 ? i + 1 : 'other'}">
											{#if i < 3}
												<svg class="rank-medal" viewBox="0 0 28 36" aria-label={`#${i + 1}`}>
													<path d="M6 0h6l4 12h-6z" fill="var(--rank-ribbon)" />
													<path d="M22 0h-6l-4 12h6z" fill="var(--rank-ribbon)" fill-opacity="0.75" />
													<circle cx="14" cy="23" r="12" fill="var(--rank-color)" stroke="var(--rank-edge)" stroke-width="2" />
													<circle cx="14" cy="23" r="8.5" fill="none" stroke="var(--rank-edge)" stroke-opacity="0.45" stroke-width="1" />
													<text x="14" y="28" text-anchor="middle" font-size="13" font-weight="800" fill="#1f2937">{i + 1}</text>
												</svg>
											{:else}
												<span class="rank-number">{i + 1}</span>
											{/if}
											<div class="rank-body">
												<strong>{entry.title}</strong>
												{#if entry.description && entry.description !== entry.title}<span class="item-description">{entry.description}</span>{/if}
											</div>
											<span class="rank-score">{entry.amount}{#if entry.unit}<small>{entry.unit}</small>{/if}</span>
											{#if entryInfluence}<div class="rank-parameters"><ValueParameters info={entryInfluence} format={formatValue} /></div>{/if}
										</li>
									{/each}
								</ol>
							</dd>
						{:else if listItems(value)}
							<dd>
								<ul class="value-list">
									{#each listItems(value) ?? [] as item}
										{@const itemInfluence = valueInfluence(item.name, true)}
										<li>
											<strong>{item.title}</strong>
											{#if item.description && item.description !== item.title}<span class="item-description">{item.description}</span>{/if}
											{#if item.parameters.length > 0}
												<dl class="item-parameters">
													{#each item.parameters as parameter}
														<div>
															<dt>{parameter.label}</dt>
															<dd>
																{parameter.amount}
																{#if parameter.unit}<small>{parameter.unit}</small>{/if}
																{#if parameter.uncertainty}<small class="item-uncertainty">{parameter.uncertainty}</small>{/if}
															</dd>
														</div>
													{/each}
												</dl>
											{/if}
											{#if itemInfluence}<ValueParameters info={itemInfluence} format={formatValue} />{/if}
										</li>
									{/each}
								</ul>
							</dd>
						{:else}
							<dd>{formatValue(value)}</dd>
						{/if}
						{#if (key === 'power' || key === 'willing' || key === 'rankings') &&!activeRelation}
							<button type="button" class="add-value" onclick={() => startAddValue(key as ValueListField)}>
								+ {m.value_add()}
							</button>
						{/if}
						{#if influence && !ENTRY_LISTS.includes(key) && (evolutionOfField(key, value) || !listItems(value))}<ValueParameters info={influence} format={formatValue} />{/if}
					</div>
				{/each}
			</dl>
			{#if activeRelation}
				<section class="relation-details">
					{#if true}
						<h3>
							{formatValue(relationElement1?.name) || m.simulation_field_element1_name()}
							{m.simulation_relation_to()}
							{formatValue(relationElement2?.name) || m.simulation_field_element2_name()}
						</h3>
						{#if true}
							<h4>{m.simulation_field_value_to_modify()}</h4>
							{#if activeRelation.element1_element2_value_to_modify.length === 0}<p class="relation-empty">—</p>{/if}
							{#each activeRelation.element1_element2_value_to_modify as connexion}
								<div class="relation-connexion">
									<span>{formatRelationProperty(connexion.Element1Property, relationElement1)}</span>
									<span class="relation-arrow" aria-hidden="true">→</span>
									<span>{formatRelationProperty(connexion.Element2Property, relationElement2)}</span>
									<span class="relation-impact">
										{m.simulation_field_impact()}: {formatValue(connexion.impact)}
									</span>
									{#each [valueInfluence(relationValueName('element1_element2', 'modify', connexion), false, undefined, connexion.impact)] as info}{#if info}<ValueParameters {info} format={formatValue} />{/if}{/each}
								</div>
							{/each}
							<button type="button" class="add-value" onclick={() => startAddValue('element1_element2_value_to_modify')}>
								+ {m.relation_add()}
							</button>
						{/if}
						{#if true}
							<h4>{m.simulation_field_new_value()}</h4>
							{#if activeRelation.element1_element2_new_value.length === 0}<p class="relation-empty">—</p>{/if}
							{#each activeRelation.element1_element2_new_value as added}
								<div class="relation-connexion">
									<span>{formatRelationProperty(added.Element1Property, relationElement1)}</span>
									<span class="relation-arrow" aria-hidden="true">→</span>
									<span class="relation-new-value">
										<span class="relation-new-name">{added.Element2Property}</span>
										<span class="relation-new-content">{formatValue(added.value)}</span>
									</span>
									<span class="relation-impact">
										{m.simulation_field_impact()}: {formatValue(added.impact)}
									</span>
									{#each [valueInfluence(relationValueName('element1_element2', 'add', added), false, undefined, added.impact)] as info}{#if info}<ValueParameters {info} format={formatValue} />{/if}{/each}
								</div>
							{/each}
							<button type="button" class="add-value" onclick={() => startAddValue('element1_element2_new_value')}>
								+ {m.relation_add()}
							</button>
						{/if}
					{/if}
					{#if true}
						<h3>
							{formatValue(relationElement2?.name) || m.simulation_field_element2_name()}
							{m.simulation_relation_to()}
							{formatValue(relationElement1?.name) || m.simulation_field_element1_name()}
						</h3>
						{#if true}
							<h4>{m.simulation_field_value_to_modify()}</h4>
							{#if activeRelation.element2_element1_value_to_modify.length === 0}<p class="relation-empty">—</p>{/if}
							{#each activeRelation.element2_element1_value_to_modify as connexion}
								<div class="relation-connexion">
									<span>{formatRelationProperty(connexion.Element2Property, relationElement2)}</span>
									<span class="relation-arrow" aria-hidden="true">→</span>
									<span>{formatRelationProperty(connexion.Element1Property, relationElement1)}</span>
									<span class="relation-impact">
										{m.simulation_field_impact()}: {formatValue(connexion.impact)}
									</span>
									{#each [valueInfluence(relationValueName('element2_element1', 'modify', connexion), false, undefined, connexion.impact)] as info}{#if info}<ValueParameters {info} format={formatValue} />{/if}{/each}
								</div>
							{/each}
							<button type="button" class="add-value" onclick={() => startAddValue('element2_element1_value_to_modify')}>
								+ {m.relation_add()}
							</button>
						{/if}
						{#if true}
							<h4>{m.simulation_field_new_value()}</h4>
							{#if activeRelation.element2_element1_new_value.length === 0}<p class="relation-empty">—</p>{/if}
							{#each activeRelation.element2_element1_new_value as added}
								<div class="relation-connexion">
									<span>{formatRelationProperty(added.Element2Property, relationElement2)}</span>
									<span class="relation-arrow" aria-hidden="true">→</span>
									<span class="relation-new-value">
										<span class="relation-new-name">{added.Element1Property}</span>
										<span class="relation-new-content">{formatValue(added.value)}</span>
									</span>
									<span class="relation-impact">
										{m.simulation_field_impact()}: {formatValue(added.impact)}
									</span>
									{#each [valueInfluence(relationValueName('element2_element1', 'add', added), false, undefined, added.impact)] as info}{#if info}<ValueParameters {info} format={formatValue} />{/if}{/each}
								</div>
							{/each}
							<button type="button" class="add-value" onclick={() => startAddValue('element2_element1_new_value')}>
								+ {m.relation_add()}
							</button>
						{/if}
					{/if}
				</section>
			{/if}
			{#if !activeRelation}
				<section class="other-details">
					<h3>{m.simulation_section_other_information()}</h3>
					{#if activeOther.length === 0}<p class="relation-empty">—</p>{/if}
					<dl>
						{#each activeOther as item}
							{@const influence = valueInfluence(item.name, true)}
							<div class="other-row">
								<dt>{formatLabel(formatValue(item.name) || 'Other')}</dt>
								<dd>{formatValue(item.value)}</dd>
								{#if influence}<ValueParameters info={influence} format={formatValue} />{/if}
							</div>
						{/each}
					</dl>
					<button type="button" class="add-value" onclick={() => startAddValue('other')}>
						+ {m.value_add()}
					</button>
				</section>
			{/if}
			{#if activeParameters.length > 0 || activeExistence}
				<section class="parameter-details">
					<h3>{m.simulation_section_global_parameters()}</h3>
					{#if activeExistence}
						<div class="distribution-block">
							<h4>{existenceTitle()}</h4>
							<EvolutionChart
								evolution={activeExistence.evolution}
								unit={activeExistence.unit}
								existence={activeExistence.evolution}
								clipToExistence={false}
								bounds={[0, 100]}
							/>
						</div>
						{@const existenceInfluence = valueInfluence('existence', false)}
						{#if existenceInfluence}<ValueParameters info={existenceInfluence} format={formatValue} />{/if}
					{/if}
					<dl>
						{#each activeParameters as [key, value]}
							{@const influence = valueInfluence(key, false)}
							<div class="detail-row">
								<dt>{formatLabel(key)}</dt>
								<dd>{formatValue(value)}</dd>
								{#if influence}<ValueParameters info={influence} format={formatValue} />{/if}
							</div>
						{/each}
					</dl>
				</section>
			{/if}
		</aside>
	{/if}
</main>

<style>
	.canvas {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		touch-action: none;
		cursor: grab;
		background: radial-gradient(circle at center, #0b132b 0%, #050814 100%);
		transition: background 0.25s ease;
	}

	:global(body.light) .canvas {
		background:
			radial-gradient(circle, rgb(100 116 139 / 22%) 1px, transparent 1.5px) 0 0 / 28px 28px,
			radial-gradient(circle at 50% 45%, #ffffff 0%, #f1f5f9 55%, #e0e7f5 100%);
	}

	/* Node labels are white by default: unreadable on the pale light-mode nodes */
	:global(body.light) :global(.fact-node text) {
		fill: #0f172a;
		font-weight: 600;
	}

	:global(body.light) :global(.fact-node) {
		filter: drop-shadow(0 4px 8px rgb(15 23 42 / 18%));
	}

	:global(body.light) :global(.fact-node:hover) {
		filter: drop-shadow(0 0 12px rgba(37, 99, 235, 0.55));
	}

	/* Default grab cursors can vanish on the pale background: use dark, outlined ones */
	:global(body.light) .canvas {
		cursor:
			url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 24 24'><path d='M9 11V5a1.5 1.5 0 0 1 3 0v5m0-1V4a1.5 1.5 0 0 1 3 0v6m0-3a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-3-5a1.5 1.5 0 0 1 2.4-1.8L9 15' fill='%23ffffff' stroke='%230f172a' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>")
				16 16,
			grab;
	}

	.canvas.panning {
		cursor: grabbing;
	}

	:global(body.light) .canvas.panning {
		cursor:
			url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 24 24'><path d='M9 11V8a1.5 1.5 0 0 1 3 0m0 2V7a1.5 1.5 0 0 1 3 0v3m0-1a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-3-5a1.5 1.5 0 0 1 2.4-1.8L9 15' fill='%23ffffff' stroke='%230f172a' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>")
				16 16,
			grabbing;
	}

	.element-details {
		position: absolute;
		top: 20px;
		left: 20px;
		z-index: 5;
		width: min(360px, calc(100% - 40px));
		max-height: calc(100% - 40px);
		overflow: auto;
		overscroll-behavior: contain;
		padding: 18px;
		color: #e6edf3;
		background: rgb(13 20 35 / 94%);
		border: 1px solid rgb(148 163 184 / 30%);
		border-radius: 8px;
		box-shadow: 0 12px 36px rgb(0 0 0 / 35%);
		backdrop-filter: blur(12px);
		cursor: default;
	}

	:global(body.light) .element-details {
		color: #1e293b;
		background: rgb(255 255 255 / 92%);
		border-color: rgb(148 163 184 / 35%);
		border-radius: 14px;
		box-shadow:
			0 1px 2px rgb(15 23 42 / 6%),
			0 16px 40px rgb(37 99 235 / 12%);
	}

	@media (max-width: 600px) {
		.element-details {
			top: 112px;
			left: 12px;
			width: min(360px, calc(100% - 24px));
			max-height: calc(100% - 124px);
		}
	}

	.details-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding-bottom: 12px;
		border-bottom: 1px solid rgb(148 163 184 / 22%);
	}

	:global(body.light) .details-header,
	:global(body.light) .other-details,
	:global(body.light) .parameter-details {
		border-color: rgb(71 85 105 / 18%);
	}

	.element-type {
		margin: 0 0 5px;
		color: #7dd3fc;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
	}

	:global(body.light) .element-type,
	:global(body.light) .other-details h3 {
		color: #087e8b;
	}

	.details-header h2 {
		margin: 0;
		font-size: 18px;
		line-height: 1.3;
		overflow-wrap: anywhere;
	}

	.close-details {
		flex: 0 0 32px;
		width: 32px;
		height: 32px;
		padding: 0;
		color: #cbd5e1;
		background: transparent;
		border: 1px solid rgb(148 163 184 / 35%);
		border-radius: 5px;
		font-size: 22px;
		line-height: 1;
		cursor: pointer;
	}

	.close-details:hover {
		color: white;
		background: rgb(148 163 184 / 16%);
	}

	:global(body.light) .close-details {
		color: #475569;
		border-color: rgb(71 85 105 / 28%);
	}

	:global(body.light) .close-details:hover {
		color: #0f172a;
		background: rgb(71 85 105 / 10%);
	}

	.element-details dl {
		margin: 4px 0 0;
	}

	.detail-row {
		padding: 11px 0;
		border-bottom: 1px solid rgb(148 163 184 / 14%);
	}

	:global(body.light) .detail-row,
	:global(body.light) .other-row {
		border-color: rgb(71 85 105 / 14%);
	}

	.detail-row:last-child {
		border-bottom: 0;
	}

	.detail-row dt {
		margin-bottom: 4px;
		color: #94a3b8;
		font-size: 12px;
		font-weight: 600;
	}

	:global(body.light) .detail-row dt,
	:global(body.light) .other-row dt {
		color: #64748b;
	}

	.detail-row dd {
		margin: 0;
		color: #f1f5f9;
		font-size: 13px;
		line-height: 1.5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.add-value {
		margin-top: 6px;
		padding: 3px 10px;
		color: inherit;
		background: transparent;
		border: 1px dashed currentColor;
		border-radius: 8px;
		font-size: 12px;
		opacity: 0.8;
		cursor: pointer;
	}

	.add-value:hover {
		opacity: 1;
	}

	.item-description {
		display: block;
		opacity: 0.75;
	}

	.item-parameters {
		margin: 4px 0 0;
		display: flex;
		flex-wrap: wrap;
		gap: 4px 16px;
	}

	.item-parameters > div {
		display: flex;
		align-items: baseline;
		gap: 6px;
	}

	.item-parameters dt {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		opacity: 0.6;
	}

	.item-parameters dd {
		margin: 0;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.item-parameters small {
		margin-left: 3px;
		font-weight: 400;
		opacity: 0.7;
	}

	.ranking-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 6px;
	}

	.ranking-entry {
		display: grid;
		grid-template-columns: 30px 1fr auto;
		align-items: center;
		gap: 4px 10px;
		padding: 4px 8px;
	}

	.ranking-entry:not(.rank-other) {
		padding: 6px 8px;
		border-radius: 8px;
		border-left: 3px solid var(--rank-edge);
		background: color-mix(in srgb, var(--rank-color) 18%, transparent);
	}

	.ranking-entry.rank-other {
		border-bottom: 1px solid rgba(148, 163, 184, 0.2);
	}

	.ranking-entry.rank-1 {
		--rank-color: #facc15;
		--rank-edge: #a16207;
		--rank-ribbon: #dc2626;
	}

	.ranking-entry.rank-2 {
		--rank-color: #cbd5e1;
		--rank-edge: #64748b;
		--rank-ribbon: #2563eb;
	}

	.ranking-entry.rank-3 {
		--rank-color: #cd7f32;
		--rank-edge: #7c4a14;
		--rank-ribbon: #16a34a;
	}

	.rank-medal {
		width: 26px;
		height: 34px;
		justify-self: center;
	}

	.rank-number {
		text-align: center;
		opacity: 0.6;
		font-variant-numeric: tabular-nums;
	}

	.rank-body {
		min-width: 0;
	}

	.rank-score {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.rank-score small {
		margin-left: 3px;
		font-weight: 400;
		opacity: 0.7;
	}

	.rank-parameters {
		grid-column: 1 / -1;
	}

	.value-list {
		margin: 0;
		padding-left: 18px;
		display: grid;
		gap: 4px;
	}

	:global(body.light) .detail-row dd,
	:global(body.light) .other-row dd {
		color: #243442;
	}

	.other-details {
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid rgb(148 163 184 / 22%);
	}

	.relation-details {
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid rgb(148 163 184 / 22%);
	}

	.relation-details h3 {
		margin: 24px 0 8px;
		color: #7dd3fc;
		font-size: 16px;
		font-weight: 700;
	}

	.relation-details h3:first-child {
		margin-top: 0;
	}

	:global(body.light) .relation-details {
		border-color: rgb(71 85 105 / 18%);
	}

	:global(body.light) .relation-details h3 {
		color: #087e8b;
	}

	.relation-connexion {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: center;
		gap: 8px;
		padding: 8px 0;
		border-bottom: 1px solid rgb(148 163 184 / 14%);
		font-size: 12px;
		overflow-wrap: anywhere;
	}

	.relation-connexion > :last-child {
		text-align: right;
	}

	.relation-empty {
		margin: 0.25rem 0;
		opacity: 0.6;
	}

	.relation-impact {
		grid-column: 1 / -1;
		color: #94a3b8;
		font-size: 11px;
		white-space: nowrap;
		text-align: center;
	}

	.relation-arrow {
		color: #7dd3fc;
		text-align: center;
	}

	.relation-new-value {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
		padding: 6px 8px;
		border-left: 3px solid #7dd3fc;
		border-radius: 4px;
		background: rgb(125 211 252 / 8%);
		text-align: left;
	}

	.relation-new-name {
		color: #94a3b8;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.relation-new-content {
		color: #f1f5f9;
		font-size: 13px;
		font-weight: 600;
		white-space: pre-wrap;
	}

	:global(body.light) .relation-new-value {
		border-left-color: #087e8b;
		background: rgb(8 126 139 / 8%);
	}

	:global(body.light) .relation-new-name {
		color: #64748b;
	}

	:global(body.light) .relation-new-content {
		color: #0f172a;
	}

	:global(body.light) .relation-connexion {
		border-color: rgb(71 85 105 / 14%);
	}

	:global(body.light) .relation-impact {
		color: #64748b;
	}

	.other-details h3 {
		margin: 0 0 4px;
		color: #7dd3fc;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
	}

	.parameter-details {
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid rgb(148 163 184 / 22%);
	}

	.parameter-details h3 {
		margin: 0 0 4px;
		color: #fbbf24;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
	}

	:global(body.light) .parameter-details h3 {
		color: #a16207;
	}

	.parameter-details dl {
		margin: 0;
	}

	/* Probability distribution: highlighted sub-component of the parameters */
	.distribution-block {
		margin: 8px 0 6px;
		padding: 10px 10px 4px;
		background: rgb(251 191 36 / 6%);
		border: 1px solid rgb(251 191 36 / 28%);
		border-left: 3px solid #fbbf24;
		border-radius: 6px;
	}

	.distribution-block h4 {
		margin: 0 0 8px;
		color: #fcd34d;
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.02em;
	}

	:global(body.light) .distribution-block {
		background: rgb(202 138 4 / 6%);
		border-color: rgb(161 98 7 / 30%);
		border-left-color: #ca8a04;
	}

	:global(body.light) .distribution-block h4 {
		color: #a16207;
	}

	.other-details dl {
		margin: 0;
	}

	.other-row {
		display: grid;
		grid-template-columns: minmax(76px, 0.7fr) minmax(0, 1.5fr);
		gap: 12px;
		padding: 9px 0;
		border-bottom: 1px solid rgb(148 163 184 / 14%);
	}

	.other-row:last-child {
		border-bottom: 0;
	}

	.other-row dt {
		color: #94a3b8;
		font-size: 12px;
		font-weight: 600;
	}

	.other-row dd {
		margin: 0;
		color: #f1f5f9;
		font-size: 13px;
		line-height: 1.5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.world-svg {
		width: 100%;
		height: 100%;
		display: block;
		user-select: none;
	}

	.grid-ring.outer {
		stroke: rgb(255 255 255 / 3%);
	}

	.grid-ring.middle {
		stroke: rgb(255 255 255 / 4%);
	}

	.grid-ring.inner {
		stroke: rgb(255 255 255 / 5%);
	}

	:global(body.light) .grid-ring {
		stroke-dasharray: 4 8;
	}

	:global(body.light) .grid-ring.outer {
		stroke: rgb(37 99 235 / 16%);
	}

	:global(body.light) .grid-ring.middle {
		stroke: rgb(37 99 235 / 22%);
	}

	:global(body.light) .grid-ring.inner {
		stroke: rgb(37 99 235 / 30%);
	}

	:global(.fact-node) {
		cursor: pointer;
		transition: transform 0.2s ease;
	}

	:global(.fact-node:hover) {
		filter: drop-shadow(0 0 14px rgba(56, 189, 248, 0.8));
	}
</style>
