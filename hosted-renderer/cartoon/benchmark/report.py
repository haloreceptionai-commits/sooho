"""Write the human-readable benchmark report (shot lists + score table)."""
from __future__ import annotations
import json, sys
from pathlib import Path
import scorecard

LABELS = {
    'spoken_visible_rate': 'Picture shows what is being said', 'environment_richness': 'Built 3D sets',
    'render_quality': 'Overall render quality', 'character_quality': '3D characters posed with the action',
    'depth': 'Light, shadow and depth', 'views_per_min': 'New views per minute (cuts + camera moves)',
    'median_shot_len': 'Median shot length (s)', 'set_changes_per_min': 'Set changes per minute',
    'distinct_sets': 'Different places shown', 'shot_type_variety': 'Shot-type variety (0-1)',
    'object_insert_share': 'Object close-up share', 'action_rate': 'Shots with a real action',
    'effects_per_min': 'Effects per minute', 'moving_camera_share': 'Moving-camera share',
    'lighting_variety': 'Lighting looks used', 'sharpness': 'Sharpness (540x960)', 'transients_per_min': 'Sound hits per minute',
}


def shot_list(v: dict) -> str:
    rows = ['| # | Time | Len | Type | Camera | Set | Objects | Action | Effects | Shows words? | Spoken |', '|' + '---|' * 11]
    for s, l in zip(v['measure']['shots'], v['vision']):
        if 'error' in l:
            rows.append(f"| {s['i']} | {s['start']} | {s['len']} | (not labelled: {l['error'][:40]}) |||||||| {s['words']} |"); continue
        rows.append(f"| {s['i']} | {s['start']} | {s['len']} | {l['shot_type']} | {l['camera']} | {l['set']} | {', '.join(l['objects'][:5])} | "
                    f"{l['action']} | {', '.join(l['effects'])} | {l['spoken_visible']} | {s['words']} |")
    return '\n'.join(rows)


def main(outdir: Path, bench: list[str], ours: list[str], dest: Path):
    vids = {n: scorecard.load(outdir, n) for n in bench + ours}
    tgt = scorecard.targets([vids[n]['metrics'] for n in bench])
    scores = {n: scorecard.score(vids[n]['metrics'], tgt) for n in vids}
    names = list(vids)
    md = ['# Advanced Video AI benchmark scorecard', '',
          f"Benchmarks: {', '.join(bench)}. Ours: {', '.join(ours)}. Target = benchmark average; 100 = benchmark level.", '',
          '| Measure | Target | ' + ' | '.join(names) + ' |', '|---|---|' + '---|' * len(names),
          '| **Overall score** | 100 | ' + ' | '.join(f"**{scores[n]['overall']}**" for n in names) + ' |']
    for k, _, _ in scorecard.WEIGHTS:
        md.append(f"| {LABELS[k]} | {tgt[k]} | " + ' | '.join(str(vids[n]['metrics'][k]) for n in names) + ' |')
    md.append('| Loudness (LUFS) | -14 | ' + ' | '.join(str(vids[n]['metrics']['lufs']) for n in names) + ' |')
    md.append('| Speaking rate (wpm) | — | ' + ' | '.join(str(vids[n]['measure'].get('wpm')) for n in names) + ' |')
    for n in names:
        md += ['', f'## Shot list: {n} ({vids[n]["metrics"]["duration"]}s, {vids[n]["metrics"]["shots"]} shots)', '', shot_list(vids[n])]
    dest.mkdir(parents=True, exist_ok=True)
    (dest / 'report.md').write_text('\n'.join(md) + '\n')
    (dest / 'scorecard.json').write_text(json.dumps({'targets': tgt, 'videos': {n: {**vids[n]['metrics'], 'score': scores[n]} for n in names}}, indent=1))
    for n in names:   # labels kept for later comparisons; local frame paths dropped
        shots = [{k: v for k, v in s.items() if k != 'keyframe'} for s in vids[n]['measure']['shots']]
        (dest / f'{n}.shots.json').write_text(json.dumps({'shots': shots, 'labels': vids[n]['vision'], 'words': vids[n]['measure']['words']}, indent=1))
    print({n: scores[n]['overall'] for n in names})


if __name__ == '__main__':
    main(Path(sys.argv[1]), sys.argv[2].split(','), sys.argv[3].split(','), Path(sys.argv[4]))
