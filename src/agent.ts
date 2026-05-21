/**
 * Client Onboarding Agent.
 *
 * A phase-based conversational agent that builds a structured brief while
 * guiding a client through discovery, scope, budget, and proposal fit.
 */

import { Agent, callable } from "agents";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import { createWorkersAI } from "workers-ai-provider";
import {
	buildPhaseProgress,
	createEmptyBrief,
	type ClientBrief,
	type OnboardingSnapshot,
	type Phase,
	type ProposalArtifact,
	type RichMessageResult,
} from "./shared";
import type { Env } from "./types";
import {
	BUSINESS_PROFILE,
	GUARDRAILS,
	SERVICES_CONTEXT,
	brandingPrompt,
	businessBasicsPrompt,
	closePrompt,
	greetingPrompt,
	marketingPrompt,
	resumePrompt,
	websiteGoalsPrompt,
} from "./prompts";

type ChatRole = "user" | "assistant";

interface OnboardingState {
	phase: Phase;
	clientName: string;
	conversationHistory: Array<{ role: ChatRole; content: string }>;
	serviceTypes: string[];
	requirements: Record<string, unknown>;
	budget: number;
	timeline: "rush" | "normal" | "flexible";
	complexity: "simple" | "medium" | "complex";
	contactInfo: {
		email: string;
		phone?: string;
		company?: string;
	};
	selectedAddons: string[];
	estimatedTotal: number;
	brief: ClientBrief;
	proposal: ProposalArtifact | null;
	missingFields: string[];
	lastOptions: string[];
	updatedAt: string;
}

const SERVICE_BASE_PRICES: Record<string, number> = {
	"graphic design": 15000,
	"ui/ux design": 25000,
	"brand identity": 20000,
	"content creation": 10000,
	"motion graphics & video": 20000,
	"web development": 30000,
};

const SERVICE_OPTIONS = [
	"Graphic Design",
	"UI/UX Design",
	"Brand Identity",
	"Content Creation",
	"Motion Graphics & Video",
	"Web Development",
	"Not sure yet",
];

const extractionSchema = z.object({
	services: z.array(z.string()).optional(),
	businessStage: z.string().optional(),
	region: z.string().optional(),
	mainOffer: z.string().optional(),
	idealClient: z.string().optional(),
	hasBrandAssets: z.string().optional(),
	differentiators: z.string().optional(),
	brandWords: z.array(z.string()).optional(),
	websiteGoal: z.string().optional(),
	websiteFeatures: z.array(z.string()).optional(),
	contentReadiness: z.string().optional(),
	marketingChannels: z.array(z.string()).optional(),
	monthlyMarketingBudget: z.string().optional(),
	budget: z.number().nullable().optional(),
	timeline: z.enum(["rush", "normal", "flexible"]).nullable().optional(),
	complexity: z.enum(["simple", "medium", "complex"]).nullable().optional(),
	selectedAddons: z.array(z.string()).optional(),
});

const proposalSchema = z.object({
	title: z.string(),
	recommendedPackage: z.string(),
	summary: z.string(),
	scope: z.array(z.string()),
	timeline: z.string(),
	investment: z.string(),
	nextSteps: z.array(z.string()),
	notes: z.string(),
});

function createInitialState(): OnboardingState {
	return {
		phase: 1,
		clientName: "",
		conversationHistory: [],
		serviceTypes: [],
		requirements: {},
		budget: 0,
		timeline: "normal",
		complexity: "medium",
		contactInfo: { email: "" },
		selectedAddons: [],
		estimatedTotal: 0,
		brief: createEmptyBrief(),
		proposal: null,
		missingFields: [],
		lastOptions: [],
		updatedAt: new Date().toISOString(),
	};
}

function cleanText(value: unknown) {
	return typeof value === "string" ? value.trim() : "";
}

function mergeUnique(existing: string[], incoming?: string[]) {
	const values = [...existing];
	for (const raw of incoming || []) {
		const value = cleanText(raw);
		if (!value) continue;
		if (!values.some((item) => item.toLowerCase() === value.toLowerCase())) {
			values.push(value);
		}
	}
	return values;
}

