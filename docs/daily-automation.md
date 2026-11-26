# Daily workspace automation

## Current status

Settings are implemented and verified signed in: saved values read back, both formats can be selected, disabled schedules cannot spend, and the rollout guard rejects activation until production validation. UK time is always Europe/London, including BST. Generation is reserved one hour before the chosen publication time; YouTube receives a private upload with a future `publishAt`.

The new managed schedule is job **4**, `daily-video-automation`, `/api/public/automation`, static body `{}`, every minute. It is intentionally **paused**, and `AUTOMATION_ROLLOUT_ENABLED` is not `true`. The published target has been verified: unsigned requests return 401, and managed authenticated requests return 200 with zero starts and the rollout block. The owner approved both private tests and publishing their update. Do not enable daily work without the checks below. A minute-level scheduler has 1,440 checks/day and recurring compute cost; YouTube's own scheduled publication avoids relying on the scheduler for the exact posting second. Provider processing can delay publishing, so one hour is a lead time, not a guarantee.

Private verification is now a distinct service-written run kind: one 30-second Advanced Short and one 3-minute documentary per workspace/UK date. The authenticated explicit `startAutomationTest` action reserves the whole run transactionally; it never changes the saved daily config. Only this kind can use infrastructure readiness without the daily rollout flag. All its YouTube uploads omit `publishAt`, remain private, and write `youtubePrivacy=private` on completion. Normal daily claims ignore private test claims, so tests never consume a day's normal posting slot. Private test failures pause only their run, not the owner's saved daily settings. Existing paused access is still respected.

## Safety boundaries

- Owner-scoped configuration and one workspace/format/UK date claim; a scheduler lease and atomic database reservation prevent repeat creation.
- Existing on-demand Azure coordinator performs bounded hash-fenced paid steps. Replaying the coordinator resumes saved steps; checkpoint-yield exceptions must never invoke backup writing.
- Documentary and Advanced render paths reuse existing server operations, schemas, render claims and watchdogs. No new narration or model provider was selected.
- The finished private MP4 is uploaded in resumable chunks. Every invocation reconciles the same YouTube upload session before sending data; an uncertain session creation or missing completion confirmation pauses for review rather than creating another upload.
- Turning off clears future YouTube publication schedules and blocks subsequent upload chunks. Work that misses its posting time is not posted late automatically.
- Workspace AI pauses/failures block further automated work. Restoring access does not automatically resume a paused configuration.

## Production validation before activation

1. Publish only after the owner asks. Confirm `/api/public/automation` exists on the published site, rejects unsigned requests and accepts the managed credential without exposing it.
2. Keep job 4 paused and daily rollout disabled. Use the owner-approved private test action in Settings. Test one Short and one long-form video on the connected channel, keeping publication strictly private while checking generation, render, read-back of the final private MP4 and YouTube upload.
3. Exercise saved-step restart, duplicate scheduler ticks, interrupted resumable upload, missing/uncertain upload confirmation, off/cancellation and credit/provider pause behavior. Never blindly repeat a paid ambiguous dispatch or start a replacement upload.
4. Confirm the scheduled YouTube ID and publication metadata read back, the correct workspace channel is used, and cancellation removes `publishAt`. Confirm the coordinator ends after upload and rendered videos survive browser closure.
5. Only after these pass: ensure `AUTOMATION_ROLLOUT_ENABLED=true`, resume managed job 4, and let the owner explicitly turn automation on in Settings. Check the next due run; disabling the owner setting must leave an idle schedule without provider calls.

## Development evidence

- Automated timing tests cover one-hour lead, winter/summer offsets, nonexistent spring time, first autumn occurrence, midnight crossings, future/missed slots and private scheduled YouTube metadata.
- Service-boundary tests cover duplicate ticks, both formats, scheduler lease, disabled/paused state, rollout guard and off-before-upload.
- Paid checkpoint tests ensure a saved step ends an invocation rather than triggering an additional paid operation.
- Signed-in browser verification saved and reloaded both formats, time and focus; activation remained blocked; desktop/mobile had no horizontal overflow or browser errors. Demonstration edits were restored to an off schedule.
- Scheduler verification: local unsigned 401, managed signed 200 with rollout blocked, malformed body 400; published unsigned 401 and managed signed 200 with zero starts. Real scheduled generation/upload is still **not verified**.

## Cross-app activation audit

- Settings display/control and authenticated save: readiness guard applies; the switch cannot show an unsaved On state while readiness is blocked. Saving Off remains available. Private verification has its own explicit action.
- Scheduler route and tick: managed caller authentication plus readiness gate; disabled/paused configs are excluded; uncertain dispatch stops the remaining batch rather than starting another format.
- Coordinator public route: trusted per-job capability, fenced job, and service-written run kind choose the gate; unmarked regular jobs cannot use the private exception. The on-demand coordinator only calls this checked route.
- Generation runner: normal runs require enabled config; private tests can run while daily settings stay off, but cannot bypass a paused workspace.
- Upload start/chunk/completion: the same run-kind rule applies; private tests never receive a future public release. Normal daily uploads preserve UK-time scheduling and off/paused checks.
- Database test reservation, daily reservation, upload claim and fenced completion: private and daily claims are separate and service-only; upload completion respects current config and never marks a private test for public posting.
- Manual Create/Resume and YouTube uploads: separate authenticated actions; no private-test flag can be supplied through normal YouTube upload input. Their existing settings and behavior are unchanged.

All places above were read in the activation-fix turn. Code-level and contract tests passed; real full generation and uploads are pending. The first two coordinator executions ended successfully with zero paid steps because the published site was still serving the earlier guard. After live deployment was confirmed, those same untouched jobs were resumed with their original scoped capabilities. Both then stopped at discovery: the old shared function required six topics although automatic creation selects one. The shared discovery mode now requires one fully verified topic for automation and still six for Find topics; source, freshness and dual-publisher checks are unchanged. Those source-count failures returned two and four verified topics but no selected checkpoint, and their executions are confirmed ended. Resolve only those exact known validation failures as failed under the six-topic version before a corrected one-topic attempt; never clear an ambiguous or provider-denied step.

The confirmed six-topic failures were retained as failed `topic/discovery-six-required` steps, and the same jobs resumed with their original capabilities after the live scheduler returned `topicTarget=1`. Both then completed discovery and moved into checkpointed script writing: Short has 12 completed steps, long-form 7 at the last check. Azure executions are `chronicle-generation-t704wyb` and `chronicle-generation-zuwqi4i`. The private tests are still running externally; no render or YouTube completion has been verified. Both daily schedules and rollout remain off. The full app suite passed 460 tests. Continue by reading these existing jobs, not by generating replacement tests.