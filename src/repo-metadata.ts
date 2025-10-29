/**
 * Repository Metadata Interface
 */
export interface RepoMetadata {
	repo: string;           // GitHub repository (owner/repo)
	version: string;        // Version or tag
	grpcEndpoint: string;   // gRPC endpoint URL
	updatedAt: number;      // Timestamp of last update
	createdAt: number;      // Timestamp of creation
}

/**
 * Repository Metadata Manager
 * Handles storing and retrieving repository metadata from KV
 */
export class RepoMetadataManager {
	constructor(private kv: KVNamespace) {}

	/**
	 * Generate KV key for a repository
	 */
	private getRepoKey(repo: string): string {
		return `repo:${repo}`;
	}

	/**
	 * Store repository metadata in KV
	 */
	async saveRepoMetadata(
		repo: string,
		version: string,
		grpcEndpoint: string
	): Promise<RepoMetadata> {
		const key = this.getRepoKey(repo);
		const now = Date.now();

		// Check if metadata already exists
		const existing = await this.getRepoMetadata(repo);

		const metadata: RepoMetadata = {
			repo,
			version,
			grpcEndpoint,
			updatedAt: now,
			createdAt: existing?.createdAt || now
		};

		// Store in KV with metadata
		await this.kv.put(key, JSON.stringify(metadata), {
			metadata: {
				repo,
				version,
				lastUpdated: now.toString()
			}
		});

		return metadata;
	}

	/**
	 * Get repository metadata from KV
	 */
	async getRepoMetadata(repo: string): Promise<RepoMetadata | null> {
		const key = this.getRepoKey(repo);
		const value = await this.kv.get(key, 'json');

		return value as RepoMetadata | null;
	}

	/**
	 * List all repositories
	 */
	async listRepositories(limit: number = 100): Promise<RepoMetadata[]> {
		const list = await this.kv.list({ prefix: 'repo:', limit });
		const repos: RepoMetadata[] = [];

		for (const key of list.keys) {
			const value = await this.kv.get(key.name, 'json');
			if (value) {
				repos.push(value as RepoMetadata);
			}
		}

		return repos;
	}

	/**
	 * Delete repository metadata
	 */
	async deleteRepoMetadata(repo: string): Promise<void> {
		const key = this.getRepoKey(repo);
		await this.kv.delete(key);
	}

	/**
	 * Search repositories by owner
	 */
	async getRepositoriesByOwner(owner: string): Promise<RepoMetadata[]> {
		const allRepos = await this.listRepositories();
		return allRepos.filter(repo => repo.repo.startsWith(`${owner}/`));
	}

	/**
	 * Update gRPC endpoint for a repository
	 */
	async updateGrpcEndpoint(repo: string, grpcEndpoint: string): Promise<RepoMetadata | null> {
		const existing = await this.getRepoMetadata(repo);

		if (!existing) {
			return null;
		}

		return await this.saveRepoMetadata(repo, existing.version, grpcEndpoint);
	}

	/**
	 * Update version for a repository
	 */
	async updateVersion(repo: string, version: string): Promise<RepoMetadata | null> {
		const existing = await this.getRepoMetadata(repo);

		if (!existing) {
			return null;
		}

		return await this.saveRepoMetadata(repo, version, existing.grpcEndpoint);
	}
}