function prefer(current: string, incoming?: string) {
	const next = cleanText(incoming);
	return next || current;
}

function parseOptions(text: string) {
	const match = text.match(/\[OPTIONS:\s*([^\]]+)\]/i);
	if (!match) return [];
	return match[1]
		.split("|")
		.map((item) => item.trim())
		.filter(Boolean);
}

function estimateTotal(brief: ClientBrief) {
	const serviceTotal = brief.services.reduce((total, service) => {
		const normalized = service.toLowerCase();
		const price = Object.entries(SERVICE_BASE_PRICES).find(([name]) => normalized.includes(name))?.[1] || 0;
		return total + price;
	}, 0);

	const base = brief.project.budget > 0 ? brief.project.budget : serviceTotal;
	if (!base) return 0;

	const complexityModifier = brief.project.complexity === "complex" ? 1.5 : brief.project.complexity === "simple" ? 0.8 : 1;
	const timelineModifier = brief.project.timeline === "rush" ? 1.5 : brief.project.timeline === "flexible" ? 0.9 : 1;
	return Math.round(base * complexityModifier * timelineModifier);
}

function missingFieldsFor(brief: ClientBrief, proposal: ProposalArtifact | null) {
	const missing: string[] = [];
	if (brief.services.length === 0) missing.push("services needed");
	if (!brief.business.stage) missing.push("business stage");
	if (!brief.business.region) missing.push("target region");
	if (!brief.business.mainOffer) missing.push("main offer");
	if (!brief.business.idealClient) missing.push("ideal client");
	if (!brief.branding.differentiators) missing.push("differentiator");
	if (brief.branding.brandWords.length === 0) missing.push("brand feel");
	if (!brief.website.primaryGoal) missing.push("website goal");
	if (brief.website.features.length === 0) missing.push("website features");
	if (brief.marketing.channels.length === 0) missing.push("marketing intent");
	if (!brief.marketing.monthlyBudget) missing.push("monthly marketing budget");
	if (!brief.project.budget) missing.push("project budget");
	if (!proposal) missing.push("proposal");
	return missing;
}

function phaseFor(brief: ClientBrief, proposal: ProposalArtifact | null): Phase {
	if (proposal) return 6;
	if (brief.services.length === 0) return 1;
	if (!brief.business.stage || !brief.business.region || !brief.business.mainOffer || !brief.business.idealClient) return 2;
	if (!brief.branding.differentiators || brief.branding.brandWords.length === 0) return 3;
	if (!brief.website.primaryGoal || brief.website.features.length === 0) return 4;
	if (brief.marketing.channels.length === 0 || !brief.marketing.monthlyBudget || !brief.project.budget) return 5;
	return 6;
}

function completionFor(missingFields: string[]) {
	const totalTrackedFields = 13;
	const completed = Math.max(0, totalTrackedFields - missingFields.length);
	return Math.min(100, Math.round((completed / totalTrackedFields) * 100));
}

