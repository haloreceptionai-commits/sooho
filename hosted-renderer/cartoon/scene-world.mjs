// Inserted into the verified reference engine's world section at preparation.
// Every world is built once; per-frame state only toggles visibility and runs pure f -> geometry updates.
const DECK=0;
const worldGroups=new Map();
const waterU={t:{value:0},deep:{value:new THREE.Color()},shal:{value:new THREE.Color()},glint:{value:new THREE.Color()}};
const clouds=[];
const animated=[];
const seaMat=(color)=>toon({color});
function sea(root,y,amp,color){
  const geo=new THREE.PlaneGeometry(160,160,80,80);geo.rotateX(-Math.PI/2);
  const water=add(geo,seaMat(color),0,y,0,root,{cast:false});
  const base=geo.attributes.position.array.slice();
  animated.push(f=>{ if(!root.visible)return; const p=geo.attributes.position;
    for(let i=0;i<p.count;i++){const x=base[i*3],z=base[i*3+2];p.setY(i,amp*(Math.sin(x*.35+f*.07)+.6*Math.sin(z*.5-f*.05)+.3*Math.sin((x+z)*.9+f*.13)));}
    p.needsUpdate=true; geo.computeVertexNormals(); });
  return water;
}
const PAINT={red:toon({color:'#c3322c'}),white:toon({color:'#f3ecdc'}),gold:toon({color:'#e8b23a'}),dark:toon({color:'#4a2d1c'}),rope:toon({color:'#c9a46a'}),
  iron:toon({color:'#3a3b40'}),glass:new THREE.MeshBasicMaterial({color:'#ffd77a'}),navy:toon({color:'#2f4f8c'}),canvas:toon({color:'#f4ead2',side:THREE.DoubleSide}),
  stripe:toon({color:'#c3322c',side:THREE.DoubleSide}),ring:toon({color:'#f3ecdc'}),green:toon({color:'#2f6b4f'})};
function rope(root,a,b,r=.025){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),L=A.distanceTo(B);
  const m=add(new THREE.CylinderGeometry(r,r,L,5),PAINT.rope,0,0,0,root,{cast:false});m.position.copy(A).lerp(B,.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),B.clone().sub(A).normalize());return m;}
function barrel(root,x,z,s=1,y=0){const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(s);root.add(g);
  add(new THREE.CylinderGeometry(.34,.34,.9,16),M.wood,0,.45,0,g);add(new THREE.CylinderGeometry(.4,.4,.5,16),M.wood,0,.45,0,g);
  for(const h of [.12,.45,.78])add(new THREE.CylinderGeometry(.405,.405,.06,16),PAINT.iron,0,h,0,g);return g;}
function crate(root,x,z,s=1,y=0,r=0){const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=r;g.scale.setScalar(s);root.add(g);
  add(tbox(.8,.8,.8,.8),M.plank,0,.4,0,g);for(const k of [-1,1])add(tbox(.84,.1,.84),M.beam,0,.4+k*.33,0,g);add(tbox(.12,.84,.84),M.beam,0,.4,0,g);return g;}
function lantern(root,x,y,z){const g=new THREE.Group();g.position.set(x,y,z);root.add(g);
  add(new THREE.CylinderGeometry(.14,.16,.32,8),PAINT.glass,0,0,0,g,{cast:false});add(new THREE.ConeGeometry(.2,.16,8),PAINT.iron,0,.24,0,g);add(tbox(.36,.05,.36),PAINT.iron,0,-.18,0,g);
  const l=new THREE.PointLight('#ffc163',2.2,5);l.position.set(0,0,.2);g.add(l);LANTERNS.push(l);return g;}
function cannon(root,x,z,dir){const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=dir;root.add(g);
  add(tbox(.6,.3,.8),M.wood,0,.25,0,g);for(const k of [-1,1])for(const j of [-1,1])add(new THREE.CylinderGeometry(.14,.14,.08,12),M.wood,k*.32,.14,j*.28,g).rotation.z=Math.PI/2;
  const b=add(new THREE.CylinderGeometry(.13,.18,1.3,14),PAINT.iron,0,.52,.15,g);b.rotation.x=Math.PI/2;add(new THREE.TorusGeometry(.15,.04,6,14),PAINT.iron,0,.52,.8,g);return g;}
function coil(root,x,z){for(let i=0;i<3;i++)add(new THREE.TorusGeometry(.32-i*.08,.05,6,20),PAINT.rope,x,.05+i*.07,z,root,{cast:false}).rotation.x=Math.PI/2;}
function wheel(root,x,y,z){const g=new THREE.Group();g.position.set(x,y,z);root.add(g);add(new THREE.TorusGeometry(.55,.05,8,24),M.wood,0,0,0,g);
  add(new THREE.CylinderGeometry(.1,.1,.18,12),PAINT.gold,0,0,0,g).rotation.x=Math.PI/2;
  for(let i=0;i<8;i++){const sp=add(new THREE.CylinderGeometry(.03,.04,1.5,6),M.wood,0,0,0,g);sp.rotation.z=i*Math.PI/8*2/2;}
  add(tbox(.2,1.1,.2),M.beam,0,-.75,-.1,g);return g;}
