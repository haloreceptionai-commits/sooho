# Long-form "Ink Explainer" videos on the Own model

Goal: long-form videos that look like the Ink Explainer channel. That means hand-drawn stick-figure scenes, a narrator talking over them, a new picture every few seconds, and bold yellow-text thumbnails. They should be made much faster by doing the slow steps at the same time. At the end I make and review a 2-minute test video.

## What the examples show

- **One recurring hero.** A round-headed stick figure with a big white face, dot eyes, a small mouth, a blue t-shirt and jeans. He looks exactly the same in every picture. He reacts to everything: worried, amazed, running, falling, sleeping.
- **Two kinds of picture:**
  1. *Full scenes*: flat-colour cartoon rooms or landscapes (living room, kitchen, desert, cave, bedroom) with thin black ink outlines, soft muted colours and simple props. The story's era changes the cast (cave people in furs, a sabre-tooth cat).
  2. *White idea cards*: plain white background with a single hand-lettered idea, like "3 BILLION YEARS AGO" on a timeline, "BACK ✗ / FORWARD ✓" arrows, an hourglass with "2 MINUTES LEFT", or "NIGHT OWL?" with a small owl.
- **Lettering.** Text is hand-lettered capitals, short (1–4 words), dark or red, never long sentences.
- **Pacing.** A new picture roughly every 4–6 seconds, with gentle push-in or slide moves so it never feels frozen.
- **Thumbnails.** One big close-up character with an exaggerated expression in a bright scene, plus 1–3 huge words in yellow with a thick black outline, often ending in "?" (for example "STILL SURVIVED?", "NO JOBS", "FIRST GUN?").

## What changes

1. **New "Ink explainer" art style.** It becomes the default for long-form on the Own model. Every picture prompt carries the same style rules and a fixed description of the hero.
2. **Same hero every time.** Before any scene is drawn, one reference sheet of the hero is made and saved. Every scene picture uses it as a reference, so he never changes face or clothes. The cast for each story's era (cave people, kings, soldiers) is described once and reused.
3. **Script that drives pictures.**
   - The long-form writer splits narration into beats of about 4–6 seconds.
   - Each beat is marked as a *scene* or a *card*.
   - About 1 in 4 or 5 beats are cards, used for numbers, dates, choices, questions and countdowns.
   - Each scene gets a short "what the hero does + where + one key prop" description taken straight from the sentence, so the picture matches what is being said.
   - The existing retention rules stay as they are: hook, chapter questions, midpoint twist.
4. **Exact text on cards.** The AI picture model misspells words. So cards get a simple drawn element (owl, hourglass, arrow, timeline) from the picture model, and the words are added afterwards in a hand-lettered font. This uses the same exact-text approach already used for thumbnail badges.
5. **Motion that matches the channel.** Gentle push-ins, slides and small shakes on surprise words. Cards pop in quickly. Short hand-drawn transitions sit between chapters. Captions are off by default in long-form, like the reference.
6. **Ink Explainer thumbnails.** Two thumbnail options per video:
   - A close-up of the hero with a strong expression in a bright scene.
   - 1–3 word hook text drawn in yellow with a thick black outline (exact spelling).
   - A pick-one step before uploading to YouTube, as with today's publish dialog.
7. **Much faster generation.**
   - Pictures are drawn many at a time (about 8 at once instead of 2), with automatic slow-down if Azure says "too busy".
   - Narration chunks are recorded at the same time as pictures, instead of after them.
   - Every finished picture and narration chunk is saved the moment it's made, so a reload never pays twice.
   - Pictures use a smaller, cheaper size for scenes that are on screen only briefly.
   - For the final video, a 10-minute long-form is split into chapters. The chapters are assembled at the same time on Azure's on-demand machines (no cost when idle), then joined into one MP4. The current single-machine Apify assembly remains a fallback.
8. **Safety rails kept.** Shorts, cartoon, Omni and Seedance stay unchanged. Every paid job is still saved before it starts and is never resubmitted on its own. The voice stays Atlas.

## Test at the end

- Make a real 2-minute long-form video in the new style on a simple topic (for example "What did ancient humans do all night?").
- Check it frame by frame:
  - Does the hero look the same in every scene?
  - Is every card spelled correctly?
  - Is there a picture change every 4–6 seconds?
  - Does the voice match the pictures, and are the sound levels good?
- Report the measured time per stage (script, pictures, voice, assembly) and the total cost estimate.
- Make both thumbnail options for the test video and review them.
- Fix whatever the test shows, then re-run the affected part.

## Questions answered by assumption (tell me if wrong)

- "Our own image model" means our existing Azure picture model (gpt-image-1-mini) driven by the Own model's stills-plus-motion pipeline. It does not mean training a new model.
- The blue-shirt hero is a generic look inspired by the reference, not a copy of the channel's mascot or logo. The reference's small corner logo is not reproduced.

## Technical details

- `src/lib/styles.ts`: add an `Ink explainer` anchor with a fixed hero description and a negative list (no 3D, no gradients, no photoreal). Make it the default when the format is long and the engine is own.
- `src/lib/pipeline.ts` (long, own branch):
  - Raise the image `pool` limit from 2 to a configurable 8, with 429 `Retry-After` backoff and per-scene checkpoints (these already exist).
  - Run voice groups concurrently with images.
  - Generate the hero reference sheet first and pass it as `reference` to every scene.
- `src/lib/pipeline-operations.server.ts`: the long-form plan schema gets `kind: 'scene' | 'card'`, `cardText` (≤4 words) and `cardIcon`. Extend validators to cover beat length (4–6 s), the card ratio and card word limits.
- New `src/lib/ink-card.ts`: composes white cards in the browser canvas (icon image plus hand-lettered font text via a `<link>` web font). The result is uploaded as the scene still, so the renderer is unchanged.
- `src/lib/thumbnail-text.ts` / `src/components/youtube.tsx`: add an "ink" layout with huge yellow text, a thick black stroke and an optional "?"; the hero close-up prompt goes to `thumbnailImageOperation`.
- Renderer (`hosted-renderer/renderer.js` via `prepare.ts`): add a long-form "ink" motion preset (push or slide, a pop for cards, a surprise shake) and chapter-range rendering (`fromScene`/`toScene`).
- New Azure job `chronicle-longform-render`: Consumption profile, N replicas, one chapter each into private Blob. The last replica joins them with ffmpeg concat (no re-encode), runs loudness QA and uploads to the existing generation-output path. Callbacks reuse the token-scoped `render-callback`.
- Tests: card text limits, beat-length validator, ink thumbnail text layout, chapter split/merge timing, and the concurrency pool backing off on 429.