function normalizeState(raw: OnboardingState): OnboardingState {
	const brief = {
		...createEmptyBrief(),
		...(raw.brief || {}),
		contact: {
			...createEmptyBrief().contact,
			...(raw.brief?.contact || {}),
			name: raw.clientName || raw.brief?.contact?.name || "",
			email: raw.contactInfo?.email || raw.brief?.contact?.email || "",
			phone: raw.contactInfo?.phone || raw.brief?.contact?.phone || "",
			company: raw.contactInfo?.company || raw.brief?.contact?.company || "",
		},
		project: {
			...createEmptyBrief().project,
			...(raw.brief?.project || {}),
			budget: raw.budget || raw.brief?.project?.budget || 0,
			timeline: raw.timeline || raw.brief?.project?.timeline || "normal",
			complexity: raw.complexity || raw.brief?.project?.complexity || "medium",
			selectedAddons: raw.selectedAddons || raw.brief?.project?.selectedAddons || [],
			estimatedTotal: raw.estimatedTotal || raw.brief?.project?.estimatedTotal || 0,
		},
	};

	const proposal = raw.proposal || null;
	const missingFields = missingFieldsFor(brief, proposal);
	const phase = phaseFor(brief, proposal);
	const estimatedTotal = estimateTotal(brief);

	return {
		...createInitialState(),
		...raw,
		phase,
		brief: {
			...brief,
			project: {
				...brief.project,
				estimatedTotal,
			},
		},
		serviceTypes: brief.services,
		requirements: {
			business: brief.business,
			branding: brief.branding,
			website: brief.website,
			marketing: brief.marketing,
		},
		budget: brief.project.budget,
		timeline: brief.project.timeline,
		complexity: brief.project.complexity,
		selectedAddons: brief.project.selectedAddons,
		estimatedTotal,
		proposal,
		missingFields,
		updatedAt: raw.updatedAt || new Date().toISOString(),
	};
}

function suggestedOptionsFor(state: OnboardingState) {
	const brief = state.brief;
	if (brief.services.length === 0) return SERVICE_OPTIONS;
	if (!brief.business.stage) return ["Just starting", "Already doing projects", "Scaling an existing business"];
	if (!brief.business.region) return ["Local market", "National", "International", "Not sure yet"];
	if (!brief.branding.hasAssets) return ["Logo and colors ready", "Some assets ready", "Starting from scratch"];
	if (!brief.website.primaryGoal) return ["Generate qualified leads", "Showcase portfolio", "Sell products online", "Explain services clearly"];
	if (brief.marketing.channels.length === 0) return ["SEO", "Instagram / social media", "Paid ads", "Email marketing", "Not sure yet"];
	if (!brief.project.budget) return ["Under 15000", "15000-30000", "30000-50000", "50000+", "Need guidance"];
	if (!state.proposal) return ["Yes, draft the proposal", "I want to add more details first"];
	return [];
}

export class OnboardingAgent extends Agent<Env, OnboardingState> {
	initialState: OnboardingState = createInitialState();

	private ensureState() {
		if (!this.state?.brief) {
			this.setState(createInitialState());
		}
		this.setState(normalizeState(this.state));
	}

	getSystemPrompt(): string {
		this.ensureState();
		const { phase, clientName, contactInfo, brief } = this.state;
		const name = clientName || brief.contact.name || "";
		const company = contactInfo?.company || brief.contact.company || "";
		const collected = JSON.stringify({ brief, missingFields: this.state.missingFields }, null, 2);

		switch (phase) {
			case 1:
				return greetingPrompt(name, contactInfo?.email || "", contactInfo?.phone || "", company);
			case 2:
				return businessBasicsPrompt(name, company, collected);
			case 3:
				return brandingPrompt(name, company, collected);
			case 4:
				return websiteGoalsPrompt(name, company, collected);
			case 5:
				return marketingPrompt(name, company, collected);
			case 6:
				return closePrompt(name, company, collected);
			default:
				return `${BUSINESS_PROFILE}\n\n${GUARDRAILS}\n\n${SERVICES_CONTEXT}`;
		}
	}

	@callable()
	async initializeSession(email: string, name: string, mobile: string, company = "") {
		const conversationId = this.name;
		const brief = createEmptyBrief();
		brief.contact = { name, email, phone: mobile, company };

		this.setState(normalizeState({
			...createInitialState(),
			phase: 1,
			clientName: name,
			contactInfo: { email, phone: mobile, company },
			brief,
			lastOptions: SERVICE_OPTIONS,
			updatedAt: new Date().toISOString(),
		}));

		await this.env.DB.prepare(`
			INSERT OR IGNORE INTO conversations (id, client_name, email, phone, company, status)
			VALUES (?, ?, ?, ?, ?, 'active')
		`).bind(conversationId, name, email, mobile, company).run();

		await this.saveToDatabase();
		return { isReturning: false, conversationId, snapshot: this.buildSnapshot() };
	}

