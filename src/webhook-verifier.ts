import { DurableObject } from "cloudflare:workers";
import { RepoMetadataManager } from "./repo-metadata";

/**
 * WebhookVerifier Durable Object
 * Handles GitHub webhook verification and processing
 */
export class WebhookVerifier extends DurableObject {
	/**
	 * Verify GitHub webhook signature
	 * @param payload - The raw webhook payload
	 * @param signature - The signature from X-Hub-Signature-256 header
	 * @param secret - The webhook secret
	 * @returns true if signature is valid
	 */
	async verifySignature(
		payload: string,
		signature: string,
		secret: string
	): Promise<boolean> {
		// Remove 'sha256=' prefix if present
		const sig = signature.startsWith('sha256=')
			? signature.substring(7)
			: signature;

		// Create HMAC key
		const encoder = new TextEncoder();
		const key = await crypto.subtle.importKey(
			'raw',
			encoder.encode(secret),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);

		// Calculate signature
		const calculatedSignature = await crypto.subtle.sign(
			'HMAC',
			key,
			encoder.encode(payload)
		);

		// Convert to hex string
		const calculatedHex = Array.from(new Uint8Array(calculatedSignature))
			.map(b => b.toString(16).padStart(2, '0'))
			.join('');

		// Constant-time comparison
		return this.constantTimeCompare(sig, calculatedHex);
	}

	/**
	 * Constant-time string comparison to prevent timing attacks
	 */
	private constantTimeCompare(a: string, b: string): boolean {
		if (a.length !== b.length) {
			return false;
		}

		let result = 0;
		for (let i = 0; i < a.length; i++) {
			result |= a.charCodeAt(i) ^ b.charCodeAt(i);
		}

		return result === 0;
	}

	/**
	 * Process verified webhook
	 */
	async processWebhook(event: string, payload: any, kv: KVNamespace): Promise<void> {
		// Store webhook data in Durable Object storage
		const timestamp = Date.now();
		const key = `webhook:${timestamp}`;

		await this.ctx.storage.put(key, {
			event,
			payload,
			timestamp,
			processed: false
		});

		// Update repository metadata in KV based on webhook event
		await this.updateRepoMetadataFromWebhook(event, payload, kv);

		// You can add additional processing logic here
		console.log(`Webhook processed: ${event} at ${timestamp}`);
	}

	/**
	 * Update repository metadata in KV based on webhook payload
	 */
	async updateRepoMetadataFromWebhook(event: string, payload: any, kv: KVNamespace): Promise<void> {
		const repoManager = new RepoMetadataManager(kv);

		// Extract repository information from webhook payload
		const repo = payload.repository?.full_name;
		if (!repo) {
			console.log('No repository information in webhook payload');
			return;
		}

		// Handle different webhook events
		if (event === 'push' || event === 'release' || event === 'create') {
			let version = '';
			let grpcEndpoint = '';

			// Extract version based on event type
			if (event === 'push' && payload.ref) {
				// Extract tag or branch name
				version = payload.ref.replace('refs/tags/', '').replace('refs/heads/', '');
			} else if (event === 'release' && payload.release?.tag_name) {
				version = payload.release.tag_name;
			} else if (event === 'create' && payload.ref_type === 'tag') {
				version = payload.ref;
			}

			// Get existing metadata to preserve grpcEndpoint
			const existing = await repoManager.getRepoMetadata(repo);
			grpcEndpoint = existing?.grpcEndpoint || '';

			// Only update if we have a version
			if (version) {
				await repoManager.saveRepoMetadata(repo, version, grpcEndpoint);
				console.log(`Updated metadata for ${repo}: version=${version}`);
			}
		}
	}

	/**
	 * Get webhook history
	 */
	async getWebhookHistory(limit: number = 10): Promise<any[]> {
		const list = await this.ctx.storage.list({ reverse: true, limit });
		const webhooks = [];

		for (const [key, value] of list.entries()) {
			webhooks.push(value);
		}

		return webhooks;
	}

	/**
	 * Handle HTTP requests to this Durable Object
	 */
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		// Handle webhook verification endpoint
		if (url.pathname === '/verify' && request.method === 'POST') {
			try {
				// Get signature from header
				const signature = request.headers.get('X-Hub-Signature-256');
				if (!signature) {
					return new Response('Missing signature', { status: 401 });
				}

				// Get webhook secret from environment
				const secret = this.env.WEBHOOK_SECRET;
				if (!secret) {
					return new Response('Webhook secret not configured', { status: 500 });
				}

				// Get payload
				const payload = await request.text();

				// Verify signature
				const isValid = await this.verifySignature(payload, signature, secret);

				if (!isValid) {
					return new Response('Invalid signature', { status: 401 });
				}

				// Parse event type
				const event = request.headers.get('X-GitHub-Event') || 'unknown';

				// Process webhook
				const parsedPayload = JSON.parse(payload);
				await this.processWebhook(event, parsedPayload, this.env.REPO_METADATA);

				return new Response(JSON.stringify({
					success: true,
					event,
					message: 'Webhook verified and processed'
				}), {
					headers: { 'Content-Type': 'application/json' }
				});

			} catch (error) {
				console.error('Webhook verification error:', error);
				return new Response(
					JSON.stringify({
						success: false,
						error: error instanceof Error ? error.message : 'Unknown error'
					}),
					{
						status: 500,
						headers: { 'Content-Type': 'application/json' }
					}
				);
			}
		}

		// Handle history endpoint
		if (url.pathname === '/history' && request.method === 'GET') {
			const limit = parseInt(url.searchParams.get('limit') || '10');
			const history = await this.getWebhookHistory(limit);

			return new Response(JSON.stringify(history), {
				headers: { 'Content-Type': 'application/json' }
			});
		}

		return new Response('Not found', { status: 404 });
	}
}
