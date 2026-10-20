<script lang="ts">
	const RANGE = 100; // années de part et d'autre du centre
	const CABIN_HEIGHT = 46;

	// La piste occupe toute la hauteur disponible
	let trackHeight = $state(220);
	const travel = $derived(Math.max(1, trackHeight - CABIN_HEIGHT));

	let { date = $bindable(new Date()) }: { date?: Date } = $props();

	// Date autour de laquelle le slider est centré, et décalage en années (-100..+100)
	let center = $state(new Date());
	let offset = $state(0);
	let dragging = $state(false);

	const current = $derived.by(() => {
		const d = new Date(center);
		d.setFullYear(center.getFullYear() + offset);
		return d;
	});

	$effect(() => {
		date = current;
	});

	// +100 en haut, -100 en bas
	const cabinTop = $derived(((RANGE - offset) / (2 * RANGE)) * travel);

	const pad = (n: number) => String(n).padStart(2, '0');

	// Éclairs de téléportation et disparition de la cabine
	let gone = $state(false);
	let flashes = $state<{ id: number; top: number }[]>([]);
	let flashId = 0;
	let reappearTimer: ReturnType<typeof setTimeout> | undefined;

	function spawnFlash(top: number) {
		const id = ++flashId;
		flashes = [...flashes, { id, top }];
		setTimeout(() => (flashes = flashes.filter((f) => f.id !== id)), 700);
	}

	function teleport(atTop: boolean) {
		clearTimeout(reappearTimer);
		spawnFlash(atTop ? 0 : travel);
		gone = true;
		reappearTimer = setTimeout(() => {
			spawnFlash(travel / 2);
			gone = false;
		}, 280);
	}

	// Quand on atteint une limite, la cabine revient au milieu et on peut continuer
	function setOffset(next: number) {
		if (Math.abs(next) >= RANGE) {
			teleport(next > 0);
			const d = new Date(center);
			d.setFullYear(center.getFullYear() + Math.sign(next) * RANGE);
			center = d;
			offset = 0;
			return true;
		}
		offset = next;
		return false;
	}

	let dragStartY = 0;
	let dragStartOffset = 0;

	function onPointerDown(e: PointerEvent) {
		dragging = true;
		dragStartY = e.clientY;
		dragStartOffset = offset;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		e.preventDefault();
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		const years = Math.round(((dragStartY - e.clientY) / travel) * 2 * RANGE);
		if (setOffset(dragStartOffset + years)) {
			dragStartY = e.clientY;
			dragStartOffset = 0;
		}
	}

	function onPointerUp() {
		dragging = false;
	}

	function onTrackClick(e: MouseEvent) {
		if ((e.target as HTMLElement).closest('.cabin')) return;
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const ratio = (e.clientY - rect.top - CABIN_HEIGHT / 2) / travel;
		const clamped = Math.min(1, Math.max(0, ratio));
		setOffset(Math.round(RANGE - clamped * 2 * RANGE));
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		const step = Math.max(1, Math.round(Math.abs(e.deltaY) / 50));
		setOffset(offset + (e.deltaY < 0 ? step : -step));
	}

	function onKeydown(e: KeyboardEvent) {
		const big = e.shiftKey ? 10 : 1;
		if (e.key === 'ArrowUp') setOffset(offset + big);
		else if (e.key === 'ArrowDown') setOffset(offset - big);
		else if (e.key === 'Home') setOffset(RANGE - 1);
		else if (e.key === 'End') setOffset(-RANGE + 1);
		else return;
		e.preventDefault();
	}

	// Saisie textuelle : la date saisie devient le nouveau centre du slider
	function commitField(e: Event, field: 'year' | 'month' | 'day' | 'hour' | 'minute') {
		const input = e.currentTarget as HTMLInputElement;
		const value = Number(input.value);
		if (input.value.trim() === '' || !Number.isFinite(value)) {
			input.value = fieldValue(field);
			return;
		}
		const d = new Date(current);
		const y = field === 'year' ? value : d.getFullYear();
		const mo = field === 'month' ? value - 1 : d.getMonth();
		const da = field === 'day' ? value : d.getDate();
		const h = field === 'hour' ? value : d.getHours();
		const mi = field === 'minute' ? value : d.getMinutes();
		d.setFullYear(y, mo, da);
		d.setHours(h, mi, 0, 0);
		center = d;
		offset = 0;
		input.value = fieldValue(field);
	}

	function fieldValue(field: 'year' | 'month' | 'day' | 'hour' | 'minute') {
		switch (field) {
			case 'year':
				return String(current.getFullYear());
			case 'month':
				return pad(current.getMonth() + 1);
			case 'day':
				return pad(current.getDate());
			case 'hour':
				return pad(current.getHours());
			case 'minute':
				return pad(current.getMinutes());
		}
	}

	const fields = [
		{ key: 'day', label: 'Jour', width: 2 },
		{ key: 'month', label: 'Mois', width: 2 },
		{ key: 'year', label: 'Année', width: 5 },
		{ key: 'hour', label: 'Heure', width: 2 },
		{ key: 'minute', label: 'Minute', width: 2 }
	] as const;
