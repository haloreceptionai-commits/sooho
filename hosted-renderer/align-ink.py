"""Align saved continuous takes acoustically; never synthesize phrase-by-phrase or guess a cut clock."""
import json
import sys
from pathlib import Path
from acoustic import infer

def scene_words(words, scenes, texts):
    expected = [w for i in scenes for w in texts[i].split()]
    if len(words) != len(expected):
        raise ValueError('Narration alignment word count differs from saved script')
    result = []
    at = 0
    for i in scenes:
        count = len(texts[i].split())
        segment = words[at:at + count]
        if not segment or any(w['end'] <= w['start'] for w in segment):
            raise ValueError('Narration alignment has an invalid spoken interval')
        result.append({'scene': i, 'words': [dict(w, text=text) for w, text in zip(segment, texts[i].split())]})
        at += count
    return result

if __name__ == '__main__':
    job = json.loads(Path(sys.argv[1]).read_text())
    output = []
    for i, take in enumerate(job['takes']):
        text = ' '.join(job['texts'][si] for si in take['scenes'])
        result = infer(Path(take['file']), Path('/opt/ink/weights.pth'), text, Path(f'/tmp/ink-align-{i}'))
        output.append(scene_words(result['words'], take['scenes'], job['texts']))
    Path(sys.argv[2]).write_text(json.dumps(output))