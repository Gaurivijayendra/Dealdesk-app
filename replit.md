# DealDesk

DealDesk is a job-assignment prototype for small Indian B2B sales teams: persistent INR quotes, deterministic discount approvals, public client acceptance, and a remote MCP connector.

## Non-negotiable product constraints

- **No AI inside the app.** Do not add AI SDKs, models, embeddings, LLM integrations, or AI API keys. Claude is the user's external client and calls the MCP server.
- The official MCP TypeScript SDK is a protocol dependency, not an AI provider. Maintain stateless Streamable HTTP at the exact public path `/mcp`, with no OAuth for this demo.
- Use Replit PostgreSQL for persistence. Do not replace it with browser storage or in-memory quote storage.
- Volopay is **simulated**. Never call a real payment provider or imply that funds were moved. All simulated UI must say “Simulated”.
- The fixed demo account and simulated role switch are explicitly requested. This is not production identity or authorization for real customer data.
- Keep the permanent footer: “No AI inside — Claude does the thinking, DealDesk does the rest.”
- The UI uses the specified white/cool-slate/navy/emerald/amber/red palette, Bricolage Grotesque headings, Public Sans body, Indian currency formatting, and the signature margin meter.

## Run & operate

- API managed workflow: `artifacts/api-server: API Server`.
- Web managed workflow: `artifacts/dealdesk: web`.
- `pnpm run typecheck` checks the workspace.
- `pnpm test` runs the quote calculation and HTTP regression suite.
- `pnpm --filter @workspace/api-server run test:unit` runs without PostgreSQL or credentials.
- `pnpm --filter @workspace/api-server run test:integration` runs real HTTP/session/transaction tests using `DATABASE_URL` for a **development/test** PostgreSQL database. Each run creates a uniquely named private schema, resets only its own tables, and drops the schema on completion; it never migrates, seeds, or truncates application tables. The database role needs schema creation permission. Missing database configuration fails explicitly rather than skipping tests. Do not run against production.
- `pnpm --filter @workspace/api-spec run codegen` regenerates the shared API contract.
- `pnpm --filter @workspace/db run push` applies development schema changes.
- Publish manages production schema changes. Do not add startup-time DDL.
- Initial seed is DML-only, runs once when the quote table is empty, and contains eight clearly simulated fictional scenarios.

## Source of truth

- API: `lib/api-spec/openapi.yaml`, generated client and Zod schemas.
- Persistence schema: `lib/db/src/schema/dealdesk.ts`.
- Quote calculations, approvals and transactions: `artifacts/api-server/src/lib/dealdesk.ts`.
- Demo sessions: `artifacts/api-server/src/lib/session.ts`.
- HTTP routes: `artifacts/api-server/src/routes/dealdesk.ts`.
- MCP tools/transport: `artifacts/api-server/src/mcp.ts`.
- Frontend: `artifacts/dealdesk/src`.

## Important behavior

- Prices are INR before taxes. Annual prepaid multiplies monthly catalog products by 12 and bills onboarding once.
- Policy uses the greater of explicit discount and effective discount against catalog list prices. Reducing unit prices cannot bypass discount bands.
- Floor checks use each line's net unit price after discount, not an aggregate average.
- Increased discounts reset approval; editing a sent quote revokes its old client token; accepted quotes are immutable.
- Policy updates re-evaluate unaccepted quotes and revoke previous approval/client links where needed.
- Quote writes and acceptance use database transactions and serialization; version checks prevent stale updates.
- The public unauthenticated MCP demo allows reading and creating fictional quote data. Do not enter real confidential client data.
- A stable Claude connector needs the published HTTPS domain followed by `/mcp`. Preview functionality does not mean the project has been published.
