# apps/api/src/agents — Life Assistant agent layer

Plain TypeScript classes, framework-agnostic. Nest (Ibrat) wraps them; no Nest imports here.

## Run the demo (live LLM)

```bash
pnpm install                                  # from repo root
npx tsx apps/api/src/agents/demo.ts           # Claude Agent SDK (default)
LLM_MODE=cli npx tsx apps/api/src/agents/demo.ts   # fallback: `claude -p --output-format json`
```
Needs: logged-in `claude` CLI (Claude Max, no API key). Optional `CLAUDE_PATH` = path to the claude binary.
Embeddings: `EMBED_URL` (default `http://127.0.0.1:8766`), only `POST /embed` is used — never `/add`.

Scenario: "Ertaga kechqurun 18:00 ga 6 kishilik osh joy band qil, keyin Chilonzordagi servisga…" →
parser (haiku) → 2 tasks → 2 parallel negotiations (sonnet) → final offers `proposed` → `confirm()` →
auditor + memory (haiku). ~35–40 s total, 13 LLM calls, ~4–9 s per call.

## Deps (root package.json)
- `@anthropic-ai/claude-agent-sdk` (ESM-only — Nest CJS build needs Node ≥ 22.12 for `require(esm)`, or switch `LlmClient` to `mode: 'cli'`)
- dev: `tsx`, `typescript`, `@types/node`

## Files
| File | What |
|---|---|
| `llm/llm-client.ts` | `complete({system,prompt,model,json})` → `{text,ms}`; no tools, maxTurns 1, no settings/hooks; every call → `saveLlmCall` |
| `embed/embed-client.ts` | `EmbedClient.embed(texts)` → 1024-dim vectors; `cosine`, `topK` |
| `policy-guard.ts` | sync rules: catalog-only, `total = price×qty×(1−d)`, `d ≤ maxDiscountPct`, ≤3 rounds; Telegram: no first msg to unknown peer, 20/min per account, autopilot only in hours (Asia/Tashkent) |
| `business-agent.ts` | LLM → `{reply, offer?, confidence}`; totals computed in code, violation → repair (clamp) + `PolicyViolation` |
| `personal-agent.ts` | `parse(text)` → tasks; `findBusinesses(task)`; `decide()` accept/counter/reject |
| `negotiator.ts` | `run()` A2A ≤3 rounds, `onEvent(sessionId, NegotiationEvent)`; `confirm(offerId)` / `decline()` |
| `auditor.ts` | post-session review → `AuditFinding[]` |
| `memory.ts` | `extract()` facts → `MemoryFact`; `contextFor(userId)` |
| `store/` | `AgentStore` interface + `MemoryStore` (3 demo businesses, `isDemo`, 8 golden cases each in `golden-seed.ts`) |
| `loop/evaluator.ts` | golden-set eval: business agent (sonnet) on every `GoldenCase` → deterministic price/policy check → haiku judge; score 0..1 |
| `loop/loop-engine.ts` | `run()` / `approve()` / `reject()` / `rollback()` — self-improvement with human approval |
| `shared.ts` | single re-export of `@botir/shared` (relative path until apps/api has its package.json) |

Money: no payment code here. `confirm()` only marks the offer `accepted`; Nest creates Order + TezCheck link (incoming only).

## Loop engineering

```bash
npx tsx apps/api/src/agents/loop/demo-loop.ts      # ~2–3 min, ~50 LLM calls
```
Flow (nothing changes agent behaviour until the owner calls `approve()`):
1. `AuditFinding`s (Auditor, now with `id` + `businessId`) incl. `not_found` → `loopEngine.run(businessId)`.
2. haiku proposes ≤3 `Proposal`s: `prompt` (rule for the agent), `catalog` (missing item — price is never invented, owner sets it), `faq` (answer template with `[egasi to'ldiradi]`).
3. `prompt` proposals: `Evaluator` runs the golden set **before** (active version) and **after** (active + change), concurrency 3.
   Per case: business agent reply → deterministic checks (every money number must be a catalog price/multiple or the code-computed total; guard violations fail) → haiku judge `{reason, pass}` against `expected` / `forbidden`.
   `after > before` → `pending` with `evalBefore/evalAfter`; otherwise auto-`rejected`. `catalog`/`faq` → `pending` without eval.
4. `approve(id)`: `prompt`/`faq` → new `PromptVersion` (status `active`, previous → `superseded`); `catalog` → only `approved` (owner adds the product).
   `reject(id)`; `rollback(businessId)`: active → `rolled_back`, previous `superseded` → `active` (none → base prompt).
5. `BusinessAgent.respond()` appends the active `PromptVersion.extraInstructions` to its system prompt (read from the store each turn); the evaluator passes `extraInstructions` explicitly.

New store methods: `getAuditFindings`, `getGoldenCases`, `getPromptVersions`/`savePromptVersion`, `getProposals`/`getProposal`/`saveProposal`.
Live run (Chilonzor Osh Markazi, 3 synthetic findings): baseline 6/8 (75%) → "katalogda yo'q taom → mavjud dema, narx aytma, xodimga ula" 8/8 (100%) → approved as v1 → rollback → base.
Judge is an LLM: ±1 case noise between runs is normal; for the dashboard, show both scores and the per-case reasons.

## Nest wiring (sketch)

```ts
// agents.module.ts
export const AGENTS = Symbol('AGENTS');
@Module({
  providers: [
    PrismaAgentStore,                                   // implements AgentStore over Prisma
    { provide: AGENTS, inject: [PrismaAgentStore],
      useFactory: (store: AgentStore) => createAgents({ store, logger: new Logger('Agents') }) },
  ],
  exports: [AGENTS],
})
export class AgentsModule {}

// negotiations.controller.ts
@Controller('negotiations')
export class NegotiationsController {
  private readonly streams = new Map<string, Subject<MessageEvent>>();
  constructor(@Inject(AGENTS) private readonly agents: Agents) {}

  @Post()
  async start(@Body() dto: { businessId: string; request: string }, @Req() req: AuthedRequest) {
    const sessionId = randomUUID();                     // or Prisma NegotiationSession.id
    const subject = new Subject<MessageEvent>();
    this.streams.set(sessionId, subject);
    const [task] = await this.agents.personalAgent.parse(dto.request);
    const business = /* load AgentBusiness by dto.businessId */;
    void this.agents.negotiator
      .run({ sessionId, userId: req.user.id, business, task, lang: detectLang(dto.request),
             onEvent: (_id, e) => subject.next({ data: e }) })
      .then(async (r) => {
        subject.complete();
        await this.agents.auditor.review({ sessionId, transcript: r.transcript, products: /*…*/, maxDiscountPct: business.maxDiscountPct });
        await this.agents.memory.extract({ userId: r.userId, sessionId, userText: dto.request, transcript: r.transcript });
      });
    return { ok: true, data: { id: sessionId } };
  }

  @Sse(':id/stream')
  stream(@Param('id') id: string): Observable<MessageEvent> {
    return this.streams.get(id)?.asObservable() ?? EMPTY;
  }
}
```
Note: the web should open the SSE stream right after POST; events emitted before subscribe are lost
(use `ReplaySubject` if that is a problem). `POST /offers/:id/accept` → `negotiator.confirm(id)` → Order + payUrl.
