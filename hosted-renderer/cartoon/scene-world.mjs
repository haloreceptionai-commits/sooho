// Inserted into the verified reference engine's world section at preparation.
const DECK=0;
const worldGroups=new Map();
const waterU={t:{value:0},deep:{value:new THREE.Color()},shal:{value:new THREE.Color()},glint:{value:new THREE.Color()}};
const clouds=[];
const animated=[];
for (const kind of new Set(SHOTS.map(s=>s.world))) {
  const root=new THREE.Group(); scene.add(root); worldGroups.set(kind,root);
  const floor=add(new THREE.PlaneGeometry(160,160),kind==='lab'?M.marble:M.grass,0,-.03,0,root,{cast:false}); floor.rotation.x=-Math.PI/2;
  if(kind==='ship') {
    floor.material=toon({color:'#5aabc7'}); floor.position.y=-.9;
    add(tbox(7,.5,14,1),M.plank,0,-.28,0,root);
    for(const x of [-3.5,3.5]) {
      add(tbox(.12,.15,14),M.beam,x,.65,0,root);
      for(let z=-6;z<=6;z+=2) add(tbox(.12,.7,.12),M.beam,x,.28,z,root);
    }
    add(tbox(.18,9,.18),M.beam,0,4.3,-4,root);
    const sail=add(new THREE.PlaneGeometry(4,5,10,10),toon({color:'#edf3ee',side:THREE.DoubleSide}),0,4.8,-3.9,root);
    const base=sail.geometry.attributes.position.array.slice();
    animated.push(f=>{ const p=sail.geometry.attributes.position; for(let i=0;i<p.count;i++)p.setZ(i,base[i*3+2]+.12*Math.sin(f*.09+base[i*3]*1.3)); p.needsUpdate=true; });
  } else if(kind==='bridge') {
    floor.material=toon({color:'#68b7ce'});floor.position.y=-2;
    add(tbox(4,.3,14,1),M.plank,0,-.17,0,root);
    for(const z of [-5,0,5])for(const x of [-1.6,1.6])add(tbox(.3,3,.3),M.beam,x,-1.5,z,root);
  } else if(kind==='town') {
    for(let i=0;i<5;i++)for(const side of [-1,1]) {
      const g=new THREE.Group();g.position.set(side*6,0,-i*6);root.add(g);
      add(tbox(4,3.6,4),M.plaster,0,1.8,0,g);
      add(new THREE.ConeGeometry(3.5,2,4),M.roof,0,4.5,0,g).rotation.y=Math.PI/4;
      add(tbox(.9,1.8,.04),M.door,0,.9,2.03,g);
    }
  } else if(kind==='lab') {
    add(tbox(4,.15,1.7),M.plank,0,.9,-2,root);
    for(const x of [-1.8,1.8])add(tbox(.15,.9,.15),M.iron,x,.45,-2,root);
    for(const x of [-1,0,1])add(new THREE.CylinderGeometry(.17,.25,.5,16),toon({color:'#77c7c8'}),x,1.22,-2,root);
  } else if(kind!=='landscape') throw Error('Unsupported world');
  if(kind!=='lab') {
    for(let i=0;i<12;i++) {
      const angle=i*Math.PI/6;
      const hill=add(new THREE.SphereGeometry(10+i%3*3,16,8),i%2?M.hill:M.hillFar,Math.cos(angle)*55,-5,Math.sin(angle)*55,root,{cast:false});hill.scale.y=.65;
    }
  }
}
function worldState(state,f) {
  for(const [kind,root]of worldGroups)root.visible=kind===state.world;
  for(const update of animated)update(f);
  waterU.t.value=f/30;
}
const helmetState=()=>{};