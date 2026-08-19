<script lang="ts">
	import { onMount } from 'svelte';
	import videoDesktop from '$lib/assets/video.webm';
	import videoPhone from '$lib/assets/video-phone.webm';
	import { navbarVisible } from '$lib/stores/navbar';
	import { reveal } from '$lib/actions/reveal';

	let video = $state(videoDesktop);

	let displayedText1 = $state('');

	import * as m from '$lib/paraglide/messages';
	let displayedText2 = $state('');

	let currentSession = 0;
	let activeIntervals: any[] = [];
	let activeTimeouts: any[] = [];

	function clearAllTimers() {
		activeIntervals.forEach(clearInterval);
		activeTimeouts.forEach(clearTimeout);
		activeIntervals = [];
		activeTimeouts = [];
	}

	async function textAnimation() {
		const start = Date.now();
		const session = currentSession;

		await writeText(m.home_hero_question(), 1, 3000, session);
		if (session !== currentSession) return;

		await waitUntil(start, 5000, session);
		if (session !== currentSession) return;
		await writeText(m.home_hero_techno(), 2, 3000, session);
		if (session !== currentSession) return;

		await waitUntil(start, 8250, session);
		if (session !== currentSession) return;
		await deleteText(m.home_hero_techno(), 2, 1000, session);
		if (session !== currentSession) return;

		changeText2Color('red');
		await writeText(m.home_hero_dystopian(), 2, 3000, session);
		if (session !== currentSession) return;

		await waitUntil(start, 12500, session);
		if (session !== currentSession) return;
		await deleteText(m.home_hero_dystopian(), 2, 1000, session);
		if (session !== currentSession) return;

		changeText2Color('brown');

		await writeText(m.home_hero_energy(), 2, 3000, session);
		if (session !== currentSession) return;

		await waitUntil(start, 16500, session);
		if (session !== currentSession) return;
		await deleteText(m.home_hero_energy(), 2, 1000, session);
		if (session !== currentSession) return;

		changeText2Color('#88E788');

		await writeText(m.home_hero_natural(), 2, 3000, session);
		if (session !== currentSession) return;

		await waitUntil(start, 20000, session);
		if (session !== currentSession) return;
		await deleteText(m.home_hero_natural(), 2, 1000, session);
		if (session !== currentSession) return;
		await deleteText(m.home_hero_question(), 1, 1000, session);
		if (session !== currentSession) return;

		await waitUntil(start, 22500, session);
		if (session !== currentSession) return;
		await writeText(m.home_hero_change(), 1, 3000, session);
	}

	function resetText() {
		currentSession++;
		clearAllTimers();
		displayedText1 = '';
		displayedText2 = '';
		text2Color = '#90D5FF';
	}

	function waitUntil(startTime: number, targetTime: number, session: number) {
		return new Promise<void>((resolve) => {
			if (session !== currentSession) {
				resolve();
				return;
			}
			const elapsed = Date.now() - startTime;
			const remaining = targetTime - elapsed;

			if (remaining <= 0) {
				resolve();
			} else {
				const timeout = setTimeout(() => {
					resolve();
				}, remaining);
				activeTimeouts.push(timeout);
			}
		});
	}

	function writeText(text: string, textnumber: number, duration: number, session: number) {
		return new Promise<void>((resolve) => {
			if (session !== currentSession) {
				resolve();
				return;
			}
			let index = 0;

			const speed = duration / text.length < 80 ? duration / text.length : 80;

			const interval = setInterval(() => {
				if (session !== currentSession) {
					clearInterval(interval);
					resolve();
					return;
				}

				if (index < text.length) {
					if (textnumber === 1) displayedText1 += text[index];
					if (textnumber === 2) displayedText2 += text[index];

					index++;
				} else {
					clearInterval(interval);
					resolve();
				}
			}, speed);
			activeIntervals.push(interval);
		});
	}

	function deleteText(textToDelete: string, textNumber: number, duration: number, session: number) {
		return new Promise<void>((resolve) => {
			if (session !== currentSession) {
				resolve();
				return;
			}
			let currentText = textNumber === 1 ? displayedText1 : displayedText2;

			const index = currentText.lastIndexOf(textToDelete);

			if (index === -1) {
				resolve();
				return;
			}

			let position = currentText.length;

			const interval = setInterval(() => {
				if (session !== currentSession) {
					clearInterval(interval);
					resolve();
					return;
				}

				if (position > index) {
					position--;

					const newText = currentText.slice(0, position);

					if (textNumber === 1) {
						displayedText1 = newText;
					} else {
						displayedText2 = newText;
					}
				} else {
					clearInterval(interval);
					resolve();
				}
			}, duration / textToDelete.length);
			activeIntervals.push(interval);
		});
	}

	let text2Color = $state('#90D5FF');

	function changeText2Color(color: string) {
		text2Color = color;
	}

	let videoElement: HTMLVideoElement;

	onMount(() => {
		const mediaQuery = window.matchMedia('(orientation: portrait)');

		function updateScreen() {
			video = mediaQuery.matches ? videoPhone : videoDesktop;

			resetText();
			textAnimation();
		}

		updateScreen();

		mediaQuery.addEventListener('change', updateScreen);

		const trigger = document.querySelector('#navbar-trigger');
		let observer: IntersectionObserver | undefined;

		if (trigger) {
			observer = new IntersectionObserver(
				(entries) => {
					navbarVisible.set(!entries[0].isIntersecting);
				},
				{ threshold: 0 }
			);
			observer.observe(trigger);
		}

		return () => {
			mediaQuery.removeEventListener('change', updateScreen);
			observer?.disconnect();
			clearAllTimers();
		};
	});

	let videoObserver: IntersectionObserver;

	onMount(() => {
		videoObserver = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					// La vidéo redevient visible
					videoElement.currentTime = 0;
					videoElement.play();

					resetText();
					textAnimation();
				} else {
					// La vidéo n'est plus visible
					videoElement.pause();
					videoElement.currentTime = 0;

					resetText();
				}
			},
			{
				threshold: 0.1 // 10 % de la vidéo visible
			}
		);

		videoObserver.observe(videoElement);

		return () => {
			videoObserver.disconnect();
		};
	});

	function smoothScrollTo(targetY: number, duration: number) {
		const startY = window.scrollY;
		const distance = targetY - startY;
		const startTime = performance.now();

		function animate(currentTime: number) {
			const elapsed = currentTime - startTime;
			const progress = Math.min(elapsed / duration, 1);

			// Courbe d'accélération/décélération
			const ease =
				progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

			window.scrollTo(0, startY + distance * ease);

			if (progress < 1) {
				requestAnimationFrame(animate);
			}
		}

		requestAnimationFrame(animate);
	}

	let articleElement: HTMLElement;

	function handleVideoEnded() {
		setTimeout(() => {
			smoothScrollTo(articleElement.offsetTop - 10, 2000); // le -10 est pour éviter que le header ne cache le début de l'article
		}, 6000);
	}
	$effect(() => {
		if (videoElement) {
			videoElement.load();
			videoElement.play();
		}
	});
