// Advanced-only deterministic joint/attachment clock. Design coordinates: 600x1000, feet at y=975.
export const CONTACT_ACTIONS = ['grab', 'lift', 'pour', 'hold', 'carry', 'aim', 'fire', 'load', 'place', 'inspect', 'strike', 'tap', 'throw'];
const clamp = x => Math.max(0, Math.min(1, x));
const ease = x => { const t = clamp(x); return t*t*(3-2*t); };
export function solveArm(shoulder, target, upper=112, lower=108, bend=1) {
  const dx=target[0]-shoulder[0], dy=target[1]-shoulder[1];
  const distance=Math.max(.001,Math.min(Math.hypot(dx,dy),upper+lower-.001));
  const angle=Math.atan2(dy,dx), offset=Math.acos(Math.max(-1,Math.min(1,(upper*upper+distance*distance-lower*lower)/(2*upper*distance))));
  const elbow=[shoulder[0]+upper*Math.cos(angle+bend*offset),shoulder[1]+upper*Math.sin(angle+bend*offset)];
  const wrist=[shoulder[0]+distance*Math.cos(angle),shoulder[1]+distance*Math.sin(angle)];
  return {shoulder,elbow,wrist};
}
export function performanceAt(action, frame, start, end, contactFrame) {
  const contact=Number.isInteger(contactFrame)?Math.max(start,Math.min(end-1,contactFrame)):start+Math.round((end-start)*.48);
  const before=ease((frame-start)/Math.max(1,contact-start));
  const after=ease((frame-contact)/Math.max(1,end-1-contact));
  const shoulder=[370,465];
  let target=[404,650], roll=0;
  if(CONTACT_ACTIONS.includes(action)) target=[404+88*before,650-160*before];
  if(action==='aim'||action==='fire')target=[404+100*before,650-185*before];
  if(action==='inspect')target=[404-50*before,650-240*before];
  if(action==='load')target=[404-50*before,650-140*before];
  if(action==='place')target=[404+75*before,650-80*before+160*after];
  if(action==='strike')target=frame<contact?[404+30*before,650-330*before]:[434+70*after,320+340*after];
  if(action==='tap')target=[404+88*before,650-160*before+12*Math.sin(after*Math.PI)];
  if(action==='pour')roll=before*1.1;
  if(action==='fire')target[0]-=20*Math.exp(-Math.max(0,frame-contact)/4)*(frame>=contact?1:0);
  const right=solveArm(shoulder,target,112,108,-1);
  const local=(frame-start)/30, walking=action==='walk'||action==='run';
  const stride=walking?Math.sin(local*(action==='run'?14:8)):0;
  const left=solveArm([230,465],[212+(walking?stride*55:0),650],112,108,1);
  const released=action==='throw'&&frame>=contact;
  const object=released?[right.wrist[0]+after*420,right.wrist[1]-Math.sin(after*Math.PI)*140+after*170]:right.wrist;
  return {right,left,object,roll,stride,contact,released,state:frame<contact?'anticipation':frame<contact+4?'contact':'settle'};
}
export function wristWorld(actor, wrist, flip=false) {
  return [actor[0]+(wrist[0]-300)*.00225*(flip?-1:1),actor[1]+(975-wrist[1])*.00225,actor[2]+.06];
}

// Atlas layout: 2 columns x 4 rows, 512x384 cells. Each independently drawn part has transparent padding.
export const RIG_PARTS=['head','torso','upper','fore','thigh','shin','hand','foot'];
export function drawRig(g, atlas, pose, mouth=0) {
  const part=(index,x,y,w,h,angle=0)=>{const col=index%2,row=Math.floor(index/2);g.save();g.translate(x,y);g.rotate(angle);g.drawImage(atlas,col*512,row*384,512,384,-w/2,-h/2,w,h);g.restore();};
  const segment=(index,a,b,width)=>part(index,(a[0]+b[0])/2,(a[1]+b[1])/2,width,Math.hypot(b[0]-a[0],b[1]-a[1])+18,Math.atan2(b[0]-a[0],b[1]-a[1]));
  for(const side of [-1,1]){
    const hip=[300+side*42,680],knee=[hip[0]+side*pose.stride*35,810],ankle=[hip[0]-side*pose.stride*55,940-Math.max(0,side*pose.stride)*20];
    segment(4,hip,knee,78);segment(5,knee,ankle,68);part(7,ankle[0]+side*8,ankle[1]+18,98,58);
  }
  part(1,300,560,220,275);
  for(const arm of [pose.left,pose.right]){segment(2,arm.shoulder,arm.elbow,68);segment(3,arm.elbow,arm.wrist,60);part(6,...arm.wrist,64,64);}
  part(0,300,330,280,270);
  // Dialogue only; never bounce a narrator's body. Atlas head retains identity and expression.
  if(mouth){g.save();g.fillStyle='#241e21';g.beginPath();g.ellipse(300,386,12,3+mouth*8,0,0,Math.PI*2);g.fill();g.restore();}
}