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
const LANTERNS=[];const STERNS=[];
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
    const sl=add(g,sm,0,(y0+y1)/2,-3.3,root);sails.push([sl,g.attributes.position.array.slice()]);}
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
for (const kind of new Set(SHOTS.map(s=>s.world))) {
  const root=new THREE.Group(); scene.add(root); worldGroups.set(kind,root);
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
}
const helmetState=()=>{}; // the reference 3D helmet prop is removed; renderFrame still calls this hook
function worldState(state,f) {
  for(const [kind,root]of worldGroups)root.visible=kind===state.world;
  for(const st of STERNS)st.visible=!state.open;
  for(const l of LANTERNS)l.intensity=state.world==='storm_sea'?4:2.2;
  for(const update of animated)update(f);
  waterU.t.value=f/30;
}
