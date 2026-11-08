import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { approveCartoon } from '@/lib/cartoon.functions';
import { syncFromCloud, type Video } from '@/lib/store';

export function CartoonReviewPanel({ video }: { video: Video }) {
  const review = video.cartoonReview;
  const [sheets, setSheets] = useState<string[]>([]);
  const [voice, setVoice] = useState('');
  const [words, setWords] = useState<{ text: string; start: number; end: number; confidence: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const approve = useServerFn(approveCartoon);
  useEffect(() => {
    if (!review) return;
    let active = true;
    const bucket = supabase.storage.from('videos');
    const sign = async (path: string) => { const { data, error } = await bucket.createSignedUrl(path, 3600); if (error || !data) throw Error('Preview could not load'); return data.signedUrl; };
    void (async () => {
      try {
        const urls = await Promise.all(review.sheets.map(sign));
        const audio = await sign(review.voicePath);
        const { data, error } = await bucket.download(review.alignmentPath);
        if (error || !data) throw Error('Narration timing could not load');
        const alignment = JSON.parse(await data.text());
        if (active) { setSheets(urls); setVoice(audio); setWords(alignment.words); }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Preview could not load'); }
    })();
    return () => { active = false; };
  }, [review?.hash]);
  if (!review || review.approved || video.hostedRender?.status !== 'review') return null;
  const submit = async () => {
    if (!confirmed) return;
    setBusy(true);
    try { await approve({ data: { videoId: video.id, hash: review.hash } }); await syncFromCloud(); toast.success('Full cartoon rendering started'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not approve preview'); }
    finally { setBusy(false); }
  };
  return <div className="mt-4 space-y-3 border-t pt-4">
    <h3 className="text-sm font-bold">Cartoon preview · {review.duration.toFixed(1)}s</h3>
    {error && <p className="text-xs text-destructive">{error}</p>}
    {sheets.map((url, i) => <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Story preview ${i + 1}`} className="mb-2 h-auto w-full rounded border" /></a>)}
    {voice && <audio controls src={voice} className="w-full" />}
    {words.length > 0 && <div className="max-h-40 overflow-y-auto border p-2 text-xs"><table className="w-full"><thead><tr><th className="text-left">Word</th><th>Start</th><th>End</th></tr></thead><tbody>{words.map((w, i) => <tr key={i}><td className={w.confidence < .9 ? 'text-warning' : ''}>{w.text}</td><td className="text-center">{w.start.toFixed(2)}s</td><td className="text-center">{w.end.toFixed(2)}s</td></tr>)}</tbody></table></div>}
    <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={!voice || !sheets.length || !words.length} /><span>I approve the full story pictures and spoken-word timing.</span></label>
    <Button className="w-full" disabled={!confirmed || busy || Boolean(error)} onClick={submit}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve & render full video</Button>
  </div>;
}