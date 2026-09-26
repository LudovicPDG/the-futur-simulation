import { z } from 'zod';
import { FactSchema, type SvgShapeOptions } from '../fact';

export const EventSchema = FactSchema.extend({
	type: z.string().default('event').describe('The type of event')
}).describe('An event in the simulation');

export type EventData = z.infer<typeof EventSchema>;

/**
 * Event SVG shape:
 * Horizontal rectangle with 2:3 aspect ratio (e.g., width = 120, height = 80),
 * rounded corners, middle color, rotating decorative stroke, optional symbol above title.
 */
export function event_svg_shape(
	event: EventData,
	options: SvgShapeOptions = {},
	symbolSvg: string = ''
): string {
	const { x = 0, y = 0, color = '#eab308', locale = 'fr' } = options;
	// 2:3 aspect ratio horizontal rectangle: width: 120, height: 80
	const width = 120;
	const height = 80;
	const halfW = width / 2;
	const halfH = height / 2;
	const rx = 14;

	let label = 'Event';

	if (event.name && typeof event.name === 'object') {
		label = event.name[locale] || event.name.fr || event.name.en || 'Event';
	} else if (typeof event.name === 'string') {
		label = event.name;
	}

	const shortLabel = label.length > 18 ? label.slice(0, 16) + '…' : label;

	const gradId = `event-grad-${Math.floor(x)}-${Math.floor(y)}-${Math.floor(Math.random() * 1000)}`;

	return `
		<g
			class="fact-node event-node"
			transform="translate(${x}, ${y})"
			data-type="${event.type || 'event'}"
		>
			<defs>
				<radialGradient
					id="${gradId}"
					cx="50%"
					cy="50%"
					r="50%"
				>
					<stop offset="0%" stop-color="${color}" stop-opacity="0.6" />
					<stop offset="100%" stop-color="${color}" stop-opacity="0.15" />
				</radialGradient>
			</defs>

			<!-- Rotating decorative stroke around rounded rect -->
			<rect
				x="${-halfW - 6}"
				y="${-halfH - 6}"
				width="${width + 12}"
				height="${height + 12}"
				rx="${rx + 4}"
				ry="${rx + 4}"
				fill="none"
				stroke="${color}"
				stroke-opacity="0.3"
				stroke-width="1.5"
				stroke-dasharray="6 4"
			>
				<animate
					attributeName="stroke-dashoffset"
					from="0"
					to="-20"
					dur="3s"
					repeatCount="indefinite"
				/>
			</rect>

			<!-- Main rounded rectangle (2:3 aspect ratio) -->
			<rect
				x="${-halfW}"
				y="${-halfH}"
				width="${width}"
				height="${height}"
				rx="${rx}"
				ry="${rx}"
				fill="url(#${gradId})"
				stroke="${color}"
				stroke-width="2.5"
			/>

			<!-- Middle color inside shape -->
			<rect
				x="${-halfW * 0.75}"
				y="${-halfH * 0.75}"
				width="${width * 0.75}"
				height="${height * 0.75}"
				rx="${rx * 0.7}"
				ry="${rx * 0.7}"
				fill="${color}"
				fill-opacity="0.2"
			/>

			${symbolSvg}

			<text
				text-anchor="middle"
				dy="${symbolSvg ? '16' : '4'}"
				fill="#f8fafc"
				font-size="12"
				font-weight="600"
				font-family="system-ui, -apple-system, sans-serif"
				pointer-events="none"
			>
				${shortLabel}
			</text>
		</g>
	`.trim();
}

export function svg_shape(event: EventData, options: SvgShapeOptions = {}): string {
	return event_svg_shape(event, options);
}