const LANTERNS=[];const STERNS=[];const SAILS=[];
function bulwark(root,x,len,side){
  // Painted hull wall: red with white band and gold cap, gun ports and portholes, like the reference's galleon.
  add(tbox(.25,1.25,len),PAINT.red,x,.62,0,root);add(tbox(.27,.28,len),PAINT.white,x,.86,0,root);add(tbox(.38,.1,len+.1),PAINT.gold,x,1.3,0,root);
  for(let z=-len/2+1;z<len/2;z+=1.3){add(tbox(.3,.12,.16),M.beam,x,1.4,z,root);}
  for(let z=-len/2+1.6;z<len/2-1;z+=3.2)add(new THREE.TorusGeometry(.2,.06,8,16),PAINT.gold,x-side*.14,.5,z,root).rotation.y=Math.PI/2;
}
function deck(root){
  add(tbox(7.4,.5,16,1),M.plank,0,-.28,-1,root);
  bulwark(root,-3.6,16,-1);bulwark(root,3.6,16,1);
  // Raised stern deck facade behind the cast: cabin wall with door, windows, lanterns, rail and helm.
  const st=new THREE.Group();st.position.set(0,0,-6.4);root.add(st);STERNS.push(st);
  add(tbox(7.2,2.3,.4),PAINT.red,0,1.15,0,st);add(tbox(7.3,.35,.45),PAINT.white,0,1.9,0,st);add(tbox(7.4,.12,.6),PAINT.gold,0,2.35,0,st);
  add(tbox(1.1,1.7,.1),PAINT.dark,0,.85,.22,st);add(new THREE.TorusGeometry(.08,.03,6,10),PAINT.gold,.35,.85,.3,st);
  for(const x of [-2.4,2.4]){add(tbox(1,.8,.08),PAINT.glass,x,1.1,.22,st,{cast:false});add(tbox(1.15,.1,.12),PAINT.gold,x,1.55,.24,st);add(tbox(.08,.8,.12),PAINT.dark,x,1.1,.25,st);}
  for(const x of [-1.2,1.2])lantern(st,x,1.75,.42);
  add(tbox(7.4,.3,3),M.plank,0,2.45,-1.3,st);
  for(let x=-3.4;x<=3.4;x+=.42){add(new THREE.CylinderGeometry(.05,.06,.75,8),PAINT.white,x,2.95,.05,st);}
  add(tbox(7.4,.12,.18),PAINT.gold,0,3.35,.05,st);
  wheel(st,1.6,3.6,-.6);
  // stairs up to the stern deck, left side
  for(let i=0;i<6;i++)add(tbox(1,.12,.4),M.beam,-3,.2+i*.4,.45+(5-i)*.35,st);
  // Main mast, yards, striped sails and rigging.
  add(new THREE.CylinderGeometry(.18,.24,16,14),M.wood,0,8,-3.6,root);
  for(const [y,w] of [[5.2,5.4],[9.6,4.4],[13.2,3.2]]){add(new THREE.CylinderGeometry(.07,.07,w,8),M.wood,0,y,-3.5,root).rotation.z=Math.PI/2;}
  const sails=[];
  for(const [y0,y1,w] of [[5.1,9.4,5],[9.5,13,4],[13.1,15,2.8]]){const h=y1-y0,g=new THREE.PlaneGeometry(w,h,12,8);
    const col=g.attributes.position;const colors=[];for(let i=0;i<col.count;i++){const band=Math.floor((col.getX(i)/w+.5)*6);colors.push(...(band%2?[.77,.2,.17]:[.96,.92,.86]));}
    g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    const sm=new THREE.MeshToonMaterial({gradientMap:grad,vertexColors:true,side:THREE.DoubleSide});
    const sl=add(g,sm,0,(y0+y1)/2,-3.3,root);SAILS.push(sl);sails.push([sl,g.attributes.position.array.slice()]);}
  animated.push(f=>{ if(!root.visible)return; for(const [sl,base] of sails){const p=sl.geometry.attributes.position;for(let i=0;i<p.count;i++){const x=base[i*3],y=base[i*3+1];p.setZ(i,.35*(1-(2*x/5)**2)+.08*Math.sin(f*.09+x*1.3+y));}p.needsUpdate=true;sl.geometry.computeVertexNormals();}});
  for(const s of [-1,1]){for(let k=0;k<5;k++)rope(root,[s*3.6,1.35,-4.6+k*.5],[s*.15,13.5,-3.6]);rope(root,[s*3.6,1.35,1],[s*.2,9.6,-3.5]);}
  rope(root,[0,15.5,-3.6],[0,3,8],.03);
  // Clutter that fills the deck edge to edge.
  barrel(root,-2.7,-1.8);barrel(root,-2.2,-2.6,.9);barrel(root,-2.9,-3.2,1.05);crate(root,2.6,-2.2,1,0,.3);crate(root,2.7,-2.2,.7,.8,-.2);crate(root,2.1,-3.2,.9,0,.6);
  cannon(root,-2.9,.6,-Math.PI/2);cannon(root,2.9,.6,Math.PI/2);cannon(root,-2.9,3.6,-Math.PI/2);cannon(root,2.9,3.6,Math.PI/2);
  coil(root,1.4,-4.6);coil(root,-1.1,2.8);
  for(let i=0;i<5;i++)add(new THREE.SphereGeometry(.12,10,8),PAINT.iron,2.4+(i%3)*.22,.12+(i>2?.18:0),1.6+(i%2)*.2,root);
  // Life ring hanging on the right bulwark.
  const lr=add(new THREE.TorusGeometry(.35,.11,10,20),PAINT.ring,3.45,.9,-.9,root);lr.rotation.y=Math.PI/2;
  for(let i=0;i<4;i++){const b=add(new THREE.TorusGeometry(.35,.115,10,4,Math.PI/8),PAINT.red,3.44,.9,-.9,root);b.rotation.set(0,Math.PI/2,i*Math.PI/2);}
  lantern(root,-3.4,1.9,-.4);lantern(root,3.4,1.9,2.4);
  // Foreground framing near the lens: these blur in close shots like the reference's pot and rail.
  barrel(root,-1.9,3.4,1.1);crate(root,2,3.8,1,0,.5);
  // Distant sailing ships and an island so the horizon is never empty.
  for(const [x,z,s] of [[-26,-60,1],[30,-80,.8]]){const g=new THREE.Group();g.position.set(x,-.6,z);g.scale.setScalar(s*1.6);root.add(g);
    add(tbox(6,1.4,1.8),PAINT.red,0,.7,0,g);add(tbox(6.1,.3,1.9),PAINT.white,0,1.3,0,g);add(new THREE.CylinderGeometry(.1,.1,7,6),M.wood,0,4.5,0,g);
    add(new THREE.PlaneGeometry(3,3.2),PAINT.canvas,0,4.8,.3,g);}
  const isl=add(new THREE.SphereGeometry(14,16,8),M.hill,40,-6,-120,root,{cast:false});isl.scale.y=.45;add(new THREE.ConeGeometry(4,9,8),M.stone,48,4,-118,root,{cast:false});
}
function rockRing(root,mat,count,radius,size){
  for(let i=0;i<count;i++){const a=i*2.399;const r=add(new THREE.DodecahedronGeometry(size*(.6+.4*((i*37)%10)/10),0),mat,Math.cos(a)*radius,-1,Math.sin(a)*radius-radius*.4,root,{cast:false});r.scale.y=.7;}
}
function hills(root){
  for(let i=0;i<12;i++) {
    const angle=i*Math.PI/6;
    const hill=add(new THREE.SphereGeometry(10+i%3*3,16,8),i%2?M.hill:M.hillFar,Math.cos(angle)*55,-5,Math.sin(angle)*55,root,{cast:false});hill.scale.y=.65;
  }
}
function stall(root,x,z,cloth){
  const g=new THREE.Group();g.position.set(x,0,z);root.add(g);
  add(tbox(2.2,.9,1.1),M.wood,0,.45,0,g);
  for(const sx of [-1,1])add(tbox(.1,2.4,.1),M.beam,sx,1.2,.5,g);
  const roof=add(tbox(2.5,.08,1.4),toon({color:cloth}),0,2.4,.2,g);roof.rotation.x=.2;
  for(let i=0;i<4;i++)add(new THREE.SphereGeometry(.16,10,8),toon({color:['#e2563c','#f2c14e','#8bc34a','#f08a2c'][i]}),-.75+i*.5,1.02,0,g);
}
// Set dressing: every land world gets a filled backdrop, mid-ground story clutter and foreground framing near the lens.
const PAL=['#c3322c','#2f6fb0','#e8b23a','#3f8a4f','#8a4fa0','#e07a2c'];
function bunting(root,y,z,w){rope(root,[-w,y,z],[w,y,z],.02);for(let x=-w+.3,i=0;x<w;x+=.5,i++){const t=add(new THREE.ConeGeometry(.16,.32,3),toon({color:PAL[i%6]}),x,y-.2,z,root,{cast:false});t.rotation.x=Math.PI;}}
function facade(root,x,z,w,h,c,roofC){const g=new THREE.Group();g.position.set(x,0,z);root.add(g);
  add(tbox(w,h,1.2),toon({color:c}),0,h/2,0,g);add(tbox(w+.2,.18,1.3),PAINT.dark,0,h,0,g);
  const r=add(new THREE.CylinderGeometry(.01,w*.75,1.4,4),toon({color:roofC}),0,h+.7,0,g);r.rotation.y=Math.PI/4;r.scale.z=.6;
  for(let wx=-w/2+.7;wx<w/2-.3;wx+=1.1)for(let wy=1.6;wy<h-.4;wy+=1.3){add(tbox(.55,.7,.05),PAINT.glass,wx,wy,.62,g,{cast:false});add(tbox(.7,.08,.12),PAINT.dark,wx,wy-.4,.64,g);
    add(tbox(.12,.7,.06),toon({color:'#3f8a4f'}),wx-.36,wy,.63,g);add(tbox(.12,.7,.06),toon({color:'#3f8a4f'}),wx+.36,wy,.63,g);}
  add(tbox(.8,1.4,.06),PAINT.dark,0,.7,.62,g);add(tbox(.12,.12,.4),PAINT.gold,.6,2.6,.8,g);return g;}
