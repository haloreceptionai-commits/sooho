<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->
- Video records sync to the cloud `videos` table (jsonb `data`) and files to the private `videos` bucket under `<user_id>/`; localStorage/IndexedDB are only caches; no DELETE policy or delete UI exists; why: the owner's library must survive any browser and never lose videos.
- Access: single owner account, public signup disabled; all pages live under `_authenticated/` and every server fn uses requireSupabaseAuth; why: private dashboard that spends paid AI credits.
- Pipeline: browser orchestration generates script/media then checkpoints private assets and submits one Apify hosted Actor; hosted-renderer/prepare.ts bundles the unchanged canvas renderer for that Actor. It assembles with Atlas pacing/captions/music/foley and uploads directly to private storage; token-scoped callbacks complete the cloud record. Why: preserve the approved edit while assembly survives browser closure; pre-assembly generation still needs an open browser.
- Hosted assembly: render_jobs has a unique video claim, expiring hashed per-job capabilities, atomic cancellation/completion, and twice-hourly SQL expiry reconciliation; a database trigger prevents browser snapshots overwriting service-owned videos. Callback traffic targets the published app, since editor previews require viewer access. Never automatically resubmit ambiguous/failed runs or expose owner sessions/API keys to the Actor; why: prevent duplicate spend, endless crashed jobs, and stale completion writes.
- App navigation is / (create), /remix, /script-writer, /videos and /settings; Script Writer reuses authenticated fact/research/hook/plan/judge calls without starting media generation, so production scripts can be exported to other platforms without video spend.
- Topic archetypes and viral scoring live in src/lib/viral-brain.ts; why: shared by the create page and pipeline prompts.
- The sourced topic catalog is bundled separately from scoring; unused suggestions combine paginated authenticated cloud history with live local jobs, and stable topic IDs travel with video inputs; why: repeat prevention survives browsers and title changes without losing failed-topic retries.
- New narration uses the Atlas narrator (Gemini Charon via Lovable AI speech) at the owner's request; Azure OpenAI has no voice cloning and no speech deployment. Existing checkpointed takes remain reusable; the renderer retains format-specific pacing; why: owner chose the approved Atlas sound over Azure billing.
- Optional motion engines: Gemini Omni retains its existing clip adapter; Seedance uses authenticated submit/status functions with cloud-saved scene/voice checkpoints, job IDs and private clips. Manual Resume polls existing IDs, never auto-restarts or silently substitutes stills; why: paid motion jobs must survive reload without duplicate generation.
- Own cartoon worker sources stay isolated under hosted-renderer/cartoon; new jobs run as on-demand Azure Container Apps Jobs (Consumption, scale-to-zero; preflight 1 replica, render 10 replicas claiming frame batches via private Blob), while previews saved by the old Apify Actor still finish there; why: owner's Azure credits, zero idle cost, parallel speed; only supported Shorts enter its explicit owner-review gate, while legacy Own, Omni and Seedance remain unchanged; why: prevent regressions and stop unsupported scenes before spending.
- Cartoon jobs accept only the versioned declarative manifest (v1/v2), never generated JavaScript; the Visual Director, app schemas and worker validator share hosted-renderer/cartoon/vocabulary.json, and any new prop/action/world must be drawable before it is added there; why: the AI can only request what the engine renders, and validation precedes isolated rendering.
- Cartoon speech alignment uses hash-pinned offline CTC weights and authenticated hash-bound owner review of audio/timings/full-story sheets before full rendering; why: acoustic scores alone cannot certify word-exact reactions.
- Cartoon jobs checkpoint locked voice/manifests and checksum frame batches in a private Actor store, use rotated scoped callbacks for review versus finishing, and finalize private MP4s only after frame/audio QA; why: browser closure must not discard work or allow stale approval writes.
- Script stage (Story Engine v2) is fact-check -> research -> eligible hooks only -> beat-sheet plan -> validators + blind judges -> bounded repairs (3 cartoon, 2 others) before images/voice. Shared script-repair helpers carry full scene/cast/loop state, advance the latest draft and select readiness then fewer blockers before score; why: invalid hooks and score-only selection must not trap repairs on a broken draft.
- Cartoon object library: CC0 packs are imported by hosted-renderer/cartoon/tools/build-library.py (Kenney) and the additive tools/import-quaternius.py (FBX/glTF -> GLB, rigged clips kept and seeked per frame with skinned ink pass) into assets/library with catalog.json; manifests reference objects as prop kind "asset" + id, the worker validator rejects unknown ids, prepare-scene copies only used files, and the Director sees only a per-story keyword shortlist (src/lib/object-library.ts); why: thousands of objects without bloating prompts or allowing invented ids.
- Browser-stage videos save the approved script (scriptCheckpoint) and each paid image/voice take under <user>/<video>/media/ as soon as made; Resume reuses them; why: a closed or reloaded page must not repay for finished work.
- Cloud progress uses update freshness rather than this tab's presence to infer inactivity; only actively orchestrated local jobs override cloud snapshots, and stale status is display-only; why: a second browser must not falsely declare another tab's generation interrupted.
