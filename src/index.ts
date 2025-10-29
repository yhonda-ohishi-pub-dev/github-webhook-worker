/**
 * GitHub Webhook Worker
 *
 * This worker handles GitHub webhook verification using Durable Objects.
 * Each webhook is verified against the GitHub signature and processed.
 */

import { WebhookVerifier } from './webhook-verifier';
import { RepoMetadataManager } from './repo-metadata';
import { isServiceBinding, forbiddenResponse } from './auth';

export { WebhookVerifier };

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);

		// Health check endpoint
		if (url.pathname === '/health' && request.method === 'GET') {
			return new Response(JSON.stringify({
				status: 'ok',
				service: 'GitHub Webhook Worker',
				version: '1.0.0'
			}), {
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Webhook verification endpoint
		if (url.pathname === '/webhook' && request.method === 'POST') {
			try {
				// Get or create a Durable Object instance
				const deliveryId = request.headers.get('X-GitHub-Delivery') || 'default';
				const id = env.WEBHOOK_VERIFIER.idFromName(deliveryId);
				const stub = env.WEBHOOK_VERIFIER.get(id);

				// Clone the request and modify the URL to forward to Durable Object
				const verifyUrl = new URL(request.url);
				verifyUrl.pathname = '/verify';

				// Create a new request with the same body and headers
				const verifyRequest = new Request(verifyUrl.toString(), request);

				return await stub.fetch(verifyRequest);

			} catch (error) {
				console.error('Error routing to Durable Object:', error);
				return new Response(JSON.stringify({
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error'
				}), {
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				});
			}
		}

		// Webhook history endpoint
		if (url.pathname === '/history' && request.method === 'GET') {
			try {
				// Get the default Durable Object instance
				const id = env.WEBHOOK_VERIFIER.idFromName('default');
				const stub = env.WEBHOOK_VERIFIER.get(id);

				// Forward the request to the Durable Object
				const historyUrl = new URL(request.url);
				historyUrl.pathname = '/history';

				const historyRequest = new Request(historyUrl.toString(), {
					method: 'GET'
				});

				return await stub.fetch(historyRequest);

			} catch (error) {
				console.error('Error getting history:', error);
				return new Response(JSON.stringify({
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error'
				}), {
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				});
			}
		}

		// Repository metadata endpoints
		const repoManager = new RepoMetadataManager(env.REPO_METADATA);

		// Save repository metadata (requires Service Binding)
		if (url.pathname === '/repo' && request.method === 'POST') {
			// Check if request is from Service Binding
			if (!isServiceBinding(request)) {
				return forbiddenResponse();
			}

			try {
				const body = await request.json() as { repo: string; version: string; grpcEndpoint: string };

				if (!body.repo || !body.version || !body.grpcEndpoint) {
					return new Response(JSON.stringify({
						success: false,
						error: 'Missing required fields: repo, version, grpcEndpoint'
					}), {
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					});
				}

				const metadata = await repoManager.saveRepoMetadata(
					body.repo,
					body.version,
					body.grpcEndpoint
				);

				return new Response(JSON.stringify({
					success: true,
					data: metadata
				}), {
					headers: { 'Content-Type': 'application/json' }
				});

			} catch (error) {
				console.error('Error saving repo metadata:', error);
				return new Response(JSON.stringify({
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error'
				}), {
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				});
			}
		}

		// Get repository metadata (requires Service Binding)
		if (url.pathname.startsWith('/repo/') && request.method === 'GET') {
			// Check if request is from Service Binding
			if (!isServiceBinding(request)) {
				return forbiddenResponse();
			}

			try {
				const repo = decodeURIComponent(url.pathname.substring(6));

				if (!repo) {
					return new Response(JSON.stringify({
						success: false,
						error: 'Repository name is required'
					}), {
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					});
				}

				const metadata = await repoManager.getRepoMetadata(repo);

				if (!metadata) {
					return new Response(JSON.stringify({
						success: false,
						error: 'Repository not found'
					}), {
						status: 404,
						headers: { 'Content-Type': 'application/json' }
					});
				}

				return new Response(JSON.stringify({
					success: true,
					data: metadata
				}), {
					headers: { 'Content-Type': 'application/json' }
				});

			} catch (error) {
				console.error('Error getting repo metadata:', error);
				return new Response(JSON.stringify({
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error'
				}), {
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				});
			}
		}

		// Update repository metadata by URL (requires Service Binding)
		if (url.pathname.startsWith('/repo/') && request.method === 'PATCH') {
			// Check if request is from Service Binding
			if (!isServiceBinding(request)) {
				return forbiddenResponse();
			}

			try {
				const repo = decodeURIComponent(url.pathname.substring(6));

				if (!repo) {
					return new Response(JSON.stringify({
						success: false,
						error: 'Repository name is required'
					}), {
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					});
				}

				// Get existing metadata
				const existing = await repoManager.getRepoMetadata(repo);

				if (!existing) {
					return new Response(JSON.stringify({
						success: false,
						error: 'Repository not found. Use POST /repo to create new repository.'
					}), {
						status: 404,
						headers: { 'Content-Type': 'application/json' }
					});
				}

				// Parse partial update from request body
				const body = await request.json() as Partial<{ version: string; grpcEndpoint: string }>;

				// Update only provided fields
				const version = body.version !== undefined ? body.version : existing.version;
				const grpcEndpoint = body.grpcEndpoint !== undefined ? body.grpcEndpoint : existing.grpcEndpoint;

				// Save updated metadata
				const updated = await repoManager.saveRepoMetadata(repo, version, grpcEndpoint);

				return new Response(JSON.stringify({
					success: true,
					data: updated
				}), {
					headers: { 'Content-Type': 'application/json' }
				});

			} catch (error) {
				console.error('Error updating repo metadata:', error);
				return new Response(JSON.stringify({
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error'
				}), {
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				});
			}
		}

		// List all repositories (requires Service Binding)
		if (url.pathname === '/repos' && request.method === 'GET') {
			// Check if request is from Service Binding
			if (!isServiceBinding(request)) {
				return forbiddenResponse();
			}

			try {
				const limit = parseInt(url.searchParams.get('limit') || '100');
				const repos = await repoManager.listRepositories(limit);

				return new Response(JSON.stringify({
					success: true,
					data: repos,
					count: repos.length
				}), {
					headers: { 'Content-Type': 'application/json' }
				});

			} catch (error) {
				console.error('Error listing repos:', error);
				return new Response(JSON.stringify({
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error'
				}), {
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				});
			}
		}

		// Delete repository metadata (requires Service Binding)
		if (url.pathname.startsWith('/repo/') && request.method === 'DELETE') {
			// Check if request is from Service Binding
			if (!isServiceBinding(request)) {
				return forbiddenResponse();
			}

			try {
				const repo = decodeURIComponent(url.pathname.substring(6));

				if (!repo) {
					return new Response(JSON.stringify({
						success: false,
						error: 'Repository name is required'
					}), {
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					});
				}

				await repoManager.deleteRepoMetadata(repo);

				return new Response(JSON.stringify({
					success: true,
					message: `Repository ${repo} deleted`
				}), {
					headers: { 'Content-Type': 'application/json' }
				});

			} catch (error) {
				console.error('Error deleting repo metadata:', error);
				return new Response(JSON.stringify({
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error'
				}), {
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				});
			}
		}

		return new Response('Not found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;
