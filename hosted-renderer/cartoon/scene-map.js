// Inserted after scene-world at preparation. The "map" world: a baked 3D relief map of the story's area
// (Natural Earth outlines, public domain), a glowing territory overlay that grows/shrinks per shot,
// marching armies and city markers. Everything is a pure function of the frame number, so parallel
// batches render identical pixels.
const MAP_S=.5; // world units per degree
const mapLon=x=>x/MAP_S, mapX=lon=>lon*MAP_S, mapZ=lat=>-lat*MAP_S;
const MAP={ready:false};
async function buildMap(root){
  const data=await (await fetch('./map/regions.json')).json();
  const shots=SHOTS.filter(s=>s.world==='map'&&s.map);
  // Bake only the area the story looks at, so close views stay sharp.
  let w=180,e=-180,s=90,n=-90;
  for(const sh of shots){const [lon,lat,zoom]=sh.map.focus,span=60/zoom;w=Math.min(w,lon-span*1.1);e=Math.max(e,lon+span*1.1);s=Math.min(s,lat-span*.75);n=Math.max(n,lat+span*.75);}
  w=Math.max(-180,w);e=Math.min(180,e);s=Math.max(-70,s);n=Math.min(85,n);
  const TW=4096,TH=Math.max(256,Math.min(4096,Math.round(TW*(n-s)/(e-w)/Math.cos(0))));
  const px=lon=>(lon-w)/(e-w)*TW, py=lat=>(n-lat)/(n-s)*TH;
  const path=(g,rings)=>{g.beginPath();for(const r of rings){r.forEach(([lo,la],i)=>i?g.lineTo(px(lo),py(la)):g.moveTo(px(lo),py(la)));g.closePath();}};
  const canvas=(cw,ch)=>{const c=document.createElement('canvas');c.width=cw;c.height=ch;return [c,c.getContext('2d',{willReadFrequently:true})];};
  // Land mask, blurred coast mask, borders.
  const [lc,lg]=canvas(TW,TH);lg.fillStyle='#000';lg.fillRect(0,0,TW,TH);lg.fillStyle='#fff';
  const all=Object.values(data.regions);for(const r of all){path(lg,r.rings);lg.fill('evenodd');}
  const land=lg.getImageData(0,0,TW,TH).data;
  const [bc,bg]=canvas(TW,TH);bg.filter='blur(18px)';bg.drawImage(lc,0,0);const coast=bg.getImageData(0,0,TW,TH).data;
  const [rc,rg]=canvas(TW,TH);rg.strokeStyle='rgba(255,255,255,.75)';rg.lineWidth=2.2;for(const r of all){path(rg,r.rings);rg.stroke();}const border=rg.getImageData(0,0,TW,TH).data;
  // Deterministic value-noise relief.
  const hash=(x,y)=>{const h=Math.sin(x*127.1+y*311.7)*43758.5453;return h-Math.floor(h);};
  const vnoise=(x,y)=>{const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
    const a=hash(xi,yi),b=hash(xi+1,yi),c=hash(xi,yi+1),d=hash(xi+1,yi+1);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;};
  const fbm=(x,y)=>{let t=0,a=.5,f=1;for(let o=0;o<5;o++){t+=a*vnoise(x*f,y*f);f*=2.03;a*=.5;}return t;};
  const ridge=(x,y)=>{let t=0,a=.5,f=1;for(let o=0;o<4;o++){t+=a*(1-Math.abs(vnoise(x*f,y*f)*2-1));f*=2.1;a*=.5;}return t;};
  const GW=1024,GH=Math.max(64,Math.round(GW*TH/TW)),H=new Float32Array(GW*GH);
  for(let j=0;j<GH;j++)for(let i=0;i<GW;i++){const lon=w+(i+.5)/GW*(e-w),lat=n-(j+.5)/GH*(n-s);
    const k=((Math.floor(j/GH*TH))*TW+Math.floor(i/GW*TW))*4,l=land[k]/255,cst=coast[k]/255;
    const base=fbm(lon*.18,lat*.18),mount=Math.pow(Math.max(0,ridge(lon*.09+7,lat*.09+3)-.45)*1.9,1.6);
    H[j*GW+i]=l*(.08+.35*base*cst+mount*cst)-(1-l)*.05;}
  const hAt=(lon,lat)=>{const i=Math.max(0,Math.min(GW-1,Math.floor((lon-w)/(e-w)*GW))),j=Math.max(0,Math.min(GH-1,Math.floor((n-lat)/(n-s)*GH)));return H[j*GW+i];};
  // Bake colour: earth-tone relief ramp + hillshade, blue sea with bright shallows, white borders.
  const [cc,cg]=canvas(TW,TH),img=cg.createImageData(TW,TH),o=img.data;
  const ramp=[[0,[63,150,58]],[.18,[110,168,62]],[.32,[205,178,74]],[.5,[178,122,58]],[.72,[132,92,54]],[1,[236,226,204]]];
  const rampAt=h=>{h=Math.max(0,Math.min(1,h));for(let q=1;q<ramp.length;q++)if(h<=ramp[q][0]){const [a,ca]=ramp[q-1],[b,cb]=ramp[q],t=(h-a)/(b-a);return ca.map((v,z)=>v+(cb[z]-v)*t);}return ramp[ramp.length-1][1];};
  for(let y=0;y<TH;y++){const gj=Math.min(GH-1,Math.floor(y/TH*GH));for(let x=0;x<TW;x++){const gi=Math.min(GW-1,Math.floor(x/TW*GW)),k=(y*TW+x)*4;
    const h=H[gj*GW+gi],hx=H[gj*GW+Math.min(GW-1,gi+1)]-H[gj*GW+Math.max(0,gi-1)],hy=H[Math.min(GH-1,gj+1)*GW+gi]-H[Math.max(0,gj-1)*GW+gi];
    const lonD=(e-w)/GW,fine=hash(x*.37,y*.53)*.06;
    const shade=Math.max(.35,Math.min(1.45,1+(-hx+hy)*6/Math.max(.05,lonD*4)));
    let c;
    if(land[k]>127){const hh=(h-.08)/.6;c=rampAt(hh+fine*.4).map(v=>v*(shade*.82+.18));}
    else{const sh=coast[k]/255,wave=.94+.06*vnoise(x*.02,y*.03);c=[22+60*sh,84+86*sh,182+46*sh].map(v=>v*wave);}
    const b=border[k+3]/255;o[k]=c[0]+(255-c[0])*b*.8;o[k+1]=c[1]+(255-c[1])*b*.8;o[k+2]=c[2]+(255-c[2])*b*.8;o[k+3]=255;}}
  cg.putImageData(img,0,0);
  const tex=new THREE.CanvasTexture(cc);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;tex.generateMipmaps=true;tex.minFilter=THREE.LinearMipmapLinearFilter;
  // Territory overlays, one per distinct region set (R=fill, G=soft glow).
  const OW=2048,OH=Math.max(128,Math.round(OW*TH/TW)),overlays=new Map();
  const ids=r=>(data.presets[r]||[r]);
  for(const sh of shots){const key=sh.map.regions.join(',');if(overlays.has(key))continue;
    const [fc,fg]=canvas(OW,OH);fg.fillStyle='#000';fg.fillRect(0,0,OW,OH);fg.fillStyle='#f00';
    const sc=OW/TW;fg.save();fg.scale(sc,sc);for(const r of sh.map.regions)for(const id of ids(r)){const reg=data.regions[id];if(reg){path(fg,reg.rings);fg.fill('evenodd');}}fg.restore();
    const [gc,gg]=canvas(OW,OH);gg.filter='blur(10px)';gg.drawImage(fc,0,0);
    const a=fg.getImageData(0,0,OW,OH),b=gg.getImageData(0,0,OW,OH);for(let q=0;q<a.data.length;q+=4){a.data[q+1]=b.data[q];a.data[q+3]=255;}fg.putImageData(a,0,0);
    const t=new THREE.CanvasTexture(fc);t.colorSpace=THREE.NoColorSpace;overlays.set(key,t);}
  const U={map:{value:tex},terr:{value:[...overlays.values()][0]||null},center:{value:new THREE.Vector2(.5,.5)},radius:{value:0},pulse:{value:1},
    texel:{value:new THREE.Vector2(1/OW,1/OH)},aspect:{value:(e-w)/(n-s)},has:{value:0}};
  const mat=new THREE.ShaderMaterial({uniforms:U,
    vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader:`uniform sampler2D map, terr; uniform vec2 center, texel; uniform float radius, pulse, aspect, has; varying vec2 vUv;
      void main(){ vec3 base=texture2D(map,vUv).rgb; vec3 col=base;
        if(has>.5){ float fill=texture2D(terr,vUv).r, glow=texture2D(terr,vUv).g;
          float nb=(texture2D(terr,vUv+vec2(texel.x*2.,0.)).r+texture2D(terr,vUv-vec2(texel.x*2.,0.)).r+texture2D(terr,vUv+vec2(0.,texel.y*2.)).r+texture2D(terr,vUv-vec2(0.,texel.y*2.)).r)*.25;
          vec2 d=(vUv-center)*vec2(aspect,1.); float rev=smoothstep(radius,radius-.012,length(d));
          float lum=dot(base,vec3(.3,.59,.11));
          vec3 red=vec3(.93,.08,.06)*(.55+.75*lum)*pulse;
          col=mix(col,red,fill*rev*.9);
          col+=vec3(.9,.05,.03)*glow*(1.-fill)*rev*.55*pulse;
          col=mix(col,vec3(1.),clamp(abs(fill-nb)*3.5,0.,1.)*rev); }
        gl_FragColor=vec4(col,1.); }`});
  const SEG=512,geo=new THREE.PlaneGeometry(mapX(e)-mapX(w),mapZ(s)-mapZ(n),SEG,Math.max(32,Math.round(SEG*(n-s)/(e-w))));geo.rotateX(-Math.PI/2);
  const pos=geo.attributes.position,relief=(e-w)*MAP_S*.012;
  for(let i=0;i<pos.count;i++){const lon=mapLon(pos.getX(i)+(mapX(w)+mapX(e))/2),lat=-(pos.getZ(i)+(mapZ(n)+mapZ(s))/2)/MAP_S;pos.setY(i,Math.max(0,hAt(lon,lat))*relief);}
  pos.needsUpdate=true;geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,mat);mesh.position.set((mapX(w)+mapX(e))/2,0,(mapZ(n)+mapZ(s))/2);mesh.receiveShadow=false;root.add(mesh);
  const ocean=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),new THREE.MeshBasicMaterial({color:'#1f5fbf'}));ocean.rotation.x=-Math.PI/2;ocean.position.y=-.05;root.add(ocean);
  // Armies: a 5x3 formation of toon soldiers with a banner, pooled.
  const FACTION={red:'#c8231d',blue:'#2c55b8',gold:'#d9a420'},armies=[];
  for(let a=0;a<4;a++){const g=new THREE.Group();g.visible=false;root.add(g);const mats={};
    for(const [k,c] of Object.entries(FACTION))mats[k]=toon({color:c});
    const units=[];for(let r=0;r<3;r++)for(let c=0;c<5;c++){const u=new THREE.Group();
      const body=add(new THREE.CylinderGeometry(.28,.36,1,8),mats.red,0,.5,0,u);add(new THREE.SphereGeometry(.24,10,8),toon({color:'#f2c9a0'}),0,1.22,0,u);
      add(new THREE.CylinderGeometry(.03,.03,1.6,5),M.wood,.38,.8,0,u);u.position.set((c-2)*.9,0,(r-1)*.9);g.add(u);units.push({u,body});}
    const pole=add(new THREE.CylinderGeometry(.05,.05,3.2,6),M.wood,0,1.6,-1.6,g);const flag=add(new THREE.PlaneGeometry(1.2,.75),toon({color:'#c8231d',side:THREE.DoubleSide}),.6,2.8,-1.6,g);
    armies.push({g,units,mats,flag});}
  const cities=[];for(let c=0;c<6;c++){const g=new THREE.Group();g.visible=false;root.add(g);
    add(tbox(1,1,1),M.stone,0,.5,0,g);add(new THREE.ConeGeometry(.75,.9,4),PAINT.red,0,1.45,0,g);for(const x of [-.75,.75])add(tbox(.45,1.5,.45),M.stone,x,.75,0,g);cities.push(g);}
  Object.assign(MAP,{ready:true,U,overlays,hAt,relief,armies,cities,bounds:{w,e,s,n},FACTION});
}
const mapEase=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
function mapState(state,f){
  const m=state.map;if(!MAP.ready||!m)return;const {U,bounds:B}=MAP;
  const key=m.regions.join(',');U.terr.value=MAP.overlays.get(key)||null;U.has.value=m.regions.length&&U.terr.value?1:0;
  const p=state.mapProgress;
  // The sweep grows outward from the focus point so borders visibly spread over the years.
  U.center.value.set((m.focus[0]-B.w)/(B.e-B.w),(m.focus[1]-B.s)/(B.n-B.s));
  const full=1.6,grow=mapEase(p/.7);
  U.radius.value=m.reveal==='grow'?.02+grow*full:m.reveal==='shrink'?full-(full-.12)*mapEase(p):full;
  U.pulse.value=.9+.1*Math.sin(f*.12);
  const span=60/m.focus[2],unit=span*MAP_S*.012;
  MAP.armies.forEach((a,i)=>{const ar=(m.armies||[])[i];a.g.visible=!!ar;if(!ar)return;
    const t=mapEase(p*1.15),lon=ar.from[0]+(ar.to[0]-ar.from[0])*t,lat=ar.from[1]+(ar.to[1]-ar.from[1])*t;
    a.g.position.set(mapX(lon),Math.max(0,MAP.hAt(lon,lat))*MAP.relief,mapZ(lat));a.g.scale.setScalar(unit);
    a.g.rotation.y=Math.atan2(mapX(ar.to[0])-mapX(ar.from[0]),mapZ(ar.to[1])-mapZ(ar.from[1]));
    a.units.forEach(({u,body},k)=>{body.material=a.mats[ar.side]||a.mats.red;u.position.y=Math.abs(Math.sin(f*.35+k))*.25;});
    a.flag.material=a.mats[ar.side]||a.mats.red;a.flag.rotation.y=.25*Math.sin(f*.2+i);});
  MAP.cities.forEach((g,i)=>{const c=(m.cities||[])[i];g.visible=!!c;if(!c)return;
    g.position.set(mapX(c.at[0]),Math.max(0,MAP.hAt(c.at[0],c.at[1]))*MAP.relief,mapZ(c.at[1]));g.scale.setScalar(unit*1.4*(1+.05*Math.sin(f*.1+i)));});
}
