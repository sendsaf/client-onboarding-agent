# Client Onboarding Agent

AI-powered client intake workspace for service businesses. It collects lead details, guides prospects through project discovery, builds a live structured brief, and lets an internal team review leads from a token-protected admin dashboard.

## Features

- First-run intake for name, email, mobile, and optional company.
- Three-pane onboarding workspace with phase timeline, chat, option chips, live brief, and proposal panel.
- Mobile tab layout for Chat, Brief, and Proposal.
- Durable Object agent built with the Agents SDK and Workers AI.
- Structured extraction with `generateObject` and `zod` after each user message.
- D1 persistence for leads, messages, structured brief state, proposal artifacts, and lead status.
- Admin dashboard at `/admin`, protected with `Authorization: Bearer <ADMIN_TOKEN>`.
- No public history-by-email endpoint; client history is treated as internal data.

## Tech Stack

- Cloudflare Workers
- Cloudflare Workers AI
- Cloudflare Durable Objects
- Cloudflare D1
- Agents SDK
- React
- TypeScript
- Vite
- Tailwind CSS

## Project Structure

```text
public/
  app.tsx          Client workspace and admin dashboard
  index.html      Worker asset entry point
  styles.css      Tailwind entry
src/
  agent.ts        Durable Object onboarding agent
  index.ts        Worker routes, RPC allowlist, and admin APIs
  prompts.ts      Generic service profile and assistant prompts
  shared.ts       Shared brief, proposal, phase, and snapshot types
  test-agent.ts   Local-only smoke-test agent
  types.ts        Worker binding types
schema.sql        D1 schema
wrangler.jsonc    Cloudflare Worker configuration
```

## Setup

Install dependencies:

```bash
npm install
```

Create a D1 database and apply the schema:

```bash
npx wrangler d1 create client-onboarding-agent-db
npx wrangler d1 execute client-onboarding-agent-db --file=schema.sql
```

Update `wrangler.jsonc` with your D1 `database_id`.

Set the admin token before deployment:

```bash
npx wrangler secret put ADMIN_TOKEN
```

For local development, apply the same schema to Wrangler's local D1 state:

```bash
npx wrangler d1 execute client-onboarding-agent-db --local --file=schema.sql
```

Generate Worker types when bindings change:

```bash
npm run cf-typegen
```

## Development

```bash
npm run dev
```

The Worker runs locally at `http://localhost:8787`. Workers AI calls use the Cloudflare account authenticated through Wrangler.

Local admin testing uses `ADMIN_TOKEN` when it is configured. If no token is configured and the request is from localhost, the development fallback token is:

```text
dev-admin-token
```

Open the client workspace at `/` and the admin dashboard at `/admin`.

## API Overview

- `POST /api/chat/init` creates a conversation and initializes agent state.
- `POST /agent/OnboardingAgent/:id` supports `sendMessage`, `sendMessageRich`, `getSnapshot`, and `generateProposal`.
- `GET /api/chat/history` intentionally returns `410 Gone`.
- `GET /api/admin/leads` lists lead summaries.
- `GET /api/admin/leads/:id` returns messages, brief, proposal, and state.
- `PATCH /api/admin/leads/:id` updates lead status.

Admin APIs require:

```http
Authorization: Bearer <ADMIN_TOKEN>
```

## Verification

```bash
npm run check
npm audit --omit=dev --audit-level=high
```

For local D1 testing:

```bash
npx wrangler d1 execute client-onboarding-agent-db --local --file=schema.sql
```

## Deployment

```bash
npm run deploy
```

Before deploying a public copy, replace placeholder Cloudflare resource identifiers in `wrangler.jsonc`, configure `ADMIN_TOKEN`, and add your production route when ready.

## Public Repo Notes

This repository is designed to be reusable and generic. Configure your own Cloudflare resources and business profile before production use. Do not commit `.dev.vars`, `.env`, `.wrangler`, local database state, or production-only Wrangler overrides.
