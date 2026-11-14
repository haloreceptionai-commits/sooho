# Benchmark scorecard (Advanced Video AI, plan step 1)

Measures a finished Short the same way as the two benchmark Shorts ("How Mine Salting Worked",
"How One Cart Stopped an Entire Army") so every later step is judged by numbers, not by eye alone.

```
python3 measure.py <video.mp4> <name> <outdir>        # shots, keyframes, sharpness, motion, captions, loudness
python3 vision.py <outdir>/<name>.measure.json        # Azure vision labels per shot (needs AZURE_OPENAI_API_KEY)
python3 report.py <outdir> mine,cart <ours,...> results   # results/report.md + scorecard.json + shot lists
python3 test_benchmark.py
```

- `transcripts/<name>.txt` supplies the exact narration; caption OCR only anchors word times.
- `anchors/high.jpg` (benchmark shot) and `anchors/low.jpg` (flat cut-out scene) fix the 0–10 scale for every run.
- Target = benchmark average; a render reaches benchmark level at an overall score of 90 or more.
- Sound-hit density is information only until step 8 measures sync from our own stems.
