# 0035 — AI layer: grounding, prompt-injection defense, quotas and chat

**Context.** Plan 9.9: executive summary, AI Security Analyst, Architecture Review, remediation,
weekly digest and the "Ask KloudRecon" chat, with guardrails, redaction, quotas and cost
tracking; `AI_MODE=mock` for tests and `AI_MODE=azure` for Azure OpenAI.

**Decision.**
- **Facts first.** Every generation is written from a fact document (`ai/facts.py`) built from
  the same services as the UI. All numbers the answer may quote are computed there (including
  percent changes and yearly savings), so the model never calculates. Citable items carry short
  refs (F1 finding, P1 attack path, S1 saving, T1 toxic combination, R1 resource) that map to
  in-app links.
- **Numbers guardrail.** Every number in the prose fields of the answer must match a number in
  the facts (normalized for separators, currency, %, k/M and rounding to 0–1 decimals; digits
  inside identifiers, versions, dates and refs are not numbers). A violation triggers one
  corrective retry; if it still fails the grounded template is used (`source=fallback`).
  CLI fields in remediation are exempt (flags come from the rule catalog). Chat answers are
  streamed, so the check runs on the final text: unverifiable numbers get a visible note.
- **Prompt injection.** Customer text is untrusted: every string is normalized (control/bidi
  characters, angle brackets, length) and strings matching instruction-like patterns are
  replaced with `[withheld: looked like instructions]` before they reach a prompt (they stay
  visible in the UI). Facts are sent inside `<data id=NONCE>` blocks the data cannot close; the
  system prompt states that nothing inside is an instruction. Outputs: unknown refs dropped,
  links outside learn.microsoft.com / Microsoft domains removed, schema validated by Pydantic.
  The chat has read-only tools only (`get_*`, `list_*`, `search_*`).
- **Redaction** (Settings → AI): names under name-like keys and every IP/CIDR are replaced with
  stable pseudonyms (`res-001`, `ip-001`) before sending; answers are mapped back. IP redaction
  is on by default, name redaction off (answers are far more useful with names).
- **Deterministic templates** (`ai/templates.py`) are both the mock model (AI_MODE=mock, so tests
  and local dev exercise the full pipeline) and the graceful fallback when Azure OpenAI fails,
  is over quota, or its answer breaks a guardrail.
- **Where it runs.** Generations run in the worker (`ai.generate`); the API stores a `pending`
  row, queues the job and the UI polls/gets an `ai.generation` SSE event. Chat runs in the API
  because it streams (SSE over POST, `flush_interval -1` in Caddy already).
- **Storage.** `ai_generations`: one row per (org, kind, subject), replaced on regenerate; cache
  key = SHA-256 of prompt versions + facts + AI settings. Remediation is keyed by
  `source:rule|resource type` and uses property *names* only, so similar findings share it.
  `ai_usage`: one row per model call (tokens, USD cost from `AI_PRICE_*` settings, latency,
  errors) for the owner console.
- **Quota.** Plan limit `ai_messages` per calendar month counts chat questions and on-demand
  generations (retries are not counted twice). Automatic per-scan summaries and the weekly digest
  are not counted. Over quota: generations fall back to the standard template, chat returns 403
  `ai_quota_exceeded`.
- **Deployments.** `main` for summary, analyst, architecture review and chat; `mini` for
  remediation and the digest. Structured output uses `response_format=json_schema`; reasoning
  deployments that reject `temperature` are retried without it.
- **Prompts** live in `ai/prompts/<name>.v<N>.md`; the highest version is used and recorded with
  each generation.
- **Weekly digest**: from Monday 07:00 UTC, once per ISO week per active org with scan data,
  emailed to active members who did not opt out (`notification_prefs.weekly_digest`).
