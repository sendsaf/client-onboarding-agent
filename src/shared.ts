export const ONBOARDING_PHASES = [
	{
		id: 1,
		key: "contact",
		title: "Contact",
		description: "Basic lead details captured",
	},
	{
		id: 2,
		key: "business",
		title: "Business Basics",
		description: "Stage, market, offer, and audience",
	},
	{
		id: 3,
		key: "branding",
		title: "Brand Direction",
		description: "Assets, positioning, and desired feel",
	},
	{
		id: 4,
		key: "website",
		title: "Website Goals",
		description: "Primary goal, features, and content readiness",
	},
	{
		id: 5,
		key: "marketing",
		title: "Growth Intent",
		description: "SEO, social, channels, and monthly budget",
	},
	{
		id: 6,
		key: "proposal",
		title: "Proposal",
		description: "Package fit, scope, timeline, and next steps",
	},
] as const;

export type Phase = typeof ONBOARDING_PHASES[number]["id"];
export type PhaseStatus = "pending" | "active" | "completed";

export interface PhaseProgress {
	id: Phase;
	key: string;
	title: string;
	description: string;
	status: PhaseStatus;
}

export interface ClientBrief {
	contact: {
		name: string;
		email: string;
		phone: string;
		company: string;
	};
	business: {
		stage: string;
		region: string;
		mainOffer: string;
		idealClient: string;
	};
	services: string[];
	branding: {
		hasAssets: string;
		differentiators: string;
		brandWords: string[];
	};
	website: {
		primaryGoal: string;
		features: string[];
		contentReadiness: string;
	};
	marketing: {
		channels: string[];
		monthlyBudget: string;
	};
	project: {
		budget: number;
		timeline: "rush" | "normal" | "flexible";
		complexity: "simple" | "medium" | "complex";
		selectedAddons: string[];
		estimatedTotal: number;
	};
}

export interface ProposalArtifact {
	generatedAt: string;
	title: string;
	recommendedPackage: string;
	summary: string;
	scope: string[];
	timeline: string;
	investment: string;
	nextSteps: string[];
	notes: string;
}

export interface OnboardingSnapshot {
	phase: Phase;
	phases: PhaseProgress[];
	brief: ClientBrief;
	proposal: ProposalArtifact | null;
	messagesSummary: Array<{ role: "user" | "assistant"; content: string }>;
	missingFields: string[];
	completion: number;
	options: string[];
	updatedAt: string;
}

export interface RichMessageResult {
	reply: string;
	snapshot: OnboardingSnapshot;
}

export function createEmptyBrief(): ClientBrief {
	return {
		contact: {
			name: "",
			email: "",
			phone: "",
			company: "",
		},
		business: {
			stage: "",
			region: "",
			mainOffer: "",
			idealClient: "",
		},
		services: [],
		branding: {
			hasAssets: "",
			differentiators: "",
			brandWords: [],
		},
		website: {
			primaryGoal: "",
			features: [],
			contentReadiness: "",
		},
		marketing: {
			channels: [],
			monthlyBudget: "",
		},
		project: {
			budget: 0,
			timeline: "normal",
			complexity: "medium",
			selectedAddons: [],
			estimatedTotal: 0,
		},
	};
}

export function buildPhaseProgress(currentPhase: Phase): PhaseProgress[] {
	return ONBOARDING_PHASES.map((phase) => ({
		...phase,
		status:
			phase.id < currentPhase
				? "completed"
				: phase.id === currentPhase
					? "active"
					: "pending",
	}));
}