</script>

<div class="time-machine">
	<div class="date-display" aria-label="Date de la simulation">
		<div class="date-row">
			{#each fields.slice(0, 3) as f (f.key)}
				<input
					class="field"
					style={`width: ${f.width + 1.2}ch`}
					type="text"
					inputmode="numeric"
					aria-label={f.label}
					value={fieldValue(f.key)}
					onchange={(e) => commitField(e, f.key)}
					onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
				/>
				{#if f.key !== 'year'}<span class="sep">/</span>{/if}
			{/each}
		</div>
		<div class="date-row">
			{#each fields.slice(3) as f (f.key)}
				<input
					class="field"
					style={`width: ${f.width + 1.2}ch`}
					type="text"
					inputmode="numeric"
					aria-label={f.label}
					value={fieldValue(f.key)}
					onchange={(e) => commitField(e, f.key)}
					onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
				/>
				{#if f.key === 'hour'}<span class="sep">:</span>{/if}
			{/each}
		</div>
	</div>

	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="track"
		bind:clientHeight={trackHeight}
		role="slider"
		tabindex="0"
		aria-orientation="vertical"
		aria-label="Voyage dans le temps"
		aria-valuemin={-RANGE}
		aria-valuemax={RANGE}
		aria-valuenow={offset}
		aria-valuetext={`${offset >= 0 ? '+' : ''}${offset} ans`}
		onclick={onTrackClick}
		onwheel={onWheel}
		onkeydown={onKeydown}
	>
		<span class="rail"></span>
		<span class="tick top">+100</span>
		<span class="tick mid">0</span>
		<span class="tick bottom">−100</span>

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		{#each flashes as f (f.id)}
			<span class="flash" style={`top: ${f.top + CABIN_HEIGHT / 2}px`}></span>
		{/each}

		<div
			class="cabin"
			class:dragging
			class:gone
			style={`top: ${cabinTop}px; height: ${CABIN_HEIGHT}px`}
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
		>
			<svg viewBox="0 0 40 66" width="30" height={CABIN_HEIGHT} aria-hidden="true">
				<!-- lampe -->
				<rect x="18" y="0" width="4" height="3" fill="#dbeafe" />
				<rect x="17" y="3" width="6" height="3" rx="1" fill="#fef9c3" stroke="#0b2a5b" stroke-width=".6" />
				<!-- toit -->
				<rect x="6" y="6" width="28" height="4" fill="#0f3b8c" stroke="#0b2a5b" stroke-width=".6" />
				<rect x="4" y="10" width="32" height="4" fill="#1246ad" stroke="#0b2a5b" stroke-width=".6" />
				<!-- panneau -->
				<rect x="6" y="14" width="28" height="7" fill="#0b2a5b" />
				<rect x="8" y="16" width="24" height="3" fill="#f8fafc" />
				<!-- corps -->
				<rect x="6" y="21" width="28" height="42" fill="#1246ad" stroke="#0b2a5b" stroke-width=".8" />
				<!-- fenêtres -->
				<g fill="#e0f2fe" stroke="#0b2a5b" stroke-width=".5">
					<rect x="8" y="24" width="7" height="5" />
					<rect x="16.5" y="24" width="7" height="5" />
					<rect x="25" y="24" width="7" height="5" />
					<rect x="8" y="30" width="7" height="5" />
					<rect x="16.5" y="30" width="7" height="5" />
					<rect x="25" y="30" width="7" height="5" />
				</g>
				<!-- portes -->
				<rect x="8" y="37" width="11.5" height="24" fill="#0f3b8c" stroke="#0b2a5b" stroke-width=".5" />
				<rect x="20.5" y="37" width="11.5" height="24" fill="#0f3b8c" stroke="#0b2a5b" stroke-width=".5" />
				<circle cx="18" cy="50" r="1" fill="#fde68a" />
				<circle cx="22" cy="50" r="1" fill="#fde68a" />
				<!-- base -->
				<rect x="4" y="63" width="32" height="3" fill="#0b2a5b" />
			</svg>
		</div>
	</div>
</div>

<style>
	.time-machine {
		position: absolute;
		top: calc(10vh + 24px + 120px);
		bottom: 110px; /* s'arrête au-dessus de la barre de prompt */
		right: 24px;
		z-index: 4; /* sous le panneau d'infos (z-index 5) pour ne pas masquer son bouton fermer */

		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		width: 100px;
	}

	.date-display {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 6px 8px;

		background: rgb(255 255 255 / 92%);
		border: 1px solid #e2e8f0;
		border-radius: 12px;
		box-shadow: 0 4px 14px rgb(0 0 0 / 8%);
		font-variant-numeric: tabular-nums;
	}

	.date-row {
		display: flex;
		align-items: center;
		gap: 1px;
	}

	.sep {
		color: #94a3b8;
		font-weight: 600;
	}

	.field {
		box-sizing: content-box;
		padding: 2px 0;
		color: #0f172a;
		background: transparent;
		border: none;
		border-bottom: 1px dashed transparent;
		outline: none;
		text-align: center;
		font-family: inherit;
		font-size: 13px;
		font-weight: 600;
	}

	.field:hover {
		border-bottom-color: #94a3b8;
	}

	.field:focus {
		border-bottom: 1px solid #2563eb;
	}

	.track {
		position: relative;
		flex: 1;
		min-height: 0;
		width: 100%;
		cursor: pointer;
		outline: none;
		touch-action: none;
	}

	.track:focus-visible .rail {
		box-shadow: 0 0 0 3px rgb(37 99 235 / 35%);
	}

	.rail {
		position: absolute;
		left: 50%;
		top: 0;
		bottom: 0;
		width: 6px;
		transform: translateX(-50%);
		background: linear-gradient(to bottom, #93c5fd, #cbd5e1 50%, #1e3a8a);
		border-radius: 3px;
	}

	.tick {
		position: absolute;
		right: 0;
		font-size: 10px;
		color: #64748b;
		pointer-events: none;
	}

	.tick.top {
		top: 0;
	}

	.tick.mid {
		top: 50%;
		transform: translateY(-50%);
	}

	.tick.bottom {
		bottom: 0;
	}

	.cabin {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		cursor: grab;
		filter: drop-shadow(0 2px 3px rgb(0 0 0 / 35%));
		transition:
			top 0.15s ease,
			opacity 0.2s ease,
			filter 0.2s ease,
			transform 0.2s ease;
		touch-action: none;
	}

	.cabin.gone {
		opacity: 0;
		filter: brightness(2) drop-shadow(0 0 4px #fff);
		transform: translateX(-50%) scale(0.3, 1.4);
		transition:
			opacity 0.15s ease-in,
			filter 0.15s ease-in,
			transform 0.15s ease-in;
	}

	.flash {
		position: absolute;
		left: 50%;
		width: 64px;
		height: 64px;
		margin: -32px 0 0 -32px;
		border-radius: 50%;
		background: radial-gradient(circle, rgb(255 255 255 / 55%) 0%, rgb(191 230 255 / 30%) 35%, rgb(147 197 253 / 0%) 70%);
		pointer-events: none;
		animation: flash 0.6s ease-out forwards;
	}

	@keyframes flash {
		0% {
			opacity: 0;
			transform: scale(0.1);
		}
		20% {
			opacity: 0.7;
			transform: scale(1);
		}
		100% {
			opacity: 0;
			transform: scale(1.6);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.flash {
			animation-duration: 0.01s;
		}
	}

	.cabin.dragging:not(.gone) {
		cursor: grabbing;
		transition: opacity 0.2s ease, filter 0.2s ease, transform 0.2s ease;
	}

	.cabin svg {
		display: block;
	}
</style>
