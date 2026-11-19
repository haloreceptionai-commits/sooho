"""Local worker workflow over an immutable, owner-reviewed manifest.
Hosted job reservation/capabilities are a separate release gate, not simulated.
"""
import argparse
import hashlib
import json
import subprocess
import sys
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import numpy as np
from capture import atomic_json, fingerprint
from stems import synthesize
import sound_lib
from mix import mix_stems, read_pcm

def jsround(x):
    # Match JavaScript Math.round so frame counts agree with the scene validator (106.5 -> 107).
    import math
    return math.floor(x+0.5)


ROOT=Path(__file__).resolve().parent

def run(*args):
    subprocess.run(list(args),check=True)

def file_hash(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    p=argparse.ArgumentParser();p.add_argument('--manifest',required=True);p.add_argument('--voice',required=True)
    p.add_argument('--work',required=True);p.add_argument('--mode',choices=['preflight','finish'],required=True)
    p.add_argument('--twist-frame',type=int,required=True)
    a=p.parse_args();manifest=Path(a.manifest).resolve();voice=Path(a.voice).resolve();work=Path(a.work).resolve()
    if work==ROOT or ROOT in work.parents: raise ValueError('Use scratch work outside source')
    m=json.loads(manifest.read_text());work.mkdir(parents=True,exist_ok=True)
    if file_hash(voice)!=m['narration']['sha256']: raise ValueError('Locked narration checksum changed')
    signature=hashlib.sha256((file_hash(manifest)+file_hash(voice)).encode()).hexdigest()
    state_path=work/'workflow.json'
    state=json.loads(state_path.read_text()) if state_path.exists() else {'input_hash':signature,'stages':{}}
    if state['input_hash']!=signature: raise ValueError('Immutable job inputs changed')
    def stage(name):
        state['stage']=name;atomic_json(state_path,state)
        if (work/'CANCEL').exists(): raise ValueError('Cancelled')
    prepared=work/'prepared';frames=work/'frames'
    stage('prepare')
    if not state['stages'].get('prepared'):
        run('node',str(ROOT/'prepare-scene.mjs'),str(manifest),str(prepared))
        state['stages']['prepared']=fingerprint(prepared/'web');atomic_json(state_path,state)
    elif fingerprint(prepared/'web')!=state['stages']['prepared']: raise ValueError('Prepared engine changed')
    total=jsround(m['narration']['samples']/48000*30)
    if a.mode=='preflight':
        import importlib.util
        spec=importlib.util.spec_from_file_location('sheet_tool',ROOT/'contact-sheet.py')
        if spec is None or spec.loader is None: raise ValueError('Missing sheet utility')
        sheet_tool=importlib.util.module_from_spec(spec);spec.loader.exec_module(sheet_tool)
        stage('preflight')
        selected=sheet_tool.preflight_frames(m['shots'],m['words'],total)
        # Advanced Video AI has no owner review: one real frame proves the scene loads, then the full render starts.
        if any(c.get('card') for c in m['cast']): selected=selected[len(selected)//2:len(selected)//2+1]
        lanes=max(1,min(2,int(os.environ.get('CARTOON_PARALLEL','1'))))
        def capture_lane(lane):
            subset=selected[lane::lanes]
            if not subset: return
            folder=work/f'preview-{lane}'
            run(sys.executable,str(ROOT/'capture.py'),'--web',str(prepared/'web'),'--out',str(folder),'--first','0','--last',str(total-1),'--selected',','.join(map(str,subset)))
            frames.mkdir(parents=True,exist_ok=True)
            for f in subset:
                (folder/f'f{f:06d}.jpg').replace(frames/f'f{f:06d}.jpg')
        with ThreadPoolExecutor(max_workers=lanes) as executor:
            list(executor.map(capture_lane,range(lanes)))
        run(sys.executable,str(ROOT/'contact-sheet.py'),'--frames',str(frames),'--manifest',str(manifest),'--out',str(work/'sheets'))
        stage('review_required')
        atomic_json(work/'review-request.json',{'input_hash':signature,'engine_hash':state['stages']['prepared'],'sheets':sorted(p.name for p in (work/'sheets').glob('*.jpg'))})
        return
    approval=work/'review-approved.json'
    if not approval.exists(): raise ValueError('Look review required before full render')
    reviewed=json.loads(approval.read_text())
    if reviewed.get('input_hash')!=signature or reviewed.get('engine_hash')!=state['stages']['prepared'] or reviewed.get('approved') is not True:
        raise ValueError('Review does not match immutable scene')
    stage('frames')
    # Small bounded ranges, checkpoints survive process interruption.
    run(sys.executable,str(ROOT/'capture.py'),'--web',str(prepared/'web'),'--out',str(frames),'--first','0','--last',str(total-1))
    stage('sound')
    decoded=work/'voice.wav'
    run('ffmpeg','-v','error','-y','-i',str(voice),'-ar','48000','-ac','1','-c:a','pcm_s16le',str(decoded))
    narration,rate=read_pcm(decoded)
    if len(narration)!=m['narration']['samples']: raise ValueError('Decoded narration sample clock changed')
    cues=[]
    for shot in m['shots']:
        for e in shot['events']:
            cues.append({'frame':jsround(m['words'][e['word']]['start']*30)-e['lead'],'kind':e['kind']})
    advanced=m.get('advancedEdit')==1;mood=None
    if advanced:
        # Places call for ambient beds, and the script's own words pick the music bed (the original score unless one mood clearly dominates).
        cues+=sound_lib.ambience_plan(m['shots'],jsround(len(narration)/48000*30))
        mood=sound_lib.pick_mood(' '.join(w['text'] for w in m['words']),m.get('music'))
    music,sfx=synthesize(len(narration),a.twist_frame,cues,advanced=advanced,mood=mood)
    mixed,report=mix_stems(narration,music,sfx,rate,advanced=advanced)
    report['music_mood']=mood or 'quirky'
    np.save(work/'mix.npy',mixed);atomic_json(work/'mix-report.json',report)
    stage('encode_qa')
    run(sys.executable,str(ROOT/'finish.py'),'--frames',str(frames),'--mix',str(work/'mix.npy'),'--out',str(work/'output.mp4'))
    state['output_sha256']=file_hash(work/'output.mp4');state['stages']['qa']=True;stage('local_done')

if __name__=='__main__':main()