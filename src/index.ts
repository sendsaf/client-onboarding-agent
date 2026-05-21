/**
 * Client Onboarding Agent Worker.
 */

import { getAgentByName } from "agents";
import { OnboardingAgent } from "./agent";
import { TestAgent } from "./test-agent";
import type { Env } from "./types";

export { OnboardingAgent, TestAgent };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const AGENT_METHODS: Record<string, Set<string>> = {
	OnboardingAgent: new Set(["sendMessage", "sendMessageStream", "sendMessageRich", "getSnapshot", "generateProposal"]),
	TestAgent: new Set(["sendMessage", "getCount"]),
};

type RpcBody = {
	method?: unknown;
	args?: unknown;
};

function isLocalHost(hostname: string) {
	return LOCAL_HOSTS.has(hostname);
}

function isCrossOrigin(request: Request) {
	const origin = request.headers.get("Origin");
	return Boolean(origin && origin !== new URL(request.url).origin);
}

function corsHeadersFor(request: Request): HeadersInit {
	const origin = request.headers.get("Origin");
	if (!origin || isCrossOrigin(request)) return {};

	return {
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
		"Vary": "Origin",
	};
}

function withCors(request: Request, response: Response) {
	const next = new Response(response.body, response);
	Object.entries(corsHeadersFor(request)).forEach(([key, value]) => {
		next.headers.set(key, value);
	});
	return next;
}

function jsonResponse(request: Request, body: unknown, status = 200) {
	return withCors(request, Response.json(body, { status }));
}

function normalizeText(value: unknown, maxLength: number) {
	if (typeof value !== "string") return "";
	return value.trim().slice(0, maxLength);
}

function normalizeEmail(value: unknown) {
	const email = normalizeText(value, 320).toLowerCase();
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

async function getAgentStub(env: Env, agentType: string, agentId: string): Promise<any> {
	if (agentType === "OnboardingAgent") {
		return getAgentByName<Env, OnboardingAgent>(env.OnboardingAgent, agentId);
	}

	if (agentType === "TestAgent") {
		return getAgentByName<Env, TestAgent>(env.TestAgent, agentId);
	}

	throw new Error("Unknown agent type");
}

async function readRpcBody(request: Request): Promise<RpcBody | null> {
	try {
		const body = await request.json();
		if (!body || typeof body !== "object") return null;
		return body as RpcBody;
	} catch {
		return null;
	}
}

function validateAgentCall(agentType: string, body: RpcBody) {
	const method = typeof body.method === "string" ? body.method : "";
	const args = Array.isArray(body.args) ? body.args : [];

	if (!AGENT_METHODS[agentType]?.has(method)) {
		return { ok: false as const, message: "Unsupported agent method" };
	}

	if ((method === "sendMessage" || method === "sendMessageStream" || method === "sendMessageRich") && typeof args[0] !== "string") {
		return { ok: false as const, message: "Message must be a string" };
	}

	if ((method === "sendMessage" || method === "sendMessageRich") && args.length > 1 && typeof args[1] !== "string") {
		return { ok: false as const, message: "Conversation id must be a string" };
	}

	return { ok: true as const, method, args };
}

async function handleAgentRequest(request: Request, env: Env): Promise<Response | null> {
	const url = new URL(request.url);
	const match = url.pathname.match(/^\/agents?\/([a-zA-Z-]+)\/(.+)$/);
	if (!match) return null;

	const [, agentTypeRaw, agentId] = match;
	const agentType = agentTypeRaw
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join("");

	if (agentType === "TestAgent" && !isLocalHost(url.hostname)) {
		return new Response("Not found", { status: 404 });
	}

	try {
		const agent = await getAgentStub(env, agentType, agentId);

		if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
			return agent.fetch(request);
		}

		if (request.method === "POST") {
			const body = await readRpcBody(request);
			if (!body) return jsonResponse(request, { error: "Invalid JSON body" }, 400);

			const validated = validateAgentCall(agentType, body);
			if (!validated.ok) return jsonResponse(request, { error: validated.message }, 400);

			const result = await agent[validated.method](...validated.args);
			return jsonResponse(request, { result });
		}

		if (request.method === "GET") {
			return jsonResponse(request, { status: "connected", agentType, agentId });
		}

		return jsonResponse(request, { error: "Method not allowed" }, 405);
	} catch {
		return jsonResponse(request, { error: "Agent request failed" }, 500);
	}
}

async function createConversation(request: Request, env: Env) {
	const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
	const email = normalizeEmail(payload?.email);
	const name = normalizeText(payload?.name, 120);
	const mobile = normalizeText(payload?.mobile, 40);
	const company = normalizeText(payload?.company, 160);

	if (!email || !name || !mobile) {
		return jsonResponse(request, { error: "Valid email, name, and mobile are required" }, 400);
	}

	const conversationId = crypto.randomUUID();

	await env.DB.prepare(`
		INSERT INTO conversations (id, client_name, email, phone, company, status)
		VALUES (?, ?, ?, ?, ?, 'active')
	`).bind(conversationId, name, email, mobile, company).run();

	const agent = await getAgentByName<Env, OnboardingAgent>(env.OnboardingAgent, conversationId);
	const session = await agent.initializeSession(email, name, mobile, company);

	return jsonResponse(request, { isReturning: false, conversationId, snapshot: session.snapshot });
}