</script>

<div id="carroussel">
	<video bind:this={videoElement} src={video} autoplay muted playsinline onended={handleVideoEnded}
	></video>

	<div class="overlay">
		<div class="typing">
			<p class="text-video" class:active={displayedText2 === ''}>
				{displayedText1}
			</p>

			<p
				class="text-video"
				id="text-video-2"
				class:active={displayedText2 !== ''}
				style="--text-color: {text2Color}"
			>
				{displayedText2}
			</p>
		</div>
	</div>
</div>
<div id="navbar-trigger"></div>

<article bind:this={articleElement}>
	<header class="reveal {false ? 'visible' : ''}" use:reveal>
		<h1>{m.home_title()}</h1>
	</header>

	<section class="reveal {false ? 'visible' : ''}" use:reveal>
		<h2>{m.home_intro_title()}</h2>

		<p>
			{m.home_intro_1()}
		</p>

		<p>
			{m.home_intro_2()}
		</p>

		<p>
			{m.home_intro_3()}
		</p>

		<p>
			{m.home_intro_4()}
		</p>
	</section>

	<section class="reveal" use:reveal>
		<h2>{m.home_prediction_title()}</h2>

		<p>
			{m.home_prediction_1()}
		</p>

		<p>
			{m.home_prediction_2()}
		</p>

		<ul>
			<li>{m.home_prediction_list_1()}</li>
			<li>{m.home_prediction_list_2()}</li>
			<li>{m.home_prediction_list_3()}</li>
			<li>{m.home_prediction_list_4()}</li>
			<li>{m.home_prediction_list_5()}</li>
			<li>{m.home_prediction_list_6()}</li>
		</ul>

		<p>
			{m.home_prediction_3()}
		</p>
	</section>

	<section class="reveal" use:reveal>
		<h2>{m.home_collective_title()}</h2>

		<p>
			{m.home_collective_1()}
		</p>

		<p>
			{m.home_collective_2()}
		</p>

		<p>
			{m.home_collective_3()}
		</p>

		<p>
			{m.home_collective_4()}
		</p>
	</section>

	<section class="reveal" use:reveal>
		<h2>{m.home_action_title()}</h2>

		<p>
			{m.home_action_1()}
		</p>

		<p>
			{m.home_action_2()}
		</p>

		<p>
			{m.home_action_3()}
		</p>

		<p>{m.home_action_intro()}</p>

		<ul>
			<li>{m.home_action_list_1()}</li>
			<li>{m.home_action_list_2()}</li>
			<li>{m.home_action_list_3()}</li>
			<li>{m.home_action_list_4()}</li>
			<li>{m.home_action_list_5()}</li>
		</ul>

		<p>
			{m.home_action_4()}
		</p>

		<p>
			{m.home_action_5()}
		</p>
	</section>

	<section class="reveal" use:reveal>
		<h2>{m.home_decision_title()}</h2>

		<p>
			{m.home_decision_1()}
		</p>

		<ul>
			<li>{m.home_decision_list_1()}</li>
			<li>{m.home_decision_list_2()}</li>
			<li>{m.home_decision_list_3()}</li>
			<li>{m.home_decision_list_4()}</li>
			<li>{m.home_decision_list_5()}</li>
			<li>{m.home_decision_list_6()}</li>
			<li>{m.home_decision_list_7()}</li>
		</ul>

		<p>
			{m.home_decision_2()}
		</p>

		<p>
			{m.home_decision_3()}
		</p>
	</section>
