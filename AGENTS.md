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
- Video metadata + settings live in a client store (src/lib/store.ts, localStorage); finished video files live in IndexedDB (src/lib/video-db.ts); why: no backend database yet and video blobs exceed localStorage.
- Pipeline: server fns in src/lib/pipeline.functions.ts call Azure via the connector gateway (script, images; voice falls back to Lovable AI when no Azure speech deployment); src/lib/pipeline.ts orchestrates in the browser and src/lib/renderer.ts assembles video with canvas + MediaRecorder (fast-cut shots, WSOLA speed-up to target length, synthesized music/foley); a character sheet image is generated first and passed to Azure image edits for cast consistency; why: Workers cannot run Python/FFmpeg and no text-to-video is allowed.
- App has exactly 3 pages: / (create), /videos (library), /settings; why: user wants a minimal UI with the rest running in the background.
- Topic archetypes and viral scoring live in src/lib/viral-brain.ts; why: shared by the create page and pipeline prompts.
- Video narration is fixed to the Atlas narrator (Gemini Charon, direction in generateVoice); the renderer fits each take to ATLAS_WPM with per-beat rates and a pre-reveal pause; why: the user approved that exact sound and pace and removed voice pickers.
- Optional "Gemini Omni" engine (src/lib/clips.functions.ts): server fns start/poll google/gemini-omni-1.1-flash image-to-video jobs per ~8s scene run, the browser keeps clips in memory and the renderer draws them muted under narration; failed clips fall back to animated stills; why: user wanted real motion as an opt-in beside the own stills engine.
- Script stage is fact-check -> 10 scored hooks -> beat-sheet plan, checked by src/lib/quality.ts (validator, topic 5-tests, caption emphasis, QA score) with one repair rewrite; why: follows the user's pipeline brief and keeps rules unit-testable.
