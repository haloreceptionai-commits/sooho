"""Validated frame encoding; never truncates narration with -shortest.
Input: frame checkpoint and a pre-master float mix with 48kHz sample rate.
"""
import argparse
import json
import subprocess
from pathlib import Path
import numpy as np
from capture import valid_frame

def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout

def validate_frames(folder, total):
    saved = json.loads((folder / 'checkpoint.json').read_text())
    for frame in range(total):
        file = folder / f'f{frame:06d}.jpg'
        if not valid_frame(file, saved['frames'].get(str(frame))):
            raise ValueError(f'Missing or corrupt frame {frame}')
    if any(int(k) >= total for k in saved['frames']):
        raise ValueError('Unexpected trailing frames')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--frames', required=True); parser.add_argument('--mix', required=True)
    parser.add_argument('--sample-rate', type=int, default=48000); parser.add_argument('--out', required=True)
    args = parser.parse_args()
    mixed = np.load(args.mix, allow_pickle=False)
    if mixed.ndim != 2 or mixed.shape[1] not in (1, 2) or not mixed.size or not np.isfinite(mixed).all():
        raise ValueError('Invalid float audio')
    if args.sample_rate != 48000: raise ValueError('Expected 48kHz mix')
    duration = len(mixed) / args.sample_rate
    total = max(1, int(np.floor(duration * 30 + 0.5)))
    folder, out = Path(args.frames), Path(args.out)
    validate_frames(folder, total)
    out.parent.mkdir(parents=True, exist_ok=True)
    raw = out.with_suffix('.f32'); raw.write_bytes(mixed.astype('<f4').tobytes())
    audio_in = ['-f', 'f32le', '-ar', '48000', '-ac', str(mixed.shape[1]), '-i', str(raw)]
    measure = subprocess.run(['ffmpeg', '-hide_banner', *audio_in, '-af', 'loudnorm=I=-14:TP=-1:LRA=50:print_format=json', '-f', 'null', '-'], check=True, capture_output=True, text=True).stderr
    begin = measure.rfind('{'); end = measure.rfind('}')
    loudness = json.loads(measure[begin:end + 1])
    integrated = float(loudness['input_i'])
    if not np.isfinite(integrated): raise ValueError('Mix loudness cannot be measured')
    gain_db = -14 - integrated
    # Explicit common gain followed by peak limiter; no loudnorm in actual encode.
    # Oversampled limiting leaves codec reconstruction headroom; validate AAC true peak, not just PCM sample peak.
    tmp = out.with_name(out.stem + '.partial.mp4')
    try:
        # The peak limiter lowers loudness on punchy mixes, so measure the encoded file and correct the gain (max 3 passes).
        for attempt in range(3):
            audio_filter = f'volume={gain_db}dB,aresample=192000,alimiter=limit=0.707945784:level=false:latency=true,aresample=48000'
            run(['ffmpeg', '-v', 'error', '-y', '-framerate', '30', '-i', str(folder / 'f%06d.jpg'), *audio_in,
                 '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
                 '-af', audio_filter, '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(tmp)])
            probe = json.loads(run(['ffprobe', '-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', str(tmp)]))
            video = next(s for s in probe['streams'] if s['codec_type'] == 'video')
            if (video['width'], video['height'], video['r_frame_rate'], int(video['nb_read_frames'])) != (1080, 1920, '30/1', total):
                raise ValueError('Encoded frame contract failed')
            audio = next(s for s in probe['streams'] if s['codec_type'] == 'audio')
            if float(audio.get('duration', 0)) + 0.03 < duration: raise ValueError('Narration was truncated')
            qa = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(tmp), '-vf', 'freezedetect=n=0.0005:d=0.4,blackdetect=d=0.05',
                                 '-af', 'loudnorm=I=-14:TP=-1:LRA=50:print_format=json', '-f', 'null', '-'], check=True, capture_output=True, text=True).stderr
            final = json.loads(qa[qa.rfind('{'):qa.rfind('}') + 1])
            miss = -14 - float(final['input_i'])
            if abs(miss) <= 0.5 or attempt == 2: break
            gain_db += miss
        warnings = [line.strip() for line in qa.splitlines() if 'freeze_start' in line or 'black_start' in line]
        report = {'frame_count': total, 'audio_samples': len(mixed), 'duration': duration, 'gain_db': gain_db,
                  'loudness': final, 'review_required': bool(warnings) or abs(float(final['input_i']) + 14) > 1.5 or float(final['input_tp']) > -0.5,
                  'warnings': warnings, 'probe': probe}
        out.with_suffix('.qa.json').write_text(json.dumps(report, indent=2))
        if report['review_required']: raise ValueError('Encoded output requires QA review; not ready')
        tmp.replace(out)
    finally: raw.unlink(missing_ok=True)

if __name__ == '__main__': main()