function dress(kind,root){
  if(kind==='town'||kind==='market'){
    let x=-7;for(let i=0;x<7;i++){const w=1.8+(i%3)*.5,h=3+(i%4)*.7;facade(root,x+w/2,-7.5,w,h,['#f3e2c0','#e9c9a0','#d9e4ec','#f0d0c8'][i%4],['#b8462e','#6a4a8a','#2f5f8f'][i%3]);x+=w+.05;}
    bunting(root,4,-5,6);barrel(root,-2.6,-3.2);crate(root,2.7,-3,1,0,.4);crate(root,2.4,-3.8,.8,.8,-.3);
    for(const x of [-3.2,3.2]){add(new THREE.CylinderGeometry(.06,.08,3,8),PAINT.iron,x,1.5,-1.5,root);lantern(root,x,3.1,-1.5);}
    add(new THREE.CylinderGeometry(.5,.6,.5,16),M.wood,-2.2,.25,3.6,root);crate(root,2.1,3.8,1.1,0,.5);
    if(kind==='market')for(let i=0;i<6;i++)add(new THREE.SphereGeometry(.14,10,8),toon({color:PAL[i]}),2.4+(i%3)*.25,.95,-3+(i>2?.25:0),root);
  } else if(kind==='castle'){
    for(const x of [-4.5,4.5]){add(tbox(1,4.5,1),M.stone,x,2.25,-4,root);add(new THREE.CylinderGeometry(.06,.06,1.2,6),PAINT.iron,x,2.2,-3.4,root);
      const fl=add(new THREE.ConeGeometry(.15,.4,8),new THREE.MeshBasicMaterial({color:'#ffb340'}),x,2.95,-3.4,root,{cast:false});animated.push(f=>{fl.scale.y=1+.2*Math.sin(f*.9+x);});}
    for(const x of [-2.2,2.2]){const b=add(new THREE.PlaneGeometry(1.1,3),toon({color:'#2f4f8c',side:THREE.DoubleSide}),x,4,-8.25,root);add(tbox(.3,.3,.05),PAINT.gold,x,4.5,-8.2,root);}
    add(tbox(3,.05,6),toon({color:'#a8252a'}),0,.03,-2,root,{cast:false});
    add(tbox(1.6,2.2,.8),PAINT.gold,0,1.1,-7.6,root);barrel(root,-3,2.8,1);crate(root,3,3,1,0,.4);
  } else if(kind==='night_camp'){
    for(let i=0;i<4;i++)crate(root,-2.6+(i%2)*.5,-1.6-i*.5,.7+i%2*.2,0,i);barrel(root,3,-2);coil(root,-1.2,2.6);
    for(let i=0;i<40;i++){const st=add(new THREE.SphereGeometry(.25,6,4),new THREE.MeshBasicMaterial({color:'#fff6d0'}),-60+((i*37)%120),25+((i*53)%30),-90,root,{cast:false});st.userData.ndSkip=true;}
    lantern(root,-3.2,1.6,-1.6);
  } else if(kind==='lab'){
    for(const x of [-3,3])for(let y=.6;y<2.6;y+=.55)for(let k=0;k<5;k++)add(tbox(.12,.42,.32),toon({color:PAL[(k+Math.round(y*3))%6]}),x-.6+k*.24+(x>0?0:0),y+.21,-3.25,root);
    add(tbox(2.4,1.6,.08),toon({color:'#2f4a3a'}),0,2.6,-3.82,root);for(let i=0;i<4;i++)add(tbox(1.6-i*.3,.04,.02),PAINT.white,-.1,3.1-i*.3,-3.76,root,{cast:false});
    for(const x of [-.6,.6])add(new THREE.SphereGeometry(.2,12,10),toon({color:x<0?'#9ccc65':'#e65a7a'}),x,1.2,-1.6,root);
    lantern(root,0,3.6,-2.2);barrel(root,-2.6,2.8,.9);crate(root,2.6,3.2,1,0,.3);
  } else if(kind==='landscape'||kind==='bridge'){
    for(let i=0;i<14;i++){const x=-12+((i*41)%24),z=-6-((i*29)%14);add(new THREE.CylinderGeometry(.14,.2,1.6,8),M.trunk,x,.8,z,root);add(new THREE.SphereGeometry(.9+(i%3)*.3,12,10),i%2?M.bush:M.pine,x,2+(i%3)*.2,z,root);}
    for(let i=0;i<30;i++)add(new THREE.SphereGeometry(.07,6,4),toon({color:PAL[i%6]}),-4+((i*13)%80)/10,.06,-1-((i*7)%40)/10,root,{cast:false});
    if(kind==='landscape'){add(tbox(.12,1,.12),M.beam,-2.4,.5,-2.2,root);add(tbox(1.2,.5,.06),M.plank,-2.4,1.1,-2.15,root);for(let x=-4;x<=4;x+=1)add(tbox(.1,.8,.1),M.beam,x,.4,-3.4,root);add(tbox(8,.08,.06),M.beam,0,.65,-3.4,root);}
  }
}
for (const kind of new Set(SHOTS.map(s=>s.world))) {
  const root=new THREE.Group(); scene.add(root); worldGroups.set(kind,root);
  if(kind==='map'){await buildMap(root);continue;}
  const floor=add(new THREE.PlaneGeometry(160,160),kind==='lab'||kind==='castle'?M.marble:M.grass,0,-.03,0,root,{cast:false}); floor.rotation.x=-Math.PI/2;
  if(kind==='ship'||kind==='storm_sea') {
    floor.visible=false;
    sea(root,-.9,kind==='storm_sea'?.45:.12,kind==='storm_sea'?'#3f7d99':'#5aabc7');
    deck(root);
    if(kind==='storm_sea'){
      // Towering swells with foam crests behind the ship, rolling and rising like the reference's storm.
      const wm=toon({color:'#1f4f9a'}),foam=toon({color:'#dff0ff'});
      for(let i=0;i<6;i++){const g=new THREE.Group();g.position.set(-30+i*12,-2,-24-(i%3)*10);root.add(g);
        const w=add(new THREE.CylinderGeometry(5,7,22,24,1,true,0,Math.PI),wm,0,0,0,g,{cast:false});w.rotation.set(0,0,Math.PI/2);w.scale.set(1,1,.9);
        const c=add(new THREE.TorusGeometry(5.6,.55,8,24,Math.PI*.55),foam,0,1,1,g,{cast:false});c.rotation.y=Math.PI/2;c.scale.z=2;
        animated.push(f=>{ if(!root.visible)return; g.position.y=-3.5+1.8*Math.sin(f*.035+i*1.7); g.rotation.z=.06*Math.sin(f*.03+i); });}
      const rocking=root; animated.push(f=>{ if(!rocking.visible)return; rocking.rotation.z=.035*Math.sin(f*.06); rocking.rotation.x=.02*Math.sin(f*.045+1); }); }
  } else if(kind==='bridge') {
    floor.visible=false; sea(root,-2,.08,'#68b7ce');
    add(tbox(4,.3,14,1),M.plank,0,-.17,0,root);
    for(const z of [-5,0,5])for(const x of [-1.6,1.6])add(tbox(.3,3,.3),M.beam,x,-1.5,z,root);
    for(const x of [-1.9,1.9])add(tbox(.08,.08,14),M.beam,x,.9,0,root);
    hills(root);
  } else if(kind==='town') {
    floor.material=M.dirt;
    for(let i=0;i<5;i++)for(const side of [-1,1]) {
      const g=new THREE.Group();g.position.set(side*6,0,-i*6);root.add(g);
      add(tbox(4,3.6+i%2,4),i%2?M.plaster2:M.plaster,0,1.8,0,g);
      add(new THREE.ConeGeometry(3.5,2,4),M.roof,0,4.5+i%2,0,g).rotation.y=Math.PI/4;
      add(tbox(.9,1.8,.04),M.door,0,.9,2.03,g);
      for(const wx of [-1.2,1.2])add(tbox(.6,.6,.04),toon({color:'#ffe9a6'}),wx,2.4,2.03,g);
    }
    hills(root);
  } else if(kind==='market') {
    floor.material=M.dirt;
    stall(root,-3.2,-2.5,'#d8443a');stall(root,3.2,-2.5,'#3b78c2');stall(root,-3.4,-7,'#f2b33d');stall(root,3.4,-7,'#4f9a52');
    for(let i=0;i<4;i++)for(const side of [-1,1]){const g=new THREE.Group();g.position.set(side*8,0,-4-i*6);root.add(g);add(tbox(4,4,4),M.plaster,0,2,0,g);add(new THREE.ConeGeometry(3.4,2,4),M.roof,0,5,0,g).rotation.y=Math.PI/4;}
    hills(root);
  } else if(kind==='castle') {
    floor.material=M.stone;
    add(tbox(14,6,1.2),M.stone,0,3,-9,root);
    for(const x of [-7,7]){add(new THREE.CylinderGeometry(1.6,1.8,9,16),M.stone,x,4.5,-9,root);add(new THREE.ConeGeometry(2.1,3,16),M.roof,x,10.5,-9,root);}
    for(let x=-6;x<=6;x+=1.5)add(tbox(.8,.8,1.2),M.stone,x,6.4,-9,root);
    add(tbox(2.6,3.6,.1),M.door,0,1.8,-8.35,root);
    for(const x of [-3.5,3.5]){add(tbox(.12,4,.12),M.iron,x,2,-6,root);add(new THREE.PlaneGeometry(1,1.6),toon({color:'#b8323a',side:THREE.DoubleSide}),x+.56,3.1,-6,root);}
    hills(root);
  } else if(kind==='night_camp') {
    for(let i=0;i<10;i++){const a=i*.63;const t=add(new THREE.ConeGeometry(1.2,4,8),M.pine,Math.cos(a)*(10+i%3*3),2,-6+Math.sin(a)*8-4,root);t.scale.setScalar(.9+i%3*.2);}
    const tent=add(new THREE.ConeGeometry(1.8,2.4,4),toon({color:'#c99a5b'}),-3.2,1.2,-3,root);tent.rotation.y=Math.PI/4;
    for(let i=0;i<6;i++){const a=i*Math.PI/3;add(new THREE.DodecahedronGeometry(.22,0),M.stone,1.6+Math.cos(a)*.55,.1,1+Math.sin(a)*.55,root);}
    const flame=add(new THREE.ConeGeometry(.35,.9,10),new THREE.MeshBasicMaterial({color:'#ffb340'}),1.6,.5,1,root,{cast:false});
    const glow=new THREE.PointLight('#ffae4a',6,8);glow.position.set(1.6,.9,1);root.add(glow);
    animated.push(f=>{ if(!root.visible)return; const k=1+.18*Math.sin(f*.9)+.1*Math.sin(f*2.3); flame.scale.set(1,k,1); glow.intensity=5+1.5*Math.sin(f*1.7); });
    hills(root);
  } else if(kind==='lab') {
    add(tbox(4,.15,1.7),M.plank,0,.9,-2,root);
    for(const x of [-1.8,1.8])add(tbox(.15,.9,.15),M.iron,x,.45,-2,root);
    for(const x of [-1,0,1])add(new THREE.CylinderGeometry(.17,.25,.5,16),toon({color:['#77c7c8','#f2a65a','#9ccc65'][x+1]}),x,1.22,-2,root);
    add(tbox(10,5,.3),M.plaster,0,2.5,-4,root);
    for(const x of [-3,3])add(tbox(1.6,2.6,.6),M.wood,x,1.3,-3.6,root);
  } else if(kind==='landscape') {
    hills(root);
    for(let i=0;i<8;i++)add(new THREE.SphereGeometry(.7,10,8),M.bush,-8+i*2.3,.3,-6-i%3*2,root);
  } else throw Error('Unsupported world');
  if(kind==='ship'||kind==='storm_sea')rockRing(root,M.stone,6,40,4);
  dress(kind,root);
}
// 3D story objects: built once per (kind, slot), normalised to ~1 m tall, placed from the story's pose each frame.
function shipModel(pirate){const g=new THREE.Group();const hull=pirate?toon({color:'#2b2230'}):PAINT.red;
  const h=add(new THREE.CylinderGeometry(.5,.32,2.6,16,1,false,0,Math.PI),hull,0,.12,0,g);h.rotation.set(0,0,Math.PI/2);h.rotation.x=Math.PI;
  add(tbox(2.5,.08,.9),M.plank,0,.13,0,g);add(tbox(2.62,.07,1.02),PAINT.gold,0,.16,0,g);add(tbox(.6,.35,.95),hull,-1,.32,0,g);
  for(const [x,hh] of [[-.5,1.7],[.35,2.1]]){add(new THREE.CylinderGeometry(.03,.04,hh,6),M.wood,x,.15+hh/2,0,g);
    for(const [y,w] of [[.6,1],[1.25,.8]]){const sg=new THREE.PlaneGeometry(w,.6,6,3);const sl=add(sg,pirate?toon({color:'#2a2a2a',side:THREE.DoubleSide}):PAINT.canvas,x,.15+y*hh/2+.2,.08,g);sl.rotation.y=Math.PI/2*.15;}}
  const fl=add(new THREE.PlaneGeometry(.3,.18),PAINT.stripe,.35,2.35,0,g);g.scale.setScalar(.45);return g;}
