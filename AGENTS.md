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
- App has exactly 4 pages: / (create), /remix (YouTube Short link -> Apify transcript via importShort -> new original video on the same topic), /videos (library), /settings; why: user wants a minimal UI with the rest running in the background.
- Topic archetypes and viral scoring live in src/lib/viral-brain.ts; why: shared by the create page and pipeline prompts.
- The sourced topic catalog is bundled separately from scoring; unused suggestions combine paginated authenticated cloud history with live local jobs, and stable topic IDs travel with video inputs; why: repeat prevention survives browsers and title changes without losing failed-topic retries.
- Video narration is fixed to the Atlas narrator (Gemini Charon, direction in generateVoice); the renderer fits each take to ATLAS_WPM with per-beat rates and a pre-reveal pause; why: the user approved that exact sound and pace and removed voice pickers.
- Optional motion engines: Gemini Omni retains its existing clip adapter; Seedance uses authenticated submit/status functions with cloud-saved scene/voice checkpoints, job IDs and private clips. Manual Resume polls existing IDs, never auto-restarts or silently substitutes stills; why: paid motion jobs must survive reload without duplicate generation.
- Script stage (Story Engine v2) is fact-check -> research (anchors, premise, question, hero, payoff, money shot) -> 10 hooks filtered by hook rules -> beat-sheet plan -> blocking validators in src/lib/story-v2.ts + blind AI judges (judgeScript) -> up to 2 repair rewrites, all before images/voice; images use shot-type prompts and a vision continuity gate (checkContinuity); the 85-point gate marks videos "Not ready"; why: follows the user's Briefs #2/#3 and keeps every rule unit-testable.
