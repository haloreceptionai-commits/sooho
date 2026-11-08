# Reliable generation from Start to saved video

## Goal and honest limits
After Start is accepted, generation must no longer depend on an open browser. Closing a tab, reloading, device sleep or losing the user's connection must not stop the job. Reopening the app shows its saved progress.

No system can guarantee that every video finishes under every condition. Exhausted credits, rejected content, unavailable providers and failed quality checks must produce an actionable pause rather than endless retries or hidden spending. Cartoon preview approval remains an intentional pause, not an interruption.

## What changes
1. **Durable Start:** save the request and claim one generation job before acknowledging Start. Repeated clicks and additional tabs return the same active job instead of starting another paid run.
2. **All steps in the background:** move facts, research, hooks, script repairs, voice, image creation, visual direction and motion polling into an on-demand Azure generation job. Reuse existing Azure cartoon rendering and hosted normal-video assembly rather than rebuilding the approved edit.
3. **Save every completed step:** checkpoint research, candidate scripts, judges, approved scripts, voice files, images, direction and provider job IDs immediately. A replacement worker reads these before doing more work.
4. **Safe recovery:** retry recoverable storage/network errors and recover known provider jobs within a bounded budget. A timeout after a paid submission is uncertain—not permission to make the same paid request again. Such cases reconcile using a provider ID where available, otherwise pause for explicit review.
5. **Accurate progress:** show queued, writing, recording, scenes, rendering, awaiting approval, recovering, paused or complete based on durable job state. No browser infers failure merely because it did not start the job.
6. **Protect existing videos:** migrate future jobs first. Recover current jobs only from saved inputs, with one explicit ownership transfer; never run both the old browser job and the new worker together.

## Preserve
- Shorts voice C (Casual/Puck), long-form Charon, existing pacing and reusable approved audio.
- Azure GPT-5 scripts and Azure image generation; no silent provider substitution.
- Story and final-media quality checks. Repair quality failures within a bounded budget; do not bypass them to manufacture a “Ready” label.
- Private cloud library, no video deletion, and the cartoon preview approval gate.
- Consumption jobs stop between videos. Storage, registry and other non-compute charges still exist; do not promise a zero total Azure bill.

## Technical design
- Add owner-readable generation jobs and step records with explicit grants/RLS, service-controlled state transitions, a unique active claim per video, versioned checkpoints, expiring leases and fencing tokens. Older workers and browser snapshots cannot overwrite newer progress or completion.
- Extract reusable implementation helpers from authenticated functions. Keep existing functions authenticated; do not call their RPC stubs from worker handlers.
- Add narrowly scoped worker endpoints under `/api/public/`, verifying hashed per-job capabilities and fencing tokens before any private read/write or paid call. Owner sessions, Azure keys and Lovable keys stay in the app; workers receive only job-specific capabilities and private asset grants.
- Run a lightweight Azure coordinator with bounded parallel media requests, separate from the ten-replica cartoon render job. Respect the six-outbound-connection limit per app invocation.
- Persist intended external submissions before sending them; record provider IDs/results immediately. Startup and expiry reconciliation distinguish a confirmed absent run from an uncertain submission. Never blindly restart an uncertain job.
- Reconcile abandoned leases through scheduled short checks, relaunching only safe resumable steps. Refresh private asset grants as needed. Add retryable completion delivery so a saved output survives a temporary callback outage.
- Scope cancel to the current generation and rendering claims. Cancellation, completion and lease takeover are atomic; stale work cannot publish a result after cancellation.
- Replace browser orchestration for new jobs with submission and read-only status polling. Preserve saved legacy checkpoints and renderer contracts for Own, cartoon, Omni and Seedance.

## Implementation and verification order
1. Job ownership, checkpoint schema and state-transition tests.
2. Shared script/media helpers and worker authorization tests.
3. On-demand coordinator, safe retry/reconciliation and existing-renderer handoff.
4. App Start/status/recovery integration and legacy-input migration.
5. Deploy worker and app endpoint changes together; external workers use the published app, not editor-only URLs.
6. Verify real signed-in runs with the browser closed during script, voice and scenes. Reopen and confirm private video completion; approve the cartoon preview intentionally before its final render.
7. Inject worker termination, transient network errors, duplicate starts, expired grants, cancellation and uncertain paid responses. Assert checkpoint reuse, no duplicate claim/submission, and rejection of stale writes.

## Acceptance criteria
- A verified job continues after browser closure at every pre-render stage.
- Worker replacement resumes completed steps without generating them again.
- Two tabs cannot own or submit the same active video concurrently.
- Saved final output is delivered after a temporary callback outage.
- Permanent/uncertain failures pause with a clear reason and retain all saved work.
- No claim of full reliability until the real interruption/recovery checks pass. The unresolved Dragon Jar script-quality issue remains separate and must be verified before calling that video ready.