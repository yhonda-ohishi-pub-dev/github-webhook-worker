/**
 * Example Client Worker
 *
 * This worker demonstrates how to use Service Bindings to access
 * the github-webhook-worker's repository metadata API.
 */

interface Env {
	WEBHOOK_WORKER: Fetcher;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// Example: Get all repositories
		if (url.pathname === '/list-repos') {
			const response = await env.WEBHOOK_WORKER.fetch(
				new Request('https://fake-host/repos', {
					headers: {
						'X-Service-Binding': 'true'
					}
				})
			);

			return response;
		}

		// Example: Get specific repository
		if (url.pathname.startsWith('/get-repo/')) {
			const repo = url.pathname.substring(10); // Remove '/get-repo/'

			const response = await env.WEBHOOK_WORKER.fetch(
				new Request(`https://fake-host/repo/${encodeURIComponent(repo)}`, {
					headers: {
						'X-Service-Binding': 'true'
					}
				})
			);

			return response;
		}

		// Example: Update repository metadata
		if (url.pathname === '/update-repo' && request.method === 'POST') {
			const body = await request.json();

			const response = await env.WEBHOOK_WORKER.fetch(
				new Request('https://fake-host/repo', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-Service-Binding': 'true'
					},
					body: JSON.stringify(body)
				})
			);

			return response;
		}

		// Example: Delete repository metadata
		if (url.pathname.startsWith('/delete-repo/')) {
			const repo = url.pathname.substring(13); // Remove '/delete-repo/'

			const response = await env.WEBHOOK_WORKER.fetch(
				new Request(`https://fake-host/repo/${encodeURIComponent(repo)}`, {
					method: 'DELETE',
					headers: {
						'X-Service-Binding': 'true'
					}
				})
			);

			return response;
		}

		// Example: Complete workflow
		if (url.pathname === '/example-workflow') {
			const results: any = {};

			// 1. List all repositories
			const listResponse = await env.WEBHOOK_WORKER.fetch(
				new Request('https://fake-host/repos', {
					headers: { 'X-Service-Binding': 'true' }
				})
			);
			results.repositories = await listResponse.json();

			// 2. Update a repository
			const updateResponse = await env.WEBHOOK_WORKER.fetch(
				new Request('https://fake-host/repo', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-Service-Binding': 'true'
					},
					body: JSON.stringify({
						repo: 'example/test-repo',
						version: 'v2.0.0',
						grpcEndpoint: 'grpc://api.example.com:50051'
					})
				})
			);
			results.updated = await updateResponse.json();

			// 3. Get the updated repository
			const getResponse = await env.WEBHOOK_WORKER.fetch(
				new Request('https://fake-host/repo/example/test-repo', {
					headers: { 'X-Service-Binding': 'true' }
				})
			);
			results.retrieved = await getResponse.json();

			return new Response(JSON.stringify(results, null, 2), {
				headers: { 'Content-Type': 'application/json' }
			});
		}

		return new Response('Example Client Worker\n\nAvailable endpoints:\n' +
			'- GET /list-repos\n' +
			'- GET /get-repo/{owner/repo}\n' +
			'- POST /update-repo (with JSON body)\n' +
			'- DELETE /delete-repo/{owner/repo}\n' +
			'- GET /example-workflow\n', {
			headers: { 'Content-Type': 'text/plain' }
		});
	},
};
