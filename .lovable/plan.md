# Step 8: Sound timed to the picture (Advanced Video AI test engine)

Goal: every visible hit, explosion, footstep, cheer and object action makes a matching sound at the exact frame it happens. The narration stays untouched, and the final loudness lands at -14 LUFS (plus or minus 1), the YouTube level used by the benchmarks. Your live video creation stays unchanged.

## What gets built

1. **Sound cue list made from the shot plan.** No AI guessing is involved. Each effect start, object action (fire, explode, break, pour, roll), character action (run, swing, fall, cheer) and camera shake becomes a timed cue. Every cue is locked to the frame where the motion peaks, computed from the same motion rules the picture uses.
2. **A larger free-licence sound library.** It adds explosion, debris, sparks, fire crackle, crowd cheer and murmur, metal clank, rail creak, whoosh for fast camera swings, rock and pickaxe, coins and gunshot sounds. Each has its free-licence source recorded and is checked against a fixed fingerprint, and it is bundled into the renderer so nothing downloads mid-render. The existing six sounds stay.
3. **Room and distance feel.** Mine shots get a short tunnel echo and outdoor shots stay dry. Sounds fade with camera distance and pan left or right with screen position.
4. **Mix that protects the voice.** Music and effects dip under speech, using the existing narration-safe ducking, and the speech samples are never altered. One final loudness pass with a peak limit then lands the whole video at -14 LUFS, plus or minus 1.
5. **Checks:**
   - automatic tests that every cue lands within one frame of its motion peak, that the voice audio is unchanged, and that loudness and peaks stay in range;
   - a blind listening review: rendered test clips (the step-7 mine explosion and crowd shots, plus a mine dialogue shot), each judged on whether the sounds match what is seen.

## Done when

- Every cue sits within 1 frame (33 ms) of its motion peak.
- The voice audio is unchanged.
- Loudness is -14 ±1 LUFS with peaks at or below -1 dBTP.
- The blind review passes all three test clips.

## Technical details

- New pure module `hosted-renderer/cartoon/blender/sound_cues.py`. It reads compiled shots and uses `effects.py`, `object_motion.py` and `character_motion.py` timing to produce cues as data, with tests in `test_sound_cues.py`.
- Sounds go in `hosted-renderer/cartoon/assets/sound` with entries in `provenance.json`, materialized at image build as the existing ones are.
- Mixing extends the existing `mix.py` / `finish.py`, keeping `mix_stems(..., advanced=True)` ducking and the explicit gain-then-limiter loudness path. Tunnel echo comes from a short convolution or ffmpeg `aecho`.
- Test clips render on the Azure Blender job as MP4 with audio, using a new `SHOT=sound-*` mode in `entry.sh`.
- Step 9 (clear drawable scripts) and step 10 (three 60-second videos plus your review) follow, one per "next". Your asset ideas A, B and C come after step 10.
