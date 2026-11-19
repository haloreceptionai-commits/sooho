"""Pinned offline acoustic emissions; no runtime weight downloads."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
import numpy as np
import torch
import torchaudio
from alignment import align_words
from acoustic_windows import acoustic_emissions

def infer(audio, weights, transcript, output):
    lock=json.loads(Path(__file__).with_name('acoustic-model.json').read_text())
    if torch.__version__!=lock['torch'] or torchaudio.__version__!=lock['torchaudio']:
        raise ValueError('Acoustic runtime version differs from lock')
    if hashlib.sha256(weights.read_bytes()).hexdigest()!=lock['sha256']:
        raise ValueError('Acoustic model checksum mismatch')
    raw=subprocess.run(['ffmpeg','-v','error','-i',str(audio),'-f','f32le','-ar','16000','-ac','1','-'],check=True,capture_output=True).stdout
    waveform=np.frombuffer(raw,dtype='<f4').copy()
    if len(waveform)<400 or not np.isfinite(waveform).all() or np.sqrt(np.mean(waveform**2))<1e-5:
        raise ValueError('Silent or invalid narration')
    torch.set_num_threads(2)
    bundle=torchaudio.pipelines.WAV2VEC2_ASR_BASE_960H
    # Build the published bundle architecture, then load only the hash-checked local state.
    model=torchaudio.models.wav2vec2_base(aux_num_out=len(bundle.get_labels()))
    state=torch.load(weights,map_location='cpu',weights_only=True)
    # The official bundle removes fairseq's three unused special labels.
    keep=[i for i in range(32) if i not in (1,2,3)]
    state['aux.weight']=state['aux.weight'][keep]
    state['aux.bias']=state['aux.bias'][keep]
    model.load_state_dict(state);model.eval()
    def predict(samples):
        with torch.inference_mode():
            logits,_=model(torch.from_numpy(samples)[None,:])
            return torch.log_softmax(logits[0],dim=-1).numpy()
    emissions=acoustic_emissions(waveform,predict)
    output.mkdir(parents=True,exist_ok=True)
    np.save(output/'emissions.npy',emissions)
    vocabulary={label:i for i,label in enumerate(bundle.get_labels())}
    duration=len(waveform)/16000
    result=align_words(emissions,transcript,vocabulary,duration,frame_step=.02,frame_offset=.0125)
    result.update({'model_sha256':lock['sha256'],'audio_sha256':hashlib.sha256(audio.read_bytes()).hexdigest(),
                   'calibration_required':True,'review_required':True,
                   'review_reason':'CTC scores are uncalibrated; word timing must pass audio review before paid rendering'})
    (output/'alignment.json').write_text(json.dumps(result,indent=2))
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--audio',required=True);p.add_argument('--weights',required=True);p.add_argument('--script',required=True);p.add_argument('--out',required=True)
    a=p.parse_args();r=infer(Path(a.audio),Path(a.weights),Path(a.script).read_text(),Path(a.out))
    print(json.dumps({'words':len(r['words']),'duration':r['duration'],'review_required':r['review_required']}))