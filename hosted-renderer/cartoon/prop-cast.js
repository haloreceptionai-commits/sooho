// Appended in the same lexical module as the pinned Pen and cast helpers.
export function propCharacter(p, outfit, opts) {
  const propAction = opts.action === 'lift' || opts.action === 'pour';
  if (!propAction) { romanFront(p,outfit,opts); return; }
  const pose = opts.action === 'lift' ? 'lift' : 'reach';
  const clean = {...opts,tilt:0,R:pose};
  romanFront(p,outfit,clean);
  const H=headBlob(opts.seed,118,0),HH=2*H.b,W=2*H.a,u=W/100;
  const torsoBot=975-1.38*HH-(opts.bob||0)*HH;
  const chin=torsoBot-1.08*HH;
  const ta=(.4*W)/1.06;
  const shoulderY=chin+.12*HH;
  const lift=opts.lift||0;
  const handX=300+ta*1.1+(pose==='lift'?4:82)*u;
  const handY=shoulderY-(pose==='lift'?.82:.5+.62*lift)*HH;
  const g=p.g;g.save();g.translate(handX,handY);
  const angle=opts.action==='pour'?(opts.progress||0)*1.2:0;
  g.rotate(angle);g.lineWidth=5;g.strokeStyle=INK;g.fillStyle='#dfab57';
  g.beginPath();g.moveTo(-22,-4);g.lineTo(-26,-45);g.quadraticCurveTo(0,-64,25,-45);g.lineTo(21,-4);g.closePath();g.fill();g.stroke();
  g.beginPath();g.ellipse(0,-46,25,8,0,0,Math.PI*2);g.fillStyle='#54433a';g.fill();g.stroke();
  g.beginPath();g.arc(27,-27,13,-Math.PI/2,Math.PI/2);g.stroke();
  // The wrist and pot share the identical anchor, not independent world guesses.
  g.restore();
  if(opts.action==='pour'&&opts.progress>.25) {
    const x=handX+Math.sin(angle)*46+Math.cos(angle)*25;
    const y=handY-Math.cos(angle)*46+Math.sin(angle)*25;
    g.save();g.strokeStyle='#e7c04e';g.lineWidth=6;g.lineCap='round';
    for(let i=0;i<4;i++) {
      const offset=((opts.frame||0)*6+i*20)%80;
      g.beginPath();g.moveTo(x,y+offset);g.lineTo(x+Math.sin(i)*3,y+offset+15);g.stroke();
    }
    g.restore();
  }
}