function waveModel(){const g=new THREE.Group();const w=add(new THREE.CylinderGeometry(.5,.62,3,24,1,true,0,Math.PI*1.2),toon({color:'#2a62b8',side:THREE.DoubleSide}),0,.5,0,g,{cast:false});w.rotation.z=Math.PI/2;
  const c=add(new THREE.TorusGeometry(.55,.07,8,24,Math.PI*.7),toon({color:'#e6f4ff'}),0,.55,0,g,{cast:false});c.rotation.y=Math.PI/2;c.scale.z=3;return g;}
const MODEL_BUILD={merchant_ship:()=>shipModel(false),pirate_ship:()=>shipModel(true),wave:waveModel,rowboat:()=>{const g=shipModel(false);g.children.slice(4).forEach(c=>c.visible=false);return g;},
  phone:()=>{const g=new THREE.Group();add(tbox(.5,.9,.06),PAINT.dark,0,.45,0,g);add(tbox(.43,.76,.015),PAINT.glass,0,.46,.04,g);return g;},
  pan:()=>{const g=new THREE.Group();add(new THREE.CylinderGeometry(.42,.3,.1,24),PAINT.iron,0,.06,0,g);return g;},
  pickaxe:()=>{const g=new THREE.Group();add(tbox(.05,.95,.05),M.wood,0,.48,0,g);add(tbox(.65,.07,.07),PAINT.iron,0,.85,0,g);return g;},
  gold_piece:()=>{const g=new THREE.Group();add(new THREE.IcosahedronGeometry(.2,0),PAINT.gold,0,.2,0,g);return g;},
  magnifier:()=>{const g=new THREE.Group();add(new THREE.TorusGeometry(.23,.035,8,24),PAINT.iron,0,.55,0,g);add(tbox(.05,.35,.05),M.wood,0,.18,0,g);return g;},
  barrel:()=>{const g=new THREE.Group();barrel(g,0,0,1.1);return g;},cannon:()=>{const g=new THREE.Group();cannon(g,0,0,Math.PI/2);g.scale.setScalar(1.3);return g;},
  lantern:()=>{const g=new THREE.Group();lantern(g,0,.3,0);return g;},helm_wheel:()=>{const g=new THREE.Group();wheel(g,0,1.2,0);g.scale.setScalar(.8);return g;},
  chest:()=>{const g=new THREE.Group();add(tbox(.9,.5,.55),M.wood,0,.25,0,g);const lid=add(new THREE.CylinderGeometry(.28,.28,.9,12,1,false,0,Math.PI),M.wood,0,.5,0,g);lid.rotation.z=Math.PI/2;
    for(const x of [-.3,.3])add(tbox(.07,.82,.6),PAINT.gold,x,.4,0,g);add(tbox(.14,.16,.05),PAINT.gold,0,.45,.29,g);return g;},
  anchor:()=>{const g=new THREE.Group();add(new THREE.CylinderGeometry(.05,.05,1,8),PAINT.iron,0,.6,0,g);add(new THREE.TorusGeometry(.38,.06,8,16,Math.PI),PAINT.iron,0,.42,0,g).rotation.z=Math.PI;
    add(new THREE.TorusGeometry(.1,.04,6,12),PAINT.iron,0,1.15,0,g);add(tbox(.5,.06,.06),PAINT.iron,0,.95,0,g);return g;}};
