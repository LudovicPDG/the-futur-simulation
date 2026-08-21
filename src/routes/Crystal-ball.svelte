<script lang="ts">
	import { onMount } from 'svelte';

	let {
		agitation_level = 5
	}: {
		agitation_level?: number;
	} = $props();

	onMount(() => {
		const boundary = {
			cx: 485,
			cy: 470,
			r: 300
		};

		const symbolDefs = [
			{ id: 'sym1', x: 405, y: 400, r: 58 },
			{ id: 'sym2', x: 650, y: 447, r: 60 },
			{ id: 'sym3', x: 335, y: 600, r: 58 },
			{ id: 'sym4', x: 605, y: 672, r: 60 },
			{ id: 'sym5', x: 570, y: 270, r: 45 },
			{ id: 'sym6', x: 760, y: 324, r: 40 }
		];

		const symbols = symbolDefs.map((def) => {
			const angle = Math.random() * Math.PI * 2;

			return {
				el: document.getElementById(def.id),
				x0: def.x,
				y0: def.y,
				x: def.x,
				y: def.y,
				vx: Math.cos(angle) * (0.5 + Math.random() * 0.5),
				vy: Math.sin(angle) * (0.5 + Math.random() * 0.5),
				r: def.r
			};
		});

		let last = performance.now();
		let animationFrame: number;

		function tick(now: number) {
			const dt = Math.min(40, now - last);
			last = now;

			const speedScale = 0.15 + agitation_level * 1.6;

			for (const s of symbols) {
				if (!s.el) continue;

				s.x += s.vx * speedScale * (dt / 16.6);
				s.y += s.vy * speedScale * (dt / 16.6);

				const dx = s.x - boundary.cx;
				const dy = s.y - boundary.cy;

				const dist = Math.sqrt(dx * dx + dy * dy);
				const limit = boundary.r - s.r;

				if (dist > limit) {
					const nx = dx / dist;
					const ny = dy / dist;

					const dot = s.vx * nx + s.vy * ny;

					s.vx -= 2 * dot * nx;
					s.vy -= 2 * dot * ny;

					s.x = boundary.cx + nx * limit;
					s.y = boundary.cy + ny * limit;
				}

				s.el.setAttribute(
					'transform',
					`translate(${(s.x - s.x0).toFixed(1)} ${(s.y - s.y0).toFixed(1)})`
				);
			}

			animationFrame = requestAnimationFrame(tick);
		}

		animationFrame = requestAnimationFrame(tick);

		return () => {
			cancelAnimationFrame(animationFrame);
		};
	});
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width="1024"
	height="1024"
	viewBox="0 0 1024 1024"
	fill="none"
	id="mainSvg"
