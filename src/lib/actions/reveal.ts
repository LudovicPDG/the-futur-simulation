export function reveal(node: HTMLElement, options = { threshold: 0.2 }) {
	console.log('CREATE', node);

	const observer = new IntersectionObserver(([entry]) => {
		if (entry.isIntersecting) {
			node.classList.add('visible');
			observer.disconnect();
		}
	}, options);

	observer.observe(node);

	return {
		destroy() {
			console.log('DESTROY', node);
			observer.disconnect();
		}
	};
}