// CC0 object library: only the objects this story uses are loaded, restyled to the toon look and normalised to real-world height.
const LIBRARY=new Map();
{ const {GLTFLoader}=await import('./lib/GLTFLoader.js'); const SKEL=await import('./lib/SkeletonUtils.js'); globalThis.__SKEL=SKEL; const used=await (await fetch('./library.json')).json(); const loader=new GLTFLoader(); const tl=new THREE.TextureLoader();
  for(const e of used){ const name=e.id.split('/')[1];
    if(e.type==='sprite'){ const map=await tl.loadAsync(`./assets/${e.pack}/${name}.png`); map.colorSpace=THREE.SRGBColorSpace; LIBRARY.set(e.id,{e,map,aspect:map.image.width/map.image.height}); continue; }
    const g=await loader.loadAsync(`./assets/${e.pack}/${name}.glb`); const obj=g.scene;
    obj.traverse(o=>{ if(!o.isMesh)return; const mats=Array.isArray(o.material)?o.material:[o.material];
      const t=mats.map(m=>{ if(m.map)m.map.colorSpace=THREE.SRGBColorSpace; return toon({color:m.color||'#ffffff',map:m.map||null,transparent:m.transparent,opacity:m.opacity??1,side:THREE.DoubleSide}); });
      o.material=Array.isArray(o.material)?t:t[0]; o.castShadow=o.receiveShadow=true; });
    // Rigged models carry their scale on the armature: pose the idle clip and measure skinned vertices.
    if(g.animations?.length){ const mx=new THREE.AnimationMixer(obj),c0=g.animations.find(c=>/idle|standing/i.test(c.name))||g.animations[0]; mx.clipAction(c0).play(); mx.setTime(0); obj.updateMatrixWorld(true); obj.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();}); mx.stopAllAction(); mx.uncacheRoot(obj); }
    const box=new THREE.Box3().setFromObject(obj,!!g.animations?.length),size=box.getSize(new THREE.Vector3()),c=box.getCenter(new THREE.Vector3());
    const k=e.h/Math.max(size.y,1e-3*Math.max(size.x,size.z),1e-4); obj.position.set(-c.x*k,-box.min.y*k,-c.z*k); obj.scale.setScalar(k);
    LIBRARY.set(e.id,{e,obj,clips:g.animations||[]}); } }
