"""Script-conditioned CTC Viterbi alignment. Never falls back to syllable timing.
Emissions must come from a locally pinned acoustic model, not an LLM.
"""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np

def align_ctc(log_probs, tokens, blank=0):
    p = np.asarray(log_probs, dtype=np.float64)
    if p.ndim != 2 or not p.size or not np.isfinite(p).all() or not tokens:
        raise ValueError('Invalid acoustic emissions or empty transcript')
    if any(not isinstance(t,int) or t == blank or t < 0 or t >= p.shape[1] for t in tokens):
        raise ValueError('Unsupported transcript token')
    states = [blank]
    for t in tokens: states.extend([t,blank])
    count=len(states); back=np.full((len(p),count),-1,dtype=np.int32)
    previous=np.full(count,-np.inf); previous[0]=p[0,blank]; previous[1]=p[0,tokens[0]]
    for frame in range(1,len(p)):
        current=np.full(count,-np.inf)
        for s,token in enumerate(states):
            choices=[s]
            if s>0: choices.append(s-1)
            if s>1 and token != blank and token != states[s-2]: choices.append(s-2)
            best=max(choices,key=lambda x:previous[x])
            current[s]=previous[best]+p[frame,token]; back[frame,s]=best
        previous=current
    state=max([count-1,count-2],key=lambda s:previous[s])
    if not np.isfinite(previous[state]): raise ValueError('Transcript cannot fit acoustic timeline')
    path=[]
    for frame in range(len(p)-1,-1,-1):
        path.append(state)
        if frame: state=int(back[frame,state])
    path=path[::-1]; output=[]
    for i,token in enumerate(tokens):
        frames=[f for f,s in enumerate(path) if s==2*i+1]
        if not frames: raise ValueError('Unaligned transcript token')
        confidence=float(np.exp(np.mean(p[frames,token])))
        output.append({'start_frame':frames[0],'end_frame':frames[-1]+1,'confidence':confidence})
    return output

def align_words(emissions, transcript, vocabulary, duration, blank=0, threshold=.9):
    words=transcript.upper().split()
    if not words or not np.isfinite(duration) or duration<=0: raise ValueError('Empty or silent input')
    # Spoken numbers are mandatory; punctuation is stripped, never guessed.
    import re
    clean=[re.sub(r"[^A-Z']",'',w) for w in words]
    if any(not w for w in clean) or re.search(r'\d',transcript): raise ValueError('Write numbers as spoken words')
    tokens=[]; ranges=[]
    for i,w in enumerate(clean):
        if i:
            if '|' not in vocabulary: raise ValueError('Model lacks word separator')
            tokens.append(vocabulary['|'])
        start=len(tokens)
        for c in w:
            if c not in vocabulary: raise ValueError('Unsupported transcript character')
            tokens.append(vocabulary[c])
        ranges.append((start,len(tokens)))
    aligned=align_ctc(emissions,tokens,blank); seconds=duration/len(emissions); result=[]
    for text,(a,b) in zip(clean,ranges):
        segment=aligned[a:b]; confidence=min(t['confidence'] for t in segment)
        result.append({'text':text.lower(),'start':segment[0]['start_frame']*seconds,'end':segment[-1]['end_frame']*seconds,'confidence':confidence})
    return {'words':result,'review_required':any(w['confidence']<threshold for w in result),'source':'script-conditioned-ctc','duration':duration}

if __name__ == '__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--emissions',required=True); parser.add_argument('--script',required=True)
    parser.add_argument('--vocabulary',required=True); parser.add_argument('--duration',type=float,required=True); parser.add_argument('--out',required=True)
    args=parser.parse_args()
    result=align_words(np.load(args.emissions,allow_pickle=False),Path(args.script).read_text(),json.loads(Path(args.vocabulary).read_text()),args.duration)
    result['emission_sha256']=hashlib.sha256(Path(args.emissions).read_bytes()).hexdigest()
    Path(args.out).write_text(json.dumps(result,indent=2))
    if result['review_required']: raise SystemExit('Alignment requires review; generation stopped')