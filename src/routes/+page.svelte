<script lang="ts">
	import { onMount } from 'svelte';
	import videoDesktop from '$lib/assets/video.webm';
	import videoPhone from '$lib/assets/video-phone.webm';
	import { navbarVisible } from '$lib/stores/navbar';
	import { reveal } from '$lib/actions/reveal';

	let video = $state(videoDesktop);

	let displayedText1 = $state('');

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

		await writeText('Comment sera le futur ?', 1, 3000, session);
		if (session !== currentSession) return;

		await waitUntil(start, 5000, session);
		if (session !== currentSession) return;
		await writeText('Un futur techno-utopique ?', 2, 3000, session);
		if (session !== currentSession) return;

		await waitUntil(start, 8250, session);
		if (session !== currentSession) return;
		await deleteText('techno-utopique ?', 2, 1000, session);
		if (session !== currentSession) return;

		changeText2Color('red');
		await writeText('dystopique ?', 2, 3000, session);
		if (session !== currentSession) return;

		await waitUntil(start, 12500, session);
		if (session !== currentSession) return;
		await deleteText('dystopique ?', 2, 1000, session);
		if (session !== currentSession) return;

		changeText2Color('brown');

		await writeText('sans energie ?', 2, 3000, session);
		if (session !== currentSession) return;

		await waitUntil(start, 16500, session);
		if (session !== currentSession) return;
		await deleteText('sans energie ?', 2, 1000, session);
		if (session !== currentSession) return;

		changeText2Color('#88E788');

		await writeText('naturelle ?', 2, 3000, session);
		if (session !== currentSession) return;

		await waitUntil(start, 20000, session);
		if (session !== currentSession) return;
		await deleteText('Un futur naturelle ?', 2, 1000, session);
		if (session !== currentSession) return;
		await deleteText('Comment sera le futur ?', 1, 1000, session);
		if (session !== currentSession) return;

		await waitUntil(start, 22500, session);
		if (session !== currentSession) return;
		await writeText('Et comment le modifier ?', 1, 3000, session);
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
				{
					threshold: 0
				}
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
		<h1>The Future Simulation: Une simulation du futur</h1>
	</header>

	<section class="reveal {false ? 'visible' : ''}" use:reveal>
		<h2>Comment savoir à quoi ressemblera le futur&nbsp;?</h2>

		<p>
			Depuis toujours, l'être humain cherche à comprendre et à anticiper l'avenir. Les premières
			civilisations tentaient déjà de prévoir les récoltes, les migrations animales pour la chasse,
			les conditions météorologiques ou les périodes favorables aux voyages. Ces prédictions
			reposaient principalement sur l'observation, l'expérience et des méthodes empiriques.
		</p>

		<p>
			Aujourd'hui, grâce aux progrès scientifiques et technologiques, nous sommes capables de
			prédire certains événements plusieurs semaines, voire plusieurs années à l'avance, dans des
			domaines tels que la météorologie, la climatologie, l'épidémiologie ou encore l'économie.
		</p>

		<p>
			Malgré ces progrès, la plupart des modèles actuels reposent sur des simulations statiques,
			souvent limitées à un domaine précis. Il est donc difficile d'obtenir une vision globale du
			futur, et les hypothèses sur lesquelles reposent ces simulations restent souvent difficiles à
			remettre en question, aussi bien par la communauté scientifique que par le grand public. De
			plus, la plupart de ces simulations proposent peu, voire aucun, moyen d'agir sur la
			trajectoire du futur qu'elles décrivent.
		</p>

		<p>
			<strong>The Future Simulation</strong> vise à dépasser ces limites en développant une simulation
			globale et dynamique du futur, ouverte à tous, dans laquelle chacun peut proposer des modifications.
		</p>
	</section>

	<section class="reveal" use:reveal>
		<h2>Une nouvelle approche de la prédiction du futur</h2>

		<p>
			Les progrès récents de l'intelligence artificielle lui permettent aujourd'hui d'analyser des
			informations complexes, de comprendre les relations entre différents éléments et de produire
			des estimations à partir de nombreux paramètres.
		</p>

		<p>
			Ces capacités peuvent être mobilisées pour établir des prédictions dans des domaines variés,
			par exemple&nbsp;:
		</p>

		<ul>
			<li>l'évolution des ressources naturelles</li>
			<li>l'évolution des marchés boursiers</li>
			<li>prédire la date de sortie d'une technologie</li>
			<li>prédire les résultats d'une élection</li>
			<li>prédire les résultats d'une compétition sportive</li>
			<li>et tout autre type de prédiction</li>
		</ul>

		<p>
			Contrairement à la plupart des simulations classiques,
			<strong>The Future Simulation</strong> ne considère pas les événements comme indépendants les uns
			des autres. Les différentes prédictions sont reliées entre elles&nbsp;: lorsqu'un événement évolue,
			les conséquences potentielles sur les autres événements sont automatiquement recalculées, afin de
			maintenir une représentation cohérente des futurs possibles.
		</p>
	</section>

	<section class="reveal" use:reveal>
		<h2>Une intelligence collective pour améliorer les prédictions</h2>

		<p>
			La fiabilité d'une prédiction dépend fortement de la qualité des informations et des
			raisonnements qui l'accompagnent.
		</p>

		<p>
			C'est pourquoi <strong>The Future Simulation</strong> permet aux utilisateurs de contribuer directement
			à l'amélioration du modèle. Chaque personne peut proposer des arguments, des sources, des preuves
			ou remettre en question une hypothèse formulée par l'intelligence artificielle.
		</p>

		<p>
			L'IA analyse ensuite ces nouveaux éléments afin d'ajuster ses prédictions, de modifier les
			relations entre les événements ou de revoir la probabilité de certains scénarios.
		</p>

		<p>
			Cette approche vise à créer une forme d'intelligence collective, où les connaissances humaines
			et les capacités d'analyse de l'intelligence artificielle se complètent afin de construire des
			projections plus pertinentes.
		</p>
	</section>

	<section class="reveal" use:reveal>
		<h2>Comment connaître l'impact d'une action&nbsp;?</h2>

		<p>
			Le futur n'est pas seulement quelque chose que nous observons&nbsp;: il est aussi façonné par
			nos décisions.
		</p>

		<p>
			Il est pourtant souvent difficile d'évaluer, avant sa mise en œuvre, les conséquences réelles
			d'une action ainsi que sa crédibilité. Une décision politique, une innovation technologique ou
			un changement économique peut avoir des effets directs et indirects sur de nombreux acteurs.
		</p>

		<p>
			<strong>The Future Simulation</strong> propose donc également un système permettant de simuler les
			conséquences potentielles d'une action.
		</p>

		<p>Ce système peut analyser</p>

		<ul>
			<li>la crédibilité d'une action</li>
			<li>ses effets possibles sur différentes prédictions</li>
			<li>les acteurs susceptibles d'être impactés</li>
			<li>les réactions qu'elle pourrait provoquer</li>
			<li>ses interactions avec d'autres actions existantes</li>
		</ul>

		<p>
			Une décision concernant l'énergie, par exemple, pourrait avoir des répercussions sur les prix,
			les entreprises, l'emploi, l'environnement ou encore le comportement des citoyens.
		</p>

		<p>
			Comme pour les prédictions, les utilisateurs peuvent proposer des actions, fournir des
			informations complémentaires et remettre en question les résultats produits par l'intelligence
			artificielle.
		</p>
	</section>

	<section class="reveal" use:reveal>
		<h2>Un outil d'aide à la décision pour construire le futur</h2>

		<p>
			Si <strong>The Future Simulation</strong> parvient à produire des projections fiables, elle pourrait
			devenir un outil d'aide à la décision pour de nombreux acteurs&nbsp;:
		</p>

		<ul>
			<li>les institutions publiques</li>
			<li>les collectivités</li>
			<li>les entreprises</li>
			<li>les associations</li>
			<li>les chercheurs</li>
			<li>les citoyens;</li>
			<li>et tout autre acteur de la vie publique</li>
		</ul>

		<p>
			Il convient toutefois de considérer les prédictions et les résultats du modèle avec prudence.
			Toute simulation du futur repose sur des probabilités&nbsp;: rien n'est donc certain. De plus,
			l'intelligence artificielle peut parfois commettre des erreurs manifestement absurdes du point
			de vue humain. Si cela se produit, n'hésitez pas à reformuler votre requête ou à apporter des
			sources complémentaires à l'appui de vos propos. Si le problème persiste, contactez les
			membres du site.
		</p>

		<p>
			<strong>The Future Simulation</strong> n'est pas un projet lucratif et a pour seul objectif de permettre
			à chaque acteur de la vie publique de prendre de meilleures décisions afin de contribuer à rendre
			le monde meilleur.
		</p>
	</section>
</article>

<a class="reveal" id="simulation" href="/simulation" use:reveal>
	<video autoplay muted loop playsinline>
		<source src={video} type="video/webm" />
	</video>

	<span>Visualiser le futur</span>
</a>
<a class="reveal" id="detail" href="/detail" use:reveal>En savoir plus</a>

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