</article>

<a class="reveal" id="simulation" href="/simulation" use:reveal>
	<video autoplay muted loop playsinline>
		<source src={video} type="video/webm" />
	</video>

	<span>{m.home_simulation_link()}</span>
</a>
<a class="reveal" id="detail" href="/detail" use:reveal>{m.home_more_link()}</a>

<style>
	#carroussel {
		position: relative;
		width: 100%;
		height: 100vh;
		overflow: hidden;
	}

	article {
		padding: 5vh 5vw 0;
		width: 100%;
	}

	section {
		margin: 5vh 0;
	}

	video {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.overlay {
		position: absolute;
		left: 0;
		top: 0;
		padding: 0 10%;
		box-sizing: border-box;
		height: 100%;
		width: 100%;
		display: flex;
		justify-content: center;
		align-items: center;
		background: rgba(0, 0, 0, 0.2);
	}

	.typing {
		color: white;
		font-size: 3rem;
		font-weight: bold;
	}

	.active::after {
		content: '';
		display: inline-block;
		width: 3px;
		height: 1em;
		margin-left: 5px;
		background: white;
		vertical-align: middle;
		animation: blink 0.8s infinite;
	}

	.text-video {
		display: block;
		text-align: center;
		width: 100%;
		font-size: 3rem;
		text-shadow: 0 4px 10px rgba(0, 0, 0, 0.8);
	}

	#text-video-2 {
		color: var(--text-color);
		transition: color 1s ease;
	}

	article {
		width: 100%;
	}

	header h1 {
		display: inline;
		width: auto;
	}

	header {
		display: block;
		text-align: center;
	}

	h1,
	h2 {
		display: inline;
		background-image: linear-gradient(var(--futuristic-blue), var(--futuristic-blue));
		background-repeat: no-repeat;
		background-position: 0 100%;
		background-size: 0% 6px;
		transition: background-size 700ms ease;
	}

	.reveal.visible h1,
	.reveal.visible h2 {
		background-size: 100% 6px;
	}

	.reveal {
		opacity: 0;
		transform: translateY(24px);
		transition:
			opacity 600ms ease,
			transform 600ms ease;
		will-change: opacity, transform;
	}

	.reveal.visible {
		opacity: 1;
		transform: translateY(0);
	}

	ul {
		list-style: none;
		font-weight: bolder;
	}

	li::before {
		content: '>';
		position: absolute;
		left: 15px;
		color: var(--futuristic-blue);
		font-weight: bold;
	}

	a {
		display: flex;
		position: relative;
		width: calc(100% - 10vw);
		height: 15vh;
		margin: 2vh 5vw;
		border-radius: 2rem;

		font-size: 1.5rem;
		font-weight: bold;
		justify-content: center;
		align-items: center;

		text-decoration: none;
		color: white;

		overflow: hidden;
		transition:
			transform 300ms ease,
			box-shadow 300ms ease;
	}

	/* effet lumineux qui traverse le bouton */
	a::before {
		content: '';
		position: absolute;
		top: 0;
		left: -100%;
		width: 100%;
		height: 100%;

		background: linear-gradient(120deg, transparent, rgba(255, 255, 255, 0.5), transparent);

		transition: left 500ms ease;
		z-index: 3;
		pointer-events: none;
	}

	a:hover::before {
		left: 100%;
	}

	a:hover {
		transform: translateY(-5px);
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
	}

	a:active {
		transform: translateY(0);
	}

	#simulation {
		position: relative;
		background: none;
		overflow: hidden;

		box-shadow: 0 0 20px rgba(37, 99, 235, 0.5);
	}

	#simulation video {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		z-index: 0;
	}

	/* Keep text above video */
	#simulation span {
		position: relative;
		z-index: 4;
	}

	/* Blue/purple futuristic overlay */
	#simulation::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(135deg, rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5));
		z-index: 1;
	}

	/* Bouton détail */
	#detail {
		background: linear-gradient(135deg, #8b4513, #d2691e);

		box-shadow: 0 0 20px rgba(139, 69, 19, 0.5);
	}

	@keyframes blink {
		50% {
			opacity: 0;
		}
	}
</style>
