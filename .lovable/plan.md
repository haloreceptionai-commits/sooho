# Upgrade the script writer to match the two example scripts

## Why our scripts feel weak (side-by-side)

| What the examples do | What our last script (rail gaps) did |
|---|---|
| Hook is a contradiction in about 10 words: "A gift with no battery spied on America for seven years." | Hook explains the answer straight away: "Track crews left gaps because hot steel rails grow longer..." Nothing left to wonder about. |
| Story told in the present tense, as if it is happening now ("Rome just has to wait.") | Textbook past tense, like a lesson. |
| Short stacked lines, 3-12 words, one idea each. Fragments allowed ("No wires. No battery. Nothing.") | Long sentences with two or three ideas and definitions inside ("Sleepers, the cross pieces, and the stone bed called ballast..."). |
| A new open question every 8-10 seconds, sometimes one word ("How?"). Answer held back. | No open questions. Every fact arrives with its explanation. |
| Stakes and an opponent: someone is trapped or someone is listening. | No people, no stakes, no danger shown. |
| A payoff line that makes you feel the twist ("That's exactly what he wanted.", "The signal itself was the power.") | Ends on a neat summary ("the new method solves it by holding them steady"). |
| Last line echoes the hook so the video loops ("America had hung the spy on its own wall."). | Ending doesn't connect back to the start. |

The main cause is in our own rules: they force things the examples never do. Every script must have a hero's want, a rival, a place and year in the hook, two try-fail rounds, and the question by word 20. Meeting those quotas adds filler and kills the rhythm.

## What will change

1. **New story shape**, used for every Short (Own images, Own cartoon, Advanced):
   ```text
   Hook: contradiction, 8-12 words, answer hidden
   Setup: who / where / the trap, in 2-4 short present-tense lines
   Pressure: "Nothing found" / "Rome just has to wait"
   Loop: a held-back question ("How?" or "a plan that sounds insane")
   Reveal: step-by-step, one visible action per line
   Payoff line: the twist in under 8 words
   Close: one line that echoes the hook
   ```
2. **Your two scripts become the gold examples** the writer and the judges are shown, replacing the current examples.
3. **Remove the quotas that fight this shape**: no forced year/place in the hook, no forced rival or try-fail rounds, no forced question by word 20. Facts must still be checked; nothing invented.
4. **New automatic checks** before a script is accepted:
   - hook is a contradiction and does not give away the answer
   - most lines are 3-12 words, present tense for story scenes
   - an open question at least every 10 seconds, each answered later
   - a short payoff line exists near the end
   - last line echoes the hook's key words
5. **Blind judges score against your examples**: "Is this as gripping as the Theremin seal script?" Scripts below the bar get repaired (same repair limits as today).
6. **Proof before switching on**: run the system on 3 topics (including the rail gaps one), share the raw voice-over scripts here next to the old versions, and keep the old style as a fallback until you approve.

Unchanged: fact checking, topic finder, voices, pictures, renderer, saved videos.

## Technical details
- Prompts: `src/lib/pipeline-operations.server.ts` (hook generator, planner, ADVANCED override, repair priority), `src/lib/script-repair.ts`, `src/lib/advanced-story.ts`.
- Validators: `src/lib/story-v2.ts` (hook rules, new loop-spacing, line-length, payoff and echo checks), `src/lib/viral-brain.ts` scoring.
- Shared policy so browser and coordinator paths agree (`generation-script.server.ts`, `pipeline.ts`).
- Tests: add cases in the existing story-v2 tests using both example scripts (must pass) and the rail script (must fail hook, loop and echo checks).
- Script Writer page uses the same pipeline, so it improves too.
