# Story Engine v2 — Briefs #2 and #3, end to end

Goal: viewers know what they're watching within 8 seconds. Every video gets one hero with a goal, one clear question, a reveal, a proof and a real payoff. Brief #3 overrides Brief #2 wherever they disagree.

## 1. Research stage (before any script)
- **Anchor extractor:** gets the year/era, place, organisation, subject noun (factory, ship…) and stakes word (war, bombers, storm…). The writer must use all five in the first 8 seconds.
- **Premise + impossible question:** "This video is about WHO who ODD ACTION because HIDDEN REASON", plus one question of 10 words or fewer that a stranger understands. A topic is rejected if its odd action can't be drawn in one picture. The user then sees "Pick a more visual topic."
- **Payoff finder:** finds one strong real consequence or twist for the ending. Endings about something not happening are banned.
- **Fact stage (kept, made stricter):** 5–8 sourced claims. Every number in the hook must be one of the checked claims. Disputed claims get careful wording ("no attack is documented").
- **Money shot:** one picture that sums up the video, e.g. the fake street above and the factory below.
- **Topic score:** the 5 tests are reworded to match Brief #2 §7 (one-image oddity, surprising reason, household analogy, proof shot, two sources). Pass mark stays 18/25.

## 2. Hook (first 3 seconds)
- 10 hooks across the 5 types. Each hook is 8–12 words with a concrete subject, an odd action or number, and a place or time.
- Banned openings: "A [job] knocks…", "Did you know", "Imagine", riddles, greetings, joke setups, anything that needs later context.
- On-screen hook text: 6 words max, states the oddity as a fact, never repeats the spoken line, and sits at the top of the frame, away from faces.
- The first picture is a wide shot of the odd thing, never a face close-up. The runner-up hook is saved for A/B testing.

## 3. Script writer (Brief #2 §9 prompt)
- Six-part skeleton: hook, context, question + try #1, two try-fail-adapt rounds that each get bigger, myth-bust, reveal + analogy + proof, payoff.
- **Length:** about 2.6 words per second. That's ~165 words for 65s and scales with the chosen length; it fits Atlas's 153 wpm.
- **Beat sheet fields:** beat, start, end, words, purpose, loop opened, loop closed, literal visual, camera move.
- **Cast:** one hero with a stated goal, 3 recurring roles max. Each character is named or given a role the first time they appear.
- **Sentences:** 3–12 words, complete, present tense, one new fact or reversal each. A re-hook every 6–8s. The kid-level words and sound words stay.
- **Ending:** the last line answers the opening question using its own words, then loops back to the first image.
- **Few-shot examples:** a small benchmark library with the storm-oil script (success) and the fake-city script (failure), each with its validator results attached, plus the gold rewrite template.

## 4. Blocking validators (V1–V10 + Brief #2 checks)
V1 anchors by 8s · V2 one main question by 8s · V3 every pronoun has a named referent · V4 opening framing answered in the final 8s · V5 no ending on an absence · V6 hero's goal stated by 10s and hero in at least 60% of beats · V7 stakes by 8s and one escalation before 30s · V8 new info in every sentence · V9 myth-reality beat between 40% and 60% · V10 money shot by 10s and again at the payoff.
Also: Clarity Clock (3s/8s/15s), open-loop registry (main question closes at 65–75%, every loop closes), cast limit, read-aloud coherence, and the existing hard-word and sentence checks.
Each failure gives a specific message. A failed script gets up to 2 repair rewrites that are told exactly which checks failed.

## 5. Visual planner
- Every sentence's picture must show its main noun or action literally. A literalness check (AI judge) rejects mismatches, and those scenes get rewritten.
- **Shot mix:** at least 40% wide/aerial, about 30% action, about 20% macro/process, 30% face close-ups max. Shots last 2–4s, each with a named camera move (push-in, pan, orbit, top-down) that the renderer follows.
- **Process shots** for how-it-works topics. The money shot appears twice.
- **Colour per beat with a story reason:** setup bright, tension dark/cold, reveal warm, payoff high contrast.
- **Continuity gate:** after each picture is made, an AI vision check compares it to the character sheet. Pictures below the threshold are redrawn once.

## 6. Captions and sound
- 1–3 words per caption card. Yellow emphasis only on nouns, numbers and twist words.
- Pre-reveal pause of 0.3–0.5s (kept). Sound effects for event words (knock, rustle, plane overhead, impact, siren and more) plus a music lift at the payoff. Final silence is trimmed to 0.3s max. The ~6 LU dynamic range is kept.

## 7. QA gate (85/100)
- **Three blind AI judges:** A sees the first 3s of script and shot list (needs 3 of 4 right), B sees the first 15s (needs all 4), C sees the full script (fails if the question is unanswered).
- Together with the validators, these make up a new score out of 100.
- **Under 85:** the script is rewritten automatically, before any pictures or voice, so no credits are wasted. If it's still under 85, the video is still made but marked "Not ready to publish" in My videos with the reasons. (This replaces the earlier warning at 80.)

## 8. Analytics loop
- Each video stores its hook type, reveal time, cast size, shot mix and judge results.
- 3s hold, 30s retention, completion and replays need YouTube channel data. I'll add empty fields plus a manual "enter stats" box in My videos. The weekly template re-ranking uses whatever data has been entered. It runs in the background and changes nothing until stats exist.

## 9. Testing and delivery
- Unit tests for every validator, using the two real scripts from Brief #3: the failure script must fail V1/V2/V3/V5, and the gold rewrite must pass.
- Judge the gold rewrite with Passes A/B/C. It needs 85+ to become a template.
- Full end-to-end 60s Short on "The Fake City That Hid A War Factory", then watch frames plus a transcript check. I'll keep fixing and re-running until it scores 85+ and the clarity checks pass.
- To get the test video into your dashboard, I'll save the finished file to your Files and you add it with Import video. The test runs in my own browser, so it can't appear in yours by itself.

## Technical details
- New `src/lib/story-v2.ts` (validators V1–V10, clarity clock, loop registry, shot mix, few-shot library) and `src/test/story-v2.test.ts`.
- `pipeline.functions.ts`: new `researchAnchors` (anchors + premise + payoff + money shot), `judgeScript` (passes A/B/C + read-aloud + literalness, one call with strict JSON), `checkContinuity` (gpt-5 vision vs character sheet). The hook and plan prompts are rewritten to the Brief #2 §9 system prompt and the beat-sheet schema gets the new fields.
- `pipeline.ts`: research → hooks → plan → validators + judge → up to 2 repairs → images + continuity gate → voice → render.
- `renderer.ts`: 1–3 word caption cards, the hook text placed at the top, per-shot camera moves, a bigger sound-word map, payoff music lift, end-silence trim.
- `quality.ts`: the QA score is rebuilt on the 85 gate. `store.ts`/`videos.tsx`: "Not ready" badge, judge breakdown, analytics fields.
- Update `AGENTS.md` and the viral-formula memory.
