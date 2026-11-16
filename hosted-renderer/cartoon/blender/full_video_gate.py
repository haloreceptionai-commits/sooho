"""Fail-closed step-10 release checklist for the isolated Blender test suite.

No provisioning, dispatch or production setting is changed here. Missing real evidence
is a blocker, not a default pass. Evidence comes from measured full renders, not plans.
"""
import json
import math
from pathlib import Path

STORIES = ('rail', 'battle', 'mine')
RECOVERY = ('browser_closed', 'worker_crash', 'ambiguous_start', 'cancelled', 'lost_callback')


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def video_errors(name, evidence):
    errors = []
    def require(condition, message):
        if not condition: errors.append(f'{name}: {message}')
    require(evidence.get('script_accepted') is True, 'script blind review not accepted')
    require(evidence.get('timing_source') == 'script-conditioned-ctc', 'real speech alignment required')
    require(evidence.get('alignment_reviewed') is True, 'word timing review missing')
    duration = evidence.get('duration')
    require(finite(duration) and abs(duration - 60) <= 1 / 30, 'measured 60-second Short required')
    require(evidence.get('size') == [1080, 1920], 'full 1080x1920 render required')
    require(evidence.get('fps') == 30 and evidence.get('decoded_frames') == 1800,
            'all 1800 motion frames must decode')
    require(evidence.get('all_frames_verified') is True, 'per-frame geometry and output QA missing')
    require(evidence.get('voice_samples_unchanged') is True, 'voice clock preservation not verified')
    sync = evidence.get('max_sound_error_frames')
    require(finite(sync) and 0 <= sync <= 1, 'every sound must be within one frame')
    lufs, peak = evidence.get('lufs'), evidence.get('true_peak')
    require(finite(lufs) and abs(lufs + 14) <= 1 and finite(peak) and peak <= -1,
            '-14 ±1 LUFS and ≤-1 dBTP required')
    score = evidence.get('scorecard', {})
    require(finite(score.get('overall')) and score['overall'] >= 100
            and bool(score.get('parts')) and all(finite(v) and v >= 100 for v in score['parts'].values()),
            'actual benchmark scorecard parity required in every dimension')
    require(evidence.get('blind_motion_review_passed') is True, 'full-video visual/audio review missing')
    require(evidence.get('private_output_readback') is True, 'saved private video readback missing')
    seconds = evidence.get('elapsed_seconds')
    require(finite(seconds) and 0 < seconds <= 900, 'measured completion within 15 minutes required')
    return errors


def release_errors(audit):
    errors = []
    for name in STORIES:
        errors.extend(video_errors(name, audit.get('videos', {}).get(name, {})))
    if audit.get('prerequisites_accepted') is not True:
        errors.append('Earlier visual and crowd-sound acceptance gates remain open')
    for case in RECOVERY:
        result = audit.get('recovery', {}).get(case, {})
        if result.get('passed') is not True or result.get('real_execution') is not True:
            errors.append(f'Real Blender recovery check missing: {case}')
    if audit.get('owner_approved') is not True:
        errors.append('Owner must review and approve all three final videos before launch')
    return errors


def current_report(root):
    root = Path(root)
    audit = {'production_enabled': False, 'owner_approved': False,
             'prerequisites_accepted': False, 'videos': {}, 'recovery': {}}
    for name in STORIES:
        script = root / 'full-tests' / name / 'script-audit.json'
        if script.exists():
            report = json.loads(script.read_text())
            audit['videos'][name] = {'script_accepted': report['accepted'],
                                     'script_attempt': report['attempt']}
    audit['blockers'] = release_errors(audit)
    audit['accepted'] = not audit['blockers']
    return audit


if __name__ == '__main__':
    root = Path(__file__).parent
    report = current_report(root)
    (root / 'full-tests' / 'release-audit.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({'accepted': report['accepted'], 'blockers': len(report['blockers']),
                      'production_enabled': False}))