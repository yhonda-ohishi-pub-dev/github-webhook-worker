/**
 * Authentication and authorization for Service Bindings
 */

/**
 * Check if request is from Service Binding (internal Worker-to-Worker communication)
 * Service Bindings are identified by:
 * 1. Custom header X-Service-Binding: true
 * 2. Internal hostname patterns (fake-host, *.internal)
 */
export function isServiceBinding(request: Request): boolean {
	// Check custom header (most reliable method)
	if (request.headers.get('X-Service-Binding') === 'true') {
		return true;
	}

	// Check internal URL patterns used by Service Bindings
	const url = new URL(request.url);
	return url.hostname === 'fake-host' ||
	       url.hostname.endsWith('.internal');
}

/**
 * Create 403 Forbidden response for non-Service-Binding requests
 */
export function forbiddenResponse(message: string = 'Access denied. This endpoint requires Service Binding.'): Response {
	return new Response(JSON.stringify({
		success: false,
		error: message
	}), {
		status: 403,
		headers: {
			'Content-Type': 'application/json'
		}
	});
}