// Ink/depth pass for rigged meshes: same output as ndMat, but skinned so outlines follow the animated pose.
const SKIN_ND=new THREE.ShaderMaterial({side:THREE.DoubleSide,
  vertexShader:`#include <common>\n#include <skinning_pars_vertex>\nvarying vec3 vN; varying float vD; void main(){\n#include <skinbase_vertex>\n#include <beginnormal_vertex>\n#include <skinnormal_vertex>\n#include <begin_vertex>\n#include <skinning_vertex>\n vN=normalize(normalMatrix*objectNormal); vec4 mv=modelViewMatrix*vec4(transformed,1.); vD=-mv.z; gl_Position=projectionMatrix*mv; }`,
  fragmentShader:`varying vec3 vN; varying float vD; void main(){ vec3 n=normalize(vN); if(!gl_FrontFacing) n=-n; gl_FragColor=vec4(n*.5+.5,vD); }`});
function libraryModel(id){ const L=LIBRARY.get(id); if(!L)throw Error('Library object not prepared'); const g=new THREE.Group();
  if(L.map){ const h=L.e.h,m=new THREE.Mesh(new THREE.PlaneGeometry(h*L.aspect,h),new THREE.MeshBasicMaterial({map:L.map,alphaTest:.5,side:THREE.DoubleSide}));
    m.position.y=h/2; m.userData.nd=cardNd(L.map); m.userData.billboard=true; g.add(m); }
  else if(L.clips.length){ // rigged characters/animals: skeleton-safe clone with a mixer seeked per frame (deterministic)
    const o=globalThis.__SKEL.clone(L.obj); g.add(o); o.traverse(m=>{if(m.isSkinnedMesh)m.userData.nd=SKIN_ND;}); const mixer=new THREE.AnimationMixer(o);
    const pick=re=>L.clips.find(c=>re.test(c.name)); g.userData.clips={mixer,acts:{}};
    for(const [k,re] of [['idle',/idle|standing|breath/i],['walk',/walk/i],['run',/run|gallop|swim|fly/i],['cheer',/clap|wave|yes|victory|jump/i]]){const c=pick(re);if(c)g.userData.clips.acts[k]=mixer.clipAction(c);}
    if(!g.userData.clips.acts.idle)g.userData.clips.acts.idle=mixer.clipAction(L.clips[0]); }
  else g.add(L.obj.clone(true)); return g; }