	@callable()
	async getSnapshot(): Promise<OnboardingSnapshot> {
		this.ensureState();
		return this.buildSnapshot();
	}

	@callable()
	async sendMessage(userMessage: string, conversationId?: string) {
		const result = await this.sendMessageRich(userMessage, conversationId);
		return result.reply;
	}

	@callable()
	async sendMessageStream(userMessage: string, conversationId?: string) {
		const result = await this.sendMessageRich(userMessage, conversationId);
		this.broadcastChunk("message_chunk", { chunk: result.reply });
		return result.reply;
	}

	@callable()
	async sendMessageRich(userMessage: string, conversationId?: string): Promise<RichMessageResult> {
		this.ensureState();
		const actualMessage = this.normalizeIncomingMessage(userMessage);
		const convId = conversationId || this.name;

		this.state.conversationHistory.push({ role: "user", content: actualMessage });
		await this.saveMessage(convId, "user", actualMessage);
		await this.extractBriefFromMessage(actualMessage);

		const reply = await this.generateAssistantReply();
		const options = parseOptions(reply);
		this.state.lastOptions = options.length ? options : suggestedOptionsFor(normalizeState(this.state));
		this.state.conversationHistory.push({ role: "assistant", content: reply });
		this.state.updatedAt = new Date().toISOString();

		await this.saveMessage(convId, "assistant", reply);
		await this.saveToDatabase();
		this.setState({ ...this.state });

		return { reply, snapshot: this.buildSnapshot() };
	}

	@callable()
	async generateProposal(): Promise<OnboardingSnapshot> {
		this.ensureState();
		const workersai = createWorkersAI({ binding: this.env.AI });

		try {
			const { object } = await generateObject({
				model: workersai("@cf/meta/llama-3.1-8b-instruct-fp8"),
				schema: proposalSchema,
				system: `${BUSINESS_PROFILE}\n\n${SERVICES_CONTEXT}`,
				prompt: `Create a concise client proposal from this structured brief. Keep it generic, realistic, and ready to show on screen.\n\n${JSON.stringify(this.state.brief, null, 2)}`,
				temperature: 0.4,
				maxOutputTokens: 700,
			});

			this.state.proposal = {
				...object,
				generatedAt: new Date().toISOString(),
			};
		} catch {
			this.state.proposal = this.createFallbackProposal();
		}

		this.state.phase = 6;
		this.state.updatedAt = new Date().toISOString();
		this.setState(normalizeState(this.state));
		await this.saveToDatabase();
		return this.buildSnapshot();
	}

	private async extractBriefFromMessage(message: string) {
		const workersai = createWorkersAI({ binding: this.env.AI });
		try {
			const { object } = await generateObject({
				model: workersai("@cf/meta/llama-3.1-8b-instruct-fp8"),
				schema: extractionSchema,
				system: [
					"You extract only facts explicitly present in the latest client message.",
					"Do not invent values. Return empty or omit fields when the message does not contain the fact.",
					"Normalize service names to the configured services when possible.",
				].join("\n"),
				prompt: [
					`Current brief:\n${JSON.stringify(this.state.brief, null, 2)}`,
					`Latest client message:\n${message}`,
				].join("\n\n"),
				temperature: 0,
				maxOutputTokens: 600,
			});

			this.applyExtraction(object);
		} catch {
			this.applyRuleBasedExtraction(message);
		}

		this.state.updatedAt = new Date().toISOString();
		this.setState(normalizeState(this.state));
	}

