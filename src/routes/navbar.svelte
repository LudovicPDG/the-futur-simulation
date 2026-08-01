<script lang="ts">
	import { navbarVisible } from '$lib/stores/navbar';
</script>

<header class:visible={$navbarVisible}>
	<nav>
		<a href="/">The Future Simulation</a>
	</nav>
</header>

<style>
	header {
		position: fixed;
		top: 0;
		z-index: 1000;
		width: 100%;
		height: 10vh;
		display: flex;
		align-items: center;
		background-color: var(--futuristic-blue);
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
		transform: translateY(-100%);
		transition: transform 0.3s ease;
	}

	header.visible {
		transform: translateY(0);
	}

	nav {
		width: 100%;
		padding: 0 1.5rem;
	}

	a {
		color: white;
		text-decoration: none;
		font-weight: 600;
		font-size: 1.1rem;
	}
</style>
