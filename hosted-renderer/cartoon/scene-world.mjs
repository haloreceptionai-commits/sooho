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
function deck(root){
  add(tbox(7,.5,14,1),M.plank,0,-.28,0,root);
  for(const x of [-3.5,3.5]) {
    add(tbox(.12,.15,14),M.beam,x,.65,0,root);
    for(let z=-6;z<=6;z+=2) add(tbox(.12,.7,.12),M.beam,x,.28,z,root);
  }
  add(tbox(.18,9,.18),M.beam,0,4.3,-4,root);
  add(tbox(4.4,.12,.12),M.beam,0,7.2,-4,root);
  const sail=add(new THREE.PlaneGeometry(4,5,10,10),toon({color:'#edf3ee',side:THREE.DoubleSide}),0,4.8,-3.9,root);
  const base=sail.geometry.attributes.position.array.slice();
  animated.push(f=>{ if(!root.visible)return; const p=sail.geometry.attributes.position; for(let i=0;i<p.count;i++)p.setZ(i,base[i*3+2]+.12*Math.sin(f*.09+base[i*3]*1.3)); p.needsUpdate=true; });
  for(const [x,z] of [[-2.4,-1.5],[2.5,2]]) add(new THREE.CylinderGeometry(.35,.32,.8,14),M.wood,x,.4,z,root);
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
    if(kind==='storm_sea'){ const rocking=root; animated.push(f=>{ if(!rocking.visible)return; rocking.rotation.z=.035*Math.sin(f*.06); rocking.rotation.x=.02*Math.sin(f*.045+1); }); }
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
  for(const update of animated)update(f);
  waterU.t.value=f/30;
}