	private applyExtraction(extraction: z.infer<typeof extractionSchema>) {
		const brief = this.state.brief;
		brief.services = mergeUnique(brief.services, extraction.services);
		brief.business.stage = prefer(brief.business.stage, extraction.businessStage);
		brief.business.region = prefer(brief.business.region, extraction.region);
		brief.business.mainOffer = prefer(brief.business.mainOffer, extraction.mainOffer);
		brief.business.idealClient = prefer(brief.business.idealClient, extraction.idealClient);
		brief.branding.hasAssets = prefer(brief.branding.hasAssets, extraction.hasBrandAssets);
		brief.branding.differentiators = prefer(brief.branding.differentiators, extraction.differentiators);
		brief.branding.brandWords = mergeUnique(brief.branding.brandWords, extraction.brandWords);
		brief.website.primaryGoal = prefer(brief.website.primaryGoal, extraction.websiteGoal);
		brief.website.features = mergeUnique(brief.website.features, extraction.websiteFeatures);
		brief.website.contentReadiness = prefer(brief.website.contentReadiness, extraction.contentReadiness);
		brief.marketing.channels = mergeUnique(brief.marketing.channels, extraction.marketingChannels);
		brief.marketing.monthlyBudget = prefer(brief.marketing.monthlyBudget, extraction.monthlyMarketingBudget);
		brief.project.selectedAddons = mergeUnique(brief.project.selectedAddons, extraction.selectedAddons);

		if (typeof extraction.budget === "number" && extraction.budget > 0) {
			brief.project.budget = extraction.budget;
		}
		if (extraction.timeline) brief.project.timeline = extraction.timeline;
		if (extraction.complexity) brief.project.complexity = extraction.complexity;
	}

	private applyRuleBasedExtraction(message: string) {
		const lower = message.toLowerCase();
		const services = Object.keys(SERVICE_BASE_PRICES)
			.filter((service) => lower.includes(service))
			.map((service) => service.replace(/\b\w/g, (char) => char.toUpperCase()));
		this.state.brief.services = mergeUnique(this.state.brief.services, services);

		const budgetMatch = lower.match(/(?:budget|around|about|roughly)?\s*(?:rs\.?|inr|₹)?\s*([0-9][0-9,]{3,})/i);
		if (budgetMatch) {
			this.state.brief.project.budget = Number(budgetMatch[1].replace(/,/g, ""));
		}
		if (lower.includes("rush") || lower.includes("urgent")) this.state.brief.project.timeline = "rush";
		if (lower.includes("flexible")) this.state.brief.project.timeline = "flexible";
		if (lower.includes("website")) this.state.brief.website.primaryGoal ||= "Website project";
		if (lower.includes("seo")) this.state.brief.marketing.channels = mergeUnique(this.state.brief.marketing.channels, ["SEO"]);
		if (lower.includes("instagram") || lower.includes("social")) this.state.brief.marketing.channels = mergeUnique(this.state.brief.marketing.channels, ["Social media"]);
	}

	private async generateAssistantReply() {
		try {
			const workersai = createWorkersAI({ binding: this.env.AI });
			const { text } = await generateText({
				model: workersai("@cf/meta/llama-3.1-8b-instruct-fp8"),
				system: this.getSystemPrompt(),
				messages: this.state.conversationHistory.map((msg) => ({
					role: msg.role,
					content: msg.content,
				})),
				temperature: 0.7,
				maxOutputTokens: 512,
			});
			return text;
		} catch {
			return "I'm having trouble connecting right now. Please try again.";
		}
	}

	private normalizeIncomingMessage(userMessage: string) {
		if (!userMessage.startsWith("[User:")) return userMessage;
		const contextEnd = userMessage.indexOf("]\n");
		if (contextEnd === -1) return userMessage;

		const contextStr = userMessage.substring(0, contextEnd + 1);
		const actualMessage = userMessage.substring(contextEnd + 2);
		const nameMatch = contextStr.match(/User: ([^,]+)/);
		const emailMatch = contextStr.match(/Email: ([^,]+)/);
		const mobileMatch = contextStr.match(/Mobile: ([^\]]+)/);

		if (nameMatch && emailMatch && mobileMatch) {
			this.state.clientName ||= nameMatch[1].trim();
			this.state.contactInfo = {
				email: emailMatch[1].trim(),
				phone: mobileMatch[1].trim(),
				company: this.state.contactInfo.company,
			};
			this.state.brief.contact = {
				...this.state.brief.contact,
				name: this.state.clientName,
				email: this.state.contactInfo.email,
				phone: this.state.contactInfo.phone || "",
			};
		}