>
	<defs>
		<!-- ========================= GLASS ========================== -->
		<radialGradient id="glass" cx="45%" cy="38%" r="65%">
			<stop offset="0%" stop-color="#ffffff" stop-opacity=".94" />
			<stop offset="45%" stop-color="#f5ffff" stop-opacity=".58" />
			<stop offset="75%" stop-color="#d9f4f5" stop-opacity=".34" />
			<stop offset="100%" stop-color="#a9dce8" stop-opacity=".5" />
		</radialGradient>

		<linearGradient id="glassEdge" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0%" stop-color="#82aebe" />
			<stop offset="35%" stop-color="#c8eef1" />
			<stop offset="60%" stop-color="#9bcbd7" />
			<stop offset="100%" stop-color="#668fa8" />
		</linearGradient>

		<radialGradient id="rainbowGlow" cx="50%" cy="50%" r="65%">
			<stop offset="0%" stop-color="#ffffff" stop-opacity="0" />
			<stop offset="55%" stop-color="#bdf5ef" stop-opacity=".20" />
			<stop offset="70%" stop-color="#a9e7ff" stop-opacity=".17" />
			<stop offset="82%" stop-color="#dcbcff" stop-opacity=".16" />
			<stop offset="92%" stop-color="#ffc8e6" stop-opacity=".15" />
			<stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
		</radialGradient>

		<!-- ========================= WOOD ========================== -->
		<linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0%" stop-color="#d18a3d" />
			<stop offset="28%" stop-color="#b96d2e" />
			<stop offset="65%" stop-color="#91491f" />
			<stop offset="100%" stop-color="#69351e" />
		</linearGradient>

		<linearGradient id="woodTop" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0%" stop-color="#e1a052" />
			<stop offset="45%" stop-color="#bd722f" />
			<stop offset="100%" stop-color="#81421f" />
		</linearGradient>

		<linearGradient id="woodHighlight" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0%" stop-color="#f0b766" stop-opacity=".65" />
			<stop offset="100%" stop-color="#a95725" stop-opacity="0" />
		</linearGradient>

		<!-- ========================= SYMBOLS ========================== -->
		<linearGradient id="symbolBlue" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0%" stop-color="#8ee2e5" />
			<stop offset="50%" stop-color="#5ab4d0" />
			<stop offset="100%" stop-color="#4b91b8" />
		</linearGradient>

		<linearGradient id="symbolLightBlue" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0%" stop-color="#8dd9e9" />
			<stop offset="100%" stop-color="#4b91c1" />
		</linearGradient>

		<radialGradient id="starBlue" cx="50%" cy="50%" r="60%">
			<stop offset="0%" stop-color="#ffffff" />
			<stop offset="35%" stop-color="#8fe3ff" />
			<stop offset="100%" stop-color="#3fa9d9" />
		</radialGradient>

		<!-- ========================= EFFECTS ========================== -->
		<filter id="softGlow" x="-100%" y="-100%" width="300%" height="300%">
			<feGaussianBlur stdDeviation="14" />
		</filter>

		<filter id="symbolGlow" x="-100%" y="-100%" width="300%" height="300%">
			<feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
			<feMerge>
				<feMergeNode in="blur" />
				<feMergeNode in="SourceGraphic" />
			</feMerge>
		</filter>

		<filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
			<feGaussianBlur stdDeviation="15" />
		</filter>

		<filter id="contactShadow" x="-50%" y="-200%" width="200%" height="400%">
			<feGaussianBlur stdDeviation="8" />
		</filter>

		<filter id="starGlow" x="-200%" y="-200%" width="500%" height="500%">
			<feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="blur" />
			<feMerge>
				<feMergeNode in="blur" />
				<feMergeNode in="SourceGraphic" />
			</feMerge>
		</filter>

		<!-- ========================= BALL CLIP ========================== -->
		<clipPath id="ballClip">
			<circle cx="512" cy="490" r="363" />
		</clipPath>

		<!-- ========================= STAR SHAPES ========================== -->
		<g id="smallStar">
			<path d="M0-6 L1.4-1.4 L6 0 L1.4 1.4 L0 6 L-1.4 1.4 L-6 0 L-1.4-1.4 Z" fill="#a7cddd" />
		</g>

		<g id="blueStar">
			<path
				d="M0-6 L1.4-1.4 L6 0 L1.4 1.4 L0 6 L-1.4 1.4 L-6 0 L-1.4-1.4 Z"
				fill="url(#starBlue)"
			/>
		</g>
	</defs>

	<!-- ========================================= BACKGROUND ========================================== -->
	<rect width="1024" height="1024" />
	<ellipse
		cx="512"
		cy="485"
		rx="440"
		ry="420"
		fill="#dff8ff"
		opacity=".20"
		filter="url(#softGlow)"
	/>

	<!-- ========================================= OUTER PARTICLES ========================================== -->
	<g opacity=".7">
		<use href="#smallStar" transform="translate(95 430) scale(.8)" />
		<use href="#smallStar" transform="translate(133 330) scale(.55)" />
		<use href="#smallStar" transform="translate(172 242) scale(.7)" />
		<use href="#smallStar" transform="translate(264 158) scale(.7)" />
		<use href="#smallStar" transform="translate(332 125) scale(.5)" />
		<use href="#smallStar" transform="translate(590 113) scale(.65)" />
		<use href="#smallStar" transform="translate(703 158) scale(.65)" />
		<use href="#smallStar" transform="translate(869 231) scale(.8)" />
		<use href="#smallStar" transform="translate(937 375) scale(.55)" />
		<use href="#smallStar" transform="translate(909 603) scale(.7)" />
		<use href="#smallStar" transform="translate(852 745) scale(.5)" />
		<use href="#smallStar" transform="translate(177 728) scale(.55)" />
		<use href="#smallStar" transform="translate(105 620) scale(.65)" />
	</g>

	<g opacity=".45" fill="#8fbad0">
		<circle cx="204" cy="223" r="7" />
		<circle cx="287" cy="204" r="5" />
		<circle cx="777" cy="189" r="6" />
		<circle cx="835" cy="291" r="4" />
		<circle cx="918" cy="480" r="7" />
		<circle cx="127" cy="497" r="5" />
		<circle cx="172" cy="672" r="4" />
		<circle cx="825" cy="707" r="5" />
	</g>

	<!-- ========================================= GROUND SHADOW ========================================== -->
	<ellipse cx="512" cy="949" rx="300" ry="30" fill="#63432f" opacity=".22" filter="url(#shadow)" />

	<!-- ========================================= CRYSTAL BALL ========================================== -->
	<g transform="translate(0 30)">
		<circle cx="512" cy="490" r="377" fill="#bdebf4" opacity=".20" filter="url(#softGlow)" />
		<circle
			cx="512"
			cy="490"
			r="363"
			fill="url(#glass)"
			stroke="url(#glassEdge)"
			stroke-width="8"
		/>
		<circle cx="512" cy="490" r="350" fill="url(#rainbowGlow)" />

		<!-- ========================================= INSIDE BALL DECOR ========================================== -->
		<g clip-path="url(#ballClip)">
			<ellipse
				cx="400"
				cy="360"
				rx="180"
				ry="125"
				fill="#dfffff"
				opacity=".16"
				filter="url(#softGlow)"
			/>
			<ellipse
				cx="690"
				cy="515"
				rx="190"
				ry="145"
				fill="#eadbff"
				opacity=".13"
				filter="url(#softGlow)"
			/>
			<ellipse
				cx="360"
				cy="650"
				rx="160"
				ry="110"
				fill="#ffd9ee"
				opacity=".12"
				filter="url(#softGlow)"
			/>

			<g opacity=".72">
				<g fill="#a8cbd1">
					<circle cx="415" cy="395" r="2" /><circle cx="428" cy="410" r="3" /><circle
						cx="442"
						cy="402"
						r="2"
					/>
					<circle cx="458" cy="420" r="2" /><circle cx="397" cy="420" r="2" /><circle
						cx="470"
						cy="395"
						r="2"
					/>
					<circle cx="405" cy="443" r="2" /><circle cx="449" cy="445" r="2" />
				</g>
				<g fill="#d4c2a2">
					<circle cx="685" cy="425" r="2" /><circle cx="703" cy="437" r="3" /><circle
						cx="720"
						cy="420"
						r="2"
					/>
					<circle cx="740" cy="447" r="2" /><circle cx="765" cy="430" r="3" /><circle
						cx="780"
						cy="462"
						r="2"
					/>
					<circle cx="695" cy="470" r="2" /><circle cx="735" cy="480" r="2" />
				</g>
				<g fill="#b7cbd8">
					<circle cx="340" cy="590" r="2" /><circle cx="360" cy="600" r="3" /><circle
						cx="380"
						cy="575"
						r="2"
					/>
					<circle cx="405" cy="605" r="2" /><circle cx="420" cy="580" r="3" /><circle
						cx="385"
						cy="630"
						r="2"
					/>
					<circle cx="350" cy="625" r="2" />
				</g>
				<g fill="#c4d1d8">
					<circle cx="610" cy="665" r="2" /><circle cx="630" cy="650" r="3" /><circle
						cx="650"
						cy="675"
						r="2"
					/>
					<circle cx="675" cy="660" r="2" /><circle cx="700" cy="685" r="3" /><circle
						cx="720"
						cy="670"
						r="2"
					/>
					<circle cx="690" cy="710" r="2" />
				</g>
			</g>

			<g opacity=".8">
				<use href="#smallStar" transform="translate(300 300) scale(.65)" />
				<use href="#smallStar" transform="translate(535 235) scale(.5)" />
				<use href="#smallStar" transform="translate(840 430) scale(.55)" />
				<use href="#smallStar" transform="translate(525 580) scale(.45)" />
				<use href="#smallStar" transform="translate(270 530) scale(.5)" />
				<use href="#smallStar" transform="translate(570 770) scale(.5)" />
			</g>

			<path
				d="M265 320 C310 245 380 205 425 195 C390 235 355 290 342 350 C325 420 327 485 350 540 C305 500 270 425 265 320Z"
				fill="#ffffff"
				opacity=".20"
			/>
			<path
				d="M290 275 C320 240 350 220 380 208 C350 245 325 280 310 325"
				stroke="#ffffff"
				stroke-width="25"
				stroke-linecap="round"
				opacity=".22"
			/>
			<ellipse
				cx="350"
				cy="290"
				rx="75"
				ry="125"
				transform="rotate(25 350 290)"
				fill="#ffffff"
				opacity=".10"
			/>
		</g>

		<path
			d="M210 480 C210 275 345 150 510 150 C655 150 775 235 810 370"
			stroke="#d9f5fa"
			stroke-width="12"
			stroke-linecap="round"
			opacity=".48"
		/>
		<path
			d="M230 370 C260 270 340 205 425 180"
			stroke="#ffffff"
			stroke-width="8"
			stroke-linecap="round"
			opacity=".7"
		/>
	</g>

	<!-- ========================================= SOCKET CONTACT ========================================== -->
	<ellipse cx="512" cy="805" rx="286" ry="62" fill="#61341f" opacity=".82" />
	<ellipse
		cx="512"
		cy="802"
		rx="265"
		ry="36"
		fill="#3d2a22"
		opacity=".48"
		filter="url(#contactShadow)"
	/>
	<ellipse
		cx="512"
		cy="798"
		rx="280"
		ry="58"
		fill="url(#woodTop)"
		stroke="#6b381f"
		stroke-width="6"
	/>
	<ellipse cx="512" cy="790" rx="257" ry="42" fill="#87bdc7" opacity=".26" />
	<ellipse cx="512" cy="792" rx="245" ry="31" fill="#493027" opacity=".42" />

	<!-- ========================================= WOODEN BASE ========================================== -->
	<path
		d="
      M235 802
      C250 830 278 845 275 870
      C272 892 238 902 230 922
      C222 944 260 963 320 969
      C430 981 594 981 705 971
      C770 966 812 948 802 920
      C794 898 765 891 760 870
      C756 850 780 828 790 802
      C725 835 630 850 512 850
      C394 850 300 835 235 802Z
    "
		fill="url(#wood)"
		stroke="#68351e"
		stroke-width="7"
		stroke-linejoin="round"
	/>

	<path
		d="
      M260 837
      C320 862 410 872 512 872
      C615 872 710 862 765 837
      C742 858 720 873 700 880
      C620 901 405 901 320 880
      C296 873 276 857 260 837Z
    "
		fill="url(#woodHighlight)"
		opacity=".42"
	/>

	<ellipse cx="512" cy="820" rx="245" ry="27" fill="#f0b566" opacity=".18" />
	<ellipse cx="512" cy="947" rx="235" ry="16" fill="#4e291b" opacity=".25" />

	<!-- ========================================= ANIMATED MATH SYMBOLS ========================================== -->
	<g transform="translate(0 30)" clip-path="url(#ballClip)">
		<g id="sym1"
			><text
				x="405"
				y="435"
				font-family="Georgia, 'Times New Roman', serif"
				font-size="125"
				fill="url(#symbolBlue)"
				filter="url(#symbolGlow)">√</text
			></g
		>
		<g id="sym2"
			><text
				x="650"
				y="485"
				font-family="Georgia, 'Times New Roman', serif"
				font-size="132"
				fill="url(#symbolBlue)"
				filter="url(#symbolGlow)">π</text
			></g
		>
		<g id="sym3"
			><text
				x="335"
				y="635"
				font-family="Georgia, 'Times New Roman', serif"
				font-size="125"
				fill="url(#symbolLightBlue)"
				filter="url(#symbolGlow)">Σ</text
			></g
		>
		<g id="sym4"
			><text
				x="605"
				y="710"
				font-family="Georgia, 'Times New Roman', serif"
				font-size="132"
				fill="url(#symbolLightBlue)"
				filter="url(#symbolGlow)">∫</text
			></g
		>
		<g id="sym5"
			><text
				x="570"
				y="300"
				font-family="Arial, sans-serif"
				font-size="105"
				font-weight="300"
				fill="url(#symbolBlue)"
				filter="url(#symbolGlow)"
				text-anchor="middle">+</text
			></g
		>
		<g id="sym6"
			><text
				x="760"
				y="350"
				font-family="Arial, sans-serif"
				font-size="92"
				font-weight="300"
				fill="url(#symbolLightBlue)"
				filter="url(#symbolGlow)"
				text-anchor="middle">×</text
			></g
		>

		<!-- petites étoiles bleues à l'intérieur de la boule -->
		<g id="starsInside"></g>
	</g>

	<!-- petites étoiles bleues autour de la boule -->
	<g id="starsOutside"></g>

	<!-- quelques poussières dorées conservées au pied du socle -->
	<g opacity=".8" fill="#d9c39d">
		<circle cx="240" cy="785" r="3" />
		<circle cx="258" cy="802" r="2" />
		<circle cx="278" cy="817" r="3" />
		<circle cx="310" cy="830" r="2" />
		<circle cx="345" cy="846" r="3" />
		<circle cx="375" cy="832" r="2" />
		<circle cx="720" cy="838" r="3" />
		<circle cx="750" cy="850" r="2" />
		<circle cx="785" cy="823" r="3" />
	</g>

	<style>
		svg {
			width: 100%;
			height: auto;
			display: block;
		}
	</style>
</svg>
