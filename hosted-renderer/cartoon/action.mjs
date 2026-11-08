export function actionState(action, frame, start, end) {
  if (!Number.isInteger(frame) || end <= start) throw Error('Invalid action clock');
  const t=Math.max(0,Math.min(1,(frame-start)/(end-start)));
  const smooth=x=>x*x*x*(x*(x*6-15)+10);
  // Anticipation, modest overshoot, then a bounded settle; pure frame function.
  const lift=t<.15?-.08*smooth(t/.15):t<.7?1.08*smooth((t-.15)/.55):1+.08*Math.exp(-(t-.7)*15)*Math.cos((t-.7)*30);
  return {progress:Math.max(0,Math.min(1,lift)),lift:Math.max(0,Math.min(1,lift)),t};
}