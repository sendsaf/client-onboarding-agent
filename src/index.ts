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
	OnboardingAgent: new Set(["sendMessage", "sendMessageStream"]),
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

	if ((method === "sendMessage" || method === "sendMessageStream") && typeof args[0] !== "string") {
		return { ok: false as const, message: "Message must be a string" };
	}

	if (method === "sendMessage" && args.length > 1 && typeof args[1] !== "string") {
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

	if (!email || !name || !mobile) {
		return jsonResponse(request, { error: "Valid email, name, and mobile are required" }, 400);
	}

	const conversationId = crypto.randomUUID();

	await env.DB.prepare(`
		INSERT INTO conversations (id, client_name, email, phone, status)
		VALUES (?, ?, ?, ?, 'active')
	`).bind(conversationId, name, email, mobile).run();

	return jsonResponse(request, { isReturning: false, conversationId });
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

		if (url.pathname === "/api/test-ai" && request.method === "POST") {
			if (!isLocalHost(url.hostname)) return new Response("Not found", { status: 404 });
			return testAi(request, env);
		}

		const agentResponse = await handleAgentRequest(request, env);
		if (agentResponse) return withCors(request, agentResponse);

		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
