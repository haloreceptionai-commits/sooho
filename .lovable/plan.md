# Advanced Video AI v2: stronger story, simpler words, characters that act

## What the test video showed (checked against the saved test video)
- **Length ignored.** You asked for 12 seconds and got 106 words (~37 s). The limit for that length is 39 words.
- **Weak script, little rewriting.** It scored 81/100 and still had problems: two lines added nothing new, three lines read awkwardly aloud, and the first scene didn't show what was said. This model only gets 1 rewrite (Own cartoon gets 3).
- **Main character in too few scenes.** The lead was in only 45% of scenes (the target is 60%+), so there was no one to follow.
- **The pig was missing.** Painted cards only cover the human cast, so animals and key objects from the script have no picture.
- **Painted characters barely move.** Cards only sway and squash. They can't point, lift, wave, talk or change their face, so the action words in the script are lost.
- **Voice:** both models already use the same Shorts voice (Casual). Nothing to change there; the narration sounds bad because of the script, not the voice.

## What I will fix

### 1. Story that keeps viewers watching
- Reuse Own cartoon's full script engine with 3 rewrites (up from 1), plus a stricter "ready" check: no filler lines, no awkward read-aloud lines, and every scene must show what is said.
- Fit the word count to the length: about 2.5 words per second, enforced before any money is spent on voice or pictures. 12 s = ~30 words; 60 s = ~150 words.
- Story shape for every Short:
  - Hook in the first 2 seconds.
  - A clear question by 5 seconds.
  - A new surprise every 3–4 seconds.
  - A twist or payoff near the end.
  - A last line that loops back to the first.
- One main character in at least 60% of scenes, named early, wanting something.
- A "keep watching" judge reads the script like a viewer and flags any line where it would swipe away. Flagged lines get rewritten.

### 2. Words an 8-year-old understands
- Every script is written with everyday words: short sentences (4–12 words), no hard words like "boundary", "dispute" or "escalate". It says "line between two countries", "fight", "got worse".
- A word checker scores every line against a list of common kid-level words. Rare words are swapped or briefly explained. Names and places from the story are allowed.
- Hard words also trip up the voice, so this makes the narration clearer too.

### 3. Every character and object in the script appears on screen
- A "who and what is in this story" step lists every person, animal and key object the narrator names (pig, rifle, potato patch, ships).
- People and animals get painted cards: up to 4 characters instead of 3, with animals allowed.
- Objects use a matching 3D model from the library when one exists, and a painted object card when none fits.
- A check makes sure each named thing is visible in the scene where it's spoken.

### 4. Characters that move and act
- Each character is painted in a few poses (standing, pointing/reaching, surprised, happy), all matching the same design so they look like one character.
- The renderer switches pose with the action and expression for each scene.
- Talking characters bounce in time with the words.
- Walking and running characters move with steps, hops, leans and turns.
- Every existing camera move, shot type and effect is kept for Advanced Video AI and checked on a test frame.

### 5. A more real-looking 3D look
- Softer shadows, warmer light and stronger blur on backgrounds, plus soft shading on the painted cards so they sit in the light instead of looking pasted on.
- Small details stay in your guide's style (bold ink outlines, rich colour).

### 6. Speed (from the last test)
- Skip the preview pictures that nobody reviews. That saved step took 3½ minutes.
- Paint all cards and poses at the same time as the voice is recorded.

## How I'll check it (no guessing)
- Tests for: word count vs length, the kid-level word checker, "every named thing appears", and pose switching.
- Local frame renders of every pose, action and camera move before rebuilding Azure.
- Then a real 12-second Pig War Short and a 60-second Short. I'll report the word count, word-difficulty score, story score, whether each named character and object appears, and the timing of each stage, and save both in My videos.

## Technical details
- Script: `pipeline.ts` (repair tries 3 for `advanced`, word budget from `durationSec`), `story-v2.ts` (shared language rule plus a new readability validator), and a new `src/lib/plain-words.ts` (common-word list, with story names and places whitelisted).
- Cast and objects: `designAdvancedCardsOperation` gets a full cast/object list (cast up to 4, `kind: person|animal|object`). The cast schema max goes up in `cartoon-job.ts`, `validate-manifest.mjs` and `vocabulary.json` stays unchanged. Object cards become a new prop kind `card` with id, validated like library assets.
- Poses: `paintAdvancedCardOperation` uses the first card as an image reference (multipart edit) to paint the pose variants `stand|reach|shock|happy`, saved as `card-<id>-<pose>.png`. `cardUrls` becomes per pose, and the worker store and watchdog re-signing are extended.
- Renderer: `drawCard` picks a pose from the action/expression, adds talk-bounce from the word timings, and adds a gradient light pass. The grade gets small adjustments for Advanced only.
- Preflight: for `manifest.advanced`, skip capturing the review sheets and post a review with no sheets that is auto-approved (callback and review schema updated for that case).
- Rebuild the Azure images with `tools/azure-build.mjs`, publish, then run the two test videos.
