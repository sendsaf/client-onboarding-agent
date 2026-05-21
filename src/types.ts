/**
 * Type definitions for the client onboarding Worker.
 */

import type { OnboardingAgent as OnboardingAgentClass } from "./agent";
import type { TestAgent as TestAgentClass } from "./test-agent";

export interface Env {
	/**
	 * Binding for the Workers AI API.
	 */
	AI: Ai;

	/**
	 * Binding for static assets.
	 */
	ASSETS: Fetcher;

	/**
	 * Binding for D1 database.
	 */
	DB: D1Database;

	/**
	 * Durable Object bindings for agent instances.
	 */
	OnboardingAgent: DurableObjectNamespace<OnboardingAgentClass>;
	TestAgent: DurableObjectNamespace<TestAgentClass>;

	/**
	 * Token required for admin dashboard API access.
	 */
	ADMIN_TOKEN?: string;
}

/**
 * Represents a chat message.
 */
export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}