function getAdminToken(request: Request, env: Env) {
	const configuredToken = env.ADMIN_TOKEN;
	if (configuredToken) return configuredToken;

	const url = new URL(request.url);
	return isLocalHost(url.hostname) ? "dev-admin-token" : "";
}

function isAdminAuthorized(request: Request, env: Env) {
	const token = getAdminToken(request, env);
	if (!token) return false;
	const authorization = request.headers.get("Authorization") || "";
	return authorization === `Bearer ${token}`;
}

function adminUnauthorized(request: Request) {
	return jsonResponse(request, { error: "Admin token required" }, 401);
}

function parseJsonState(value: unknown) {
	if (typeof value !== "string" || !value) return null;
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

async function listAdminLeads(request: Request, env: Env) {
	if (!isAdminAuthorized(request, env)) return adminUnauthorized(request);

	const result = await env.DB.prepare(`
		SELECT c.id, c.client_name, c.email, c.phone, c.company, c.phase_completed, c.estimated_total,
		       c.status, c.created_at, c.updated_at, d.json_data
		FROM conversations c
		LEFT JOIN conversation_data d ON d.conversation_id = c.id
		ORDER BY c.updated_at DESC
		LIMIT 100
	`).all();

	const leads = (result.results || []).map((row: Record<string, unknown>) => {
		const state = parseJsonState(row.json_data);
		return {
			id: row.id,
			name: row.client_name,
			email: row.email,
			phone: row.phone,
			company: row.company,
			status: row.status,
			phase: row.phase_completed,
			estimatedTotal: row.estimated_total,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
			services: state?.brief?.services || [],
			completion: state?.missingFields ? Math.max(0, Math.round(((13 - state.missingFields.length) / 13) * 100)) : 0,
			proposalReady: Boolean(state?.proposal),
		};
	});

	return jsonResponse(request, { leads });
}

async function getAdminLead(request: Request, env: Env, leadId: string) {
	if (!isAdminAuthorized(request, env)) return adminUnauthorized(request);

	const conversation = await env.DB.prepare(`
		SELECT * FROM conversations WHERE id = ?
	`).bind(leadId).first();

	if (!conversation) return jsonResponse(request, { error: "Lead not found" }, 404);

	const data = await env.DB.prepare(`
		SELECT * FROM conversation_data WHERE conversation_id = ?
	`).bind(leadId).first();

	const messages = await env.DB.prepare(`
		SELECT role, content, timestamp FROM messages
		WHERE conversation_id = ?
		ORDER BY timestamp ASC
	`).bind(leadId).all();

	return jsonResponse(request, {
		lead: conversation,
		messages: messages.results || [],
		state: parseJsonState(data?.json_data),
	});
}

async function updateAdminLead(request: Request, env: Env, leadId: string) {
	if (!isAdminAuthorized(request, env)) return adminUnauthorized(request);

	const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
	const status = normalizeText(payload?.status, 40);
	const allowed = new Set(["active", "qualified", "completed", "abandoned", "archived"]);
	if (!allowed.has(status)) return jsonResponse(request, { error: "Invalid status" }, 400);

	await env.DB.prepare(`
		UPDATE conversations SET status = ?, updated_at = datetime('now') WHERE id = ?
	`).bind(status, leadId).run();

	return getAdminLead(request, env, leadId);
}

async function testAi(request: Request, env: Env) {
	const stream = await env.AI.run(
		"@cf/meta/llama-3.1-8b-instruct-fp8",
		{
			messages: [
				{ role: "system", content: "You are a helpful assistant." },
				{ role: "user", content: "Say hello in one sentence." },
			],
			max_tokens: 100,
			stream: true,
		}
	);

	return withCors(request, new Response(stream, {
		headers: {
			"content-type": "text/event-stream; charset=utf-8",
			"cache-control": "no-cache",
			connection: "keep-alive",
		},
	}));
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === "OPTIONS") {
			if (isCrossOrigin(request)) return new Response(null, { status: 403 });
			return new Response(null, { status: 204, headers: corsHeadersFor(request) });
		}

		if (isCrossOrigin(request)) {
			return jsonResponse(request, { error: "Origin not allowed" }, 403);
		}

		if (url.pathname === "/api/chat/init" && request.method === "POST") {
			return createConversation(request, env);
		}

		if (url.pathname === "/api/chat/history" || url.pathname === "/api/chat/message") {
			return jsonResponse(request, { error: "Public chat history endpoints are disabled" }, 410);
		}

		if (url.pathname === "/api/admin/leads" && request.method === "GET") {
			return listAdminLeads(request, env);
		}

		const adminLeadMatch = url.pathname.match(/^\/api\/admin\/leads\/([^/]+)$/);
		if (adminLeadMatch && request.method === "GET") {
			return getAdminLead(request, env, adminLeadMatch[1]);
		}

		if (adminLeadMatch && request.method === "PATCH") {
			return updateAdminLead(request, env, adminLeadMatch[1]);
		}

		if (url.pathname === "/api/test-ai" && request.method === "POST") {
			if (!isLocalHost(url.hostname)) return new Response("Not found", { status: 404 });
			return testAi(request, env);
		}

		const agentResponse = await handleAgentRequest(request, env);
		if (agentResponse) return withCors(request, agentResponse);

		if (url.pathname === "/admin") {
			return env.ASSETS.fetch(new Request(new URL("/", request.url), request));
		}

		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