		return actualMessage;
	}

	private createFallbackProposal(): ProposalArtifact {
		const brief = this.state.brief;
		const services = brief.services.length ? brief.services.join(", ") : "the requested services";
		const estimate = brief.project.estimatedTotal ? `${brief.project.estimatedTotal}` : "to be confirmed after scope review";
		return {
			generatedAt: new Date().toISOString(),
			title: `${brief.contact.company || brief.contact.name || "Client"} Project Brief`,
			recommendedPackage: "Recommended",
			summary: `A focused engagement for ${services}, shaped around the client's current goals and discovery notes.`,
			scope: [
				"Finalize requirements and success criteria",
				"Develop the agreed brand, website, or marketing assets",
				"Review, refine, and prepare launch-ready deliverables",
			],
			timeline: brief.project.timeline === "rush" ? "Rush timeline to be confirmed" : "Standard 3-4 week timeline",
			investment: estimate,
			nextSteps: [
				"Confirm the recommended package",
				"Approve the detailed scope",
				"Schedule kickoff and collect assets",
			],
			notes: "This proposal is a draft based on the current discovery conversation.",
		};
	}

	private async saveMessage(conversationId: string, role: ChatRole, content: string) {
		await this.env.DB.prepare(`
			INSERT INTO messages (id, conversation_id, role, content)
			VALUES (?, ?, ?, ?)
		`).bind(`${conversationId}_${Date.now()}_${Math.random().toString(36).slice(2)}`, conversationId, role, content).run();
	}

	private buildSnapshot(): OnboardingSnapshot {
		const state = normalizeState(this.state);
		this.setState(state);
		return {
			phase: state.phase,
			phases: buildPhaseProgress(state.phase),
			brief: state.brief,
			proposal: state.proposal,
			messagesSummary: state.conversationHistory.slice(-8).map((message) => ({
				role: message.role,
				content: message.content,
			})),
			missingFields: state.missingFields,
			completion: completionFor(state.missingFields),
			options: state.lastOptions,
			updatedAt: state.updatedAt,
		};
	}

	private broadcastChunk(type: string, data: unknown) {
		const message = JSON.stringify({ type, data });
		for (const ws of this.ctx.getWebSockets()) {
			try {
				ws.send(message);
			} catch (error) {
				console.error("Error broadcasting:", error);
			}
		}
	}

	async saveToDatabase() {
		const state = normalizeState(this.state);
		this.setState(state);
		const conversationId = this.name;
		const brief = state.brief;

		await this.env.DB.prepare(`
			INSERT OR IGNORE INTO conversations (id, client_name, email, phone, company, phase_completed, estimated_total, status)
			VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
		`).bind(
			conversationId,
			brief.contact.name || "Unknown",
			brief.contact.email,
			brief.contact.phone,
			brief.contact.company,
			state.phase,
			state.estimatedTotal,
		).run();

		await this.env.DB.prepare(`
			UPDATE conversations
			SET client_name = ?, email = ?, phone = ?, company = ?, phase_completed = ?, estimated_total = ?, updated_at = datetime('now')
			WHERE id = ?
		`).bind(
			brief.contact.name || "Unknown",
			brief.contact.email,
			brief.contact.phone,
			brief.contact.company,
			state.phase,
			state.estimatedTotal,
			conversationId,
		).run();

		await this.env.DB.prepare(`
			INSERT OR REPLACE INTO conversation_data (
				id, conversation_id, service_types, requirements, budget,
				timeline, complexity, selected_addons, json_data, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
		`).bind(
			conversationId,
			conversationId,
			JSON.stringify(state.serviceTypes),
			JSON.stringify(state.requirements),
			state.budget,
			state.timeline,
			state.complexity,
			JSON.stringify(state.selectedAddons),
			JSON.stringify(state),
		).run();
	}
}
