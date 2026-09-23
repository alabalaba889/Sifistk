# Sifistk 10.1.0 — AI Core

## Implemented in this branch
- Versioned AI Core runtime contract.
- Shared task state and operational truth statuses.
- Agent/provider adapter contract.
- Orchestrator with simple/critical/complex cost policy.
- Evidence-based proposals; no agent voting.
- Permission gate and confirmation for sensitive operations.
- Bounded audit log.
- Server-side provider adapters for OpenAI, Gemini and Claude.
- Explicit NOT_AVAILABLE/FAILED states when credentials or providers are unavailable.
- 400-item traceability scaffold. Each item must be mapped to a real requirement and evidence before merge.

## Provider facts
OpenAI's current Responses API is the recommended new primitive for agentic integrations and supports tools such as web search and file search. Gemini's current documentation recommends its Interactions API for new agentic projects while the generateContent API remains supported. Anthropic exposes the Messages API for Claude. Provider credentials remain server-side.

## Important integration gate
The GitHub branch started from the checked-in repository state, which was 9.0.2, while the user's confirmed working baseline is 10.1.0. This branch now sets the package and extension version to 10.1.0 and adds the AI Core layer, but it is NOT proof that every local 10.1.0 file has been synchronized. Merge only after the real local 10.1.0 source is reconciled and all tests pass.

## Trio behavior
- simple: one provider may be used.
- critical/complex: all configured providers are queried.
- unavailable providers are recorded as NOT_AVAILABLE, never fabricated.
- proposals contain evidence/limitations/uncertainty.
- the orchestrator compares evidence; it does not use majority voting.