// Rigged library objects pick a clip from the prop motion and seek to the frame time, so every batch renders the same pose.
function animateLibrary(m,p,f){const c=m.userData.clips;if(!c)return;const want=p.motion==='approach'?(c.acts.walk||c.acts.run):p.motion==='spin'||p.motion==='grow'?(c.acts.cheer):p.motion==='rise'||p.motion==='fall'?(c.acts.run):null;
  const a=want||c.acts.idle;for(const x of Object.values(c.acts))if(x!==a){x.stop();}a.play();a.time=0;c.mixer.setTime(((f+p.i*17)/30)%Math.max(a.getClip().duration,1e-3));}
const modelPool=new Map();
function props3dState(list,f=0){for(const m of modelPool.values())m.visible=false;
  for(const p of list||[]){const key=p.kind+':'+(p.asset||'')+':'+p.i;let m=modelPool.get(key);if(!m){m=p.kind==='asset'?libraryModel(p.asset):MODEL_BUILD[p.kind]();scene.add(m);modelPool.set(key,m);}
    m.visible=true;m.position.set(p.x,p.y,p.z);m.rotation.set(0,p.kind.includes('ship')||p.kind==='rowboat'?.5:0,p.roll||0);if(p.kind==='asset'){ // real-size object; far places get a mild boost so they still read; motion 'grow' scales k
      const far={background:1.6,sea:2.2,sky:1.4}[p.place]||Math.min(1,1.4/LIBRARY.get(p.asset).e.h); m.scale.setScalar(far*(p.k||1)); m.rotation.y=Math.atan2(camera.position.x-p.x,camera.position.z-p.z)*(m.children[0]?.userData.billboard?1:.35); animateLibrary(m,p,f); continue; }
    m.scale.setScalar((p.s||1)*(p.kind==='wave'?.5:p.kind.includes('ship')?.45:.6));}}
const helmetState=()=>{}; // the reference 3D helmet prop is removed; renderFrame still calls this hook
function worldState(state,f) {
  for(const [kind,root]of worldGroups)root.visible=kind===state.world;
  props3dState(state.props3d,f);
  mapState(state,f);
  for(const st of STERNS)st.visible=!state.open;
  // Open views furl the lower sails so the horizon, ships and waves read.
  SAILS.forEach((sl,i)=>{sl.visible=!state.open||i>0;});
  for(const l of LANTERNS)l.intensity=state.world==='storm_sea'?4:2.2;
  for(const update of animated)update(f);
  waterU.t.value=f/30;
}
