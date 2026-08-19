<footer>
	<p>&copy; 2023 My App. All rights reserved.</p>
</footer>

<style>
	footer {
		width: 100%;
		height: 10vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: black;
		color: white;
		box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.15);
	}

	:global(body.dark) footer {
		background-color: rgba(255, 255, 255, 0.15);
	}

	p {
		margin: 0;
		font-size: 0.9rem;
	}
</style>
