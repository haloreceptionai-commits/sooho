# Daily workspace automation

## Current status

Settings are implemented and verified signed in: saved values read back, both formats can be selected, disabled schedules cannot spend, and the rollout guard rejects activation until production validation. UK time is always Europe/London, including BST. Generation is reserved one hour before the chosen publication time; YouTube receives a private upload with a future `publishAt`.

The new managed schedule is job **4**, `daily-video-automation`, `/api/public/automation`, static body `{}`, every minute. It is intentionally **paused**, and `AUTOMATION_ROLLOUT_ENABLED` is not `true`. The existing published site returns 404 for that route. Do not enable either without the checks below. A minute-level scheduler has 1,440 checks/day and recurring compute cost; YouTube's own scheduled publication avoids relying on the scheduler for the exact posting second. Provider processing can delay publishing, so one hour is a lead time, not a guarantee.

## Safety boundaries

- Owner-scoped configuration and one workspace/format/UK date claim; a scheduler lease and atomic database reservation prevent repeat creation.
- Existing on-demand Azure coordinator performs bounded hash-fenced paid steps. Replaying the coordinator resumes saved steps; checkpoint-yield exceptions must never invoke backup writing.
- Documentary and Advanced render paths reuse existing server operations, schemas, render claims and watchdogs. No new narration or model provider was selected.
- The finished private MP4 is uploaded in resumable chunks. Every invocation reconciles the same YouTube upload session before sending data; an uncertain session creation or missing completion confirmation pauses for review rather than creating another upload.
- Turning off clears future YouTube publication schedules and blocks subsequent upload chunks. Work that misses its posting time is not posted late automatically.
- Workspace AI pauses/failures block further automated work. Restoring access does not automatically resume a paused configuration.

## Production validation before activation

1. Publish only after the owner asks. Confirm `/api/public/automation` exists on the published site, rejects unsigned requests and accepts the managed credential without exposing it.
2. Keep job 4 paused. Use an explicit owner-approved test schedule and enabled rollout in a controlled verification window. Test one Short and one long-form video on the connected channel, keeping publication private/future while checking generation, render, read-back of the final private MP4 and YouTube upload.
3. Exercise saved-step restart, duplicate scheduler ticks, interrupted resumable upload, missing/uncertain upload confirmation, off/cancellation and credit/provider pause behavior. Never blindly repeat a paid ambiguous dispatch or start a replacement upload.
4. Confirm the scheduled YouTube ID and publication metadata read back, the correct workspace channel is used, and cancellation removes `publishAt`. Confirm the coordinator ends after upload and rendered videos survive browser closure.
5. Only after these pass: ensure `AUTOMATION_ROLLOUT_ENABLED=true`, resume managed job 4, and let the owner explicitly turn automation on in Settings. Check the next due run; disabling the owner setting must leave an idle schedule without provider calls.

## Development evidence

- Automated timing tests cover one-hour lead, winter/summer offsets, nonexistent spring time, first autumn occurrence, midnight crossings, future/missed slots and private scheduled YouTube metadata.
- Service-boundary tests cover duplicate ticks, both formats, scheduler lease, disabled/paused state, rollout guard and off-before-upload.
- Paid checkpoint tests ensure a saved step ends an invocation rather than triggering an additional paid operation.
- Signed-in browser verification saved and reloaded both formats, time and focus; activation remained blocked; desktop/mobile had no horizontal overflow or browser errors. Demonstration edits were restored to an off schedule.
- Scheduler verification: local unsigned 401, managed signed 200 with rollout blocked, malformed body 400. Production unsigned request currently 404, so live scheduled generation/upload is **not verified**.