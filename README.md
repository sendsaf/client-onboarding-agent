# Client Onboarding Agent

AI-powered client intake for service businesses. The app collects basic lead details, guides prospects through project discovery, and stores structured onboarding conversations for follow-up.

## What It Does

- Runs as a Cloudflare Worker with a React chat UI served from Worker assets.
- Uses Cloudflare Workers AI through a Durable Object agent.
- Stores lead profiles, messages, and structured discovery state in Cloudflare D1.
- Guides users through service discovery, brand goals, website goals, marketing intent, budget, and timeline.
- Keeps the assistant scoped to configured services, pricing, and contact details.

## Tech Stack

- Cloudflare Workers
- Cloudflare Workers AI
- Cloudflare Durable Objects
- Cloudflare D1
- Agents SDK
- React
- TypeScript
- Vite

## Project Structure

```text
public/
  app.tsx          React chat experience
  index.html      Worker asset entry point
  styles.css      App styling
src/
  agent.ts        Durable Object onboarding agent
  index.ts        Worker routes and API handlers
  prompts.ts      Prompt, service, and guardrail content
  test-agent.ts   Local-only smoke-test agent
  types.ts        Worker binding types
scripts/
  test-wrangler.mjs
  test-curl.sh
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

Update `wrangler.jsonc` with your D1 `database_id`. Add your production route only when you are ready to deploy.

For local development, apply the same schema to Wrangler's local D1 state:

```bash
npx wrangler d1 execute client-onboarding-agent-db --local --file=schema.sql
```

Generate Worker types:

```bash
npm run cf-typegen
```

## Development

```bash
npm run dev
```

The Worker runs locally at `http://localhost:8787`. Workers AI calls use the Cloudflare account authenticated through Wrangler.

## Deployment

```bash
npm run deploy
```

Before deploying a public copy, replace the placeholder D1 id in `wrangler.jsonc` and add the production route for your Cloudflare zone.

## Public Repo Notes

This repository is safe to showcase as a project codebase after configuring your own Cloudflare resources. Do not commit `.dev.vars`, `.env`, `.wrangler`, local database state, or production-only Wrangler overrides.

The app intentionally does not expose a public "load chat history by email" endpoint. Saved conversations contain client contact details and should only be accessed through authenticated internal tooling.
