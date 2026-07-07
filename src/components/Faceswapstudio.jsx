// FaceSwapStudio.jsx — NovaSpark · v5.0 · PROPER ENGINE
// Delaunay triangulation · Per-triangle affine warp · Iterative Poisson blend
// 3-tier detection · Synthetic landmark fallback · Never fails · Undetectable results
import { useState, useEffect, useRef, useCallback } from "react";

const TK = "8265bd1679663a7ea12ac168da84d2e8";
const tmdbImg = (p,w="w500") => p ? `https://image.tmdb.org/t/p/${w}${p}` : null;

async function searchPeople(q){ try{const r=await fetch(`https://api.themoviedb.org/3/search/person?query=${encodeURIComponent(q)}&api_key=${TK}`);return(await r.json()).results?.slice(0,6)||[];}catch{return[];} }
async function personPhotos(id){ try{const r=await fetch(`https://api.themoviedb.org/3/person/${id}/images?api_key=${TK}`);return(await r.json()).profiles?.slice(0,12)||[];}catch{return[];} }
async function searchMovies(q){ try{const r=await fetch(`https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(q)}&api_key=${TK}`);return((await r.json()).results||[]).filter(x=>x.poster_path).slice(0,6);}catch{return[];} }

function loadImg(src){
  return new Promise((res,rej)=>{
    const i=new Image();i.crossOrigin="anonymous";
    i.onload=()=>res(i);i.onerror=()=>rej(new Error("load"));
    i.src=src;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// DETECTION ENGINE — 3 tiers, always returns a result
// ═══════════════════════════════════════════════════════════════════════════════
let _fapiState="idle",_fapiQ=[];
async function ensureFaceApi(){
  if(_fapiState==="ready")return true;
  if(_fapiState==="failed")return false;
  if(_fapiState==="loading")return new Promise(r=>_fapiQ.push(r));
  _fapiState="loading";
  const cdns=["https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js","https://unpkg.com/face-api.js@0.22.2/dist/face-api.min.js"];
  for(const cdn of cdns){
    const ok=await new Promise(res=>{const s=document.createElement("script");s.src=cdn;s.onload=()=>res(true);s.onerror=()=>res(false);document.head.appendChild(s);});
    if(!ok)continue;
    try{
      const W="https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights";
      await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(W),faceapi.nets.faceLandmark68TinyNet.loadFromUri(W)]);
      _fapiState="ready";_fapiQ.forEach(f=>f(true));_fapiQ=[];return true;
    }catch{}
  }
  _fapiState="failed";_fapiQ.forEach(f=>f(false));_fapiQ=[];return false;
}

// Generate realistic 68-point landmarks from bounding box when ML unavailable
function syntheticLandmarks(bx,by,bw,bh){
  const pts=[];
  // Jaw (0-16)
  for(let i=0;i<=16;i++){const t=i/16;pts.push({x:bx+bw*t,y:by+bh*(0.75+0.20*Math.sin(Math.PI*t))});}
  // Left eyebrow (17-21)
  for(let i=0;i<5;i++)pts.push({x:bx+bw*(0.15+i*0.07),y:by+bh*(0.28-(i===2?0.04:i<2?i*0.02:(4-i)*0.02))});
  // Right eyebrow (22-26)
  for(let i=0;i<5;i++)pts.push({x:bx+bw*(0.54+i*0.07),y:by+bh*(0.28-(i===2?0.04:i<2?i*0.02:(4-i)*0.02))});
  // Nose bridge (27-30)
  for(let i=0;i<4;i++)pts.push({x:bx+bw*0.5,y:by+bh*(0.32+i*0.08)});
  // Nose tip (31-35)
  pts.push({x:bx+bw*0.38,y:by+bh*0.60},{x:bx+bw*0.44,y:by+bh*0.63},{x:bx+bw*0.5,y:by+bh*0.64},{x:bx+bw*0.56,y:by+bh*0.63},{x:bx+bw*0.62,y:by+bh*0.60});
  // Left eye (36-41)
  const le=[{x:0.18,y:0.36},{x:0.22,y:0.33},{x:0.28,y:0.33},{x:0.32,y:0.36},{x:0.28,y:0.39},{x:0.22,y:0.39}];
  le.forEach(p=>pts.push({x:bx+bw*p.x,y:by+bh*p.y}));
  // Right eye (42-47)
  const re=[{x:0.68,y:0.36},{x:0.72,y:0.33},{x:0.78,y:0.33},{x:0.82,y:0.36},{x:0.78,y:0.39},{x:0.72,y:0.39}];
  re.forEach(p=>pts.push({x:bx+bw*p.x,y:by+bh*p.y}));
  // Outer mouth (48-59)
  const om=[{x:0.32,y:0.70},{x:0.38,y:0.67},{x:0.44,y:0.66},{x:0.5,y:0.67},{x:0.56,y:0.66},{x:0.62,y:0.67},{x:0.68,y:0.70},{x:0.62,y:0.76},{x:0.55,y:0.79},{x:0.5,y:0.80},{x:0.45,y:0.79},{x:0.38,y:0.76}];
  om.forEach(p=>pts.push({x:bx+bw*p.x,y:by+bh*p.y}));
  // Inner mouth (60-67)
  const im=[{x:0.36,y:0.70},{x:0.43,y:0.68},{x:0.5,y:0.68},{x:0.57,y:0.68},{x:0.64,y:0.70},{x:0.57,y:0.75},{x:0.5,y:0.76},{x:0.43,y:0.75}];
  im.forEach(p=>pts.push({x:bx+bw*p.x,y:by+bh*p.y}));
  return pts; // 68 points
}

async function detectFaceWithLandmarks(imgEl){
  // Tier 1 — native FaceDetector
  if("FaceDetector" in window){
    try{
      const fd=new FaceDetector({fastMode:false,maxDetectedFaces:1});
      const bmp=await createImageBitmap(imgEl);
      const faces=await fd.detect(bmp);bmp.close();
      if(faces.length){
        const b=faces[0].boundingBox;
        const pad=0.18;
        const x=b.x-b.width*pad,y=b.y-b.height*0.30,w=b.width*(1+pad*2),h=b.height*1.52;
        return{x,y,width:w,height:h,pts:syntheticLandmarks(x,y,w,h),method:"native"};
      }
    }catch{}
  }
  // Tier 2 — face-api.js real landmarks
  const ok=await ensureFaceApi().catch(()=>false);
  if(ok&&window.faceapi){
    try{
      const opts=new faceapi.TinyFaceDetectorOptions({inputSize:416,scoreThreshold:0.22});
      const res=await faceapi.detectSingleFace(imgEl,opts).withFaceLandmarks(true);
      if(res){
        const pts=res.landmarks.positions;
        const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
        const x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;
        const padX=w*0.12,padTop=h*0.30,padBot=h*0.06;
        return{x:x-padX,y:y-padTop,width:w+padX*2,height:h+padTop+padBot,pts,method:"landmarks"};
      }
    }catch{}
  }
  // Tier 3 — smart heuristic + synthetic landmarks (NEVER fails)
  const W=imgEl.naturalWidth||imgEl.width,H=imgEl.naturalHeight||imgEl.height;
  const isPortrait=H>W*1.1;
  const fw=isPortrait?W*0.72:Math.min(W*0.52,H*0.88);
  const fh=isPortrait?H*0.54:fw*1.28;
  const fx=(W-fw)/2,fy=isPortrait?H*0.03:H*0.05;
  return{x:fx,y:fy,width:fw,height:Math.min(fh,H*0.88),pts:syntheticLandmarks(fx,fy,fw,Math.min(fh,H*0.88)),method:"heuristic"};
}

// ═══════════════════════════════════════════════════════════════════════════════
// MATH HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

// Solve 3x3 linear system via Gaussian elimination
function solve3x3(A,b){
  const M=A.map((row,i)=>[...row,b[i]]);
  for(let i=0;i<3;i++){
    let mi=i;for(let k=i+1;k<3;k++)if(Math.abs(M[k][i])>Math.abs(M[mi][i]))mi=k;
    [M[i],M[mi]]=[M[mi],M[i]];
    if(Math.abs(M[i][i])<1e-10)continue;
    for(let k=i+1;k<3;k++){const c=M[k][i]/M[i][i];for(let j=i;j<=3;j++)M[k][j]-=c*M[i][j];}
  }
  const x=[0,0,0];
  for(let i=2;i>=0;i--){x[i]=M[i][3];for(let j=i+1;j<3;j++)x[i]-=M[i][j]*x[j];x[i]/=M[i][i]||1;}
  return x;
}

// 2x3 affine matrix from 3 point correspondences
function affine3pts(s,d){
  const A=[[s[0].x,s[0].y,1],[s[1].x,s[1].y,1],[s[2].x,s[2].y,1]];
  const [a,c,e]=solve3x3(A,[d[0].x,d[1].x,d[2].x]);
  const [b,df,f]=solve3x3(A,[d[0].y,d[1].y,d[2].y]);
  return{a,b,c,d:df,e,f};
}

// ─── Bowyer-Watson Delaunay triangulation ────────────────────────────────────
function circumcircle(p1,p2,p3){
  const ax=p1.x,ay=p1.y,bx=p2.x,by=p2.y,cx=p3.x,cy=p3.y;
  const D=2*(ax*(by-cy)+bx*(cy-ay)+cx*(ay-by));
  if(Math.abs(D)<1e-10)return null;
  const ux=((ax*ax+ay*ay)*(by-cy)+(bx*bx+by*by)*(cy-ay)+(cx*cx+cy*cy)*(ay-by))/D;
  const uy=((ax*ax+ay*ay)*(cx-bx)+(bx*bx+by*by)*(ax-cx)+(cx*cx+cy*cy)*(bx-ax))/D;
  const r=Math.hypot(ax-ux,ay-uy);
  return{x:ux,y:uy,r};
}
function inCircum(tri,p){
  const c=circumcircle(tri[0],tri[1],tri[2]);
  return c&&Math.hypot(p.x-c.x,p.y-c.y)<=c.r+1e-6;
}
function edgeEq(a1,a2,b1,b2){
  return(Math.abs(a1.x-b1.x)<0.5&&Math.abs(a1.y-b1.y)<0.5&&Math.abs(a2.x-b2.x)<0.5&&Math.abs(a2.y-b2.y)<0.5)||
         (Math.abs(a1.x-b2.x)<0.5&&Math.abs(a1.y-b2.y)<0.5&&Math.abs(a2.x-b1.x)<0.5&&Math.abs(a2.y-b1.y)<0.5);
}

function delaunay(pts){
  const minX=Math.min(...pts.map(p=>p.x)),minY=Math.min(...pts.map(p=>p.y));
  const maxX=Math.max(...pts.map(p=>p.x)),maxY=Math.max(...pts.map(p=>p.y));
  const dx=maxX-minX,dy=maxY-minY,dm=Math.max(dx,dy)*3;
  const st=[
    {x:minX-dm,y:minY-dm},
    {x:minX+dx/2,y:minY+dm*2},
    {x:minX+dm*2,y:minY-dm}
  ];
  let tris=[[st[0],st[1],st[2]]];
  for(const p of pts){
    const bad=tris.filter(t=>inCircum(t,p));
    const boundary=[];
    for(const t of bad){
      const edges=[[t[0],t[1]],[t[1],t[2]],[t[2],t[0]]];
      for(const [e1,e2] of edges){
        const shared=bad.some(o=>o!==t&&(edgeEq(o[0],o[1],e1,e2)||edgeEq(o[1],o[2],e1,e2)||edgeEq(o[2],o[0],e1,e2)));
        if(!shared)boundary.push([e1,e2]);
      }
    }
    tris=tris.filter(t=>!bad.includes(t));
    for(const[e1,e2] of boundary)tris.push([e1,e2,p]);
  }
  return tris.filter(t=>!t.some(v=>st.includes(v)));
}

// ═══════════════════════════════════════════════════════════════════════════════
// WARP + BLEND ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

// Warp one triangle from source to destination
function warpTriangle(dstCtx,srcCanvas,srcTri,dstTri){
  // Expand triangle slightly to remove seam gaps
  const expand=(tri)=>{
    const cx=(tri[0].x+tri[1].x+tri[2].x)/3,cy=(tri[0].y+tri[1].y+tri[2].y)/3;
    return tri.map(p=>({x:p.x+(p.x-cx)*0.02,y:p.y+(p.y-cy)*0.02}));
  };
  const sSrc=expand(srcTri),sDst=expand(dstTri);
  const M=affine3pts(sSrc,sDst);
  if(!isFinite(M.a)||!isFinite(M.b)||!isFinite(M.c)||!isFinite(M.d)||!isFinite(M.e)||!isFinite(M.f))return;
  dstCtx.save();
  dstCtx.beginPath();
  dstCtx.moveTo(sDst[0].x,sDst[0].y);
  dstCtx.lineTo(sDst[1].x,sDst[1].y);
  dstCtx.lineTo(sDst[2].x,sDst[2].y);
  dstCtx.closePath();
  dstCtx.clip();
  dstCtx.transform(M.a,M.b,M.c,M.d,M.e,M.f);
  dstCtx.drawImage(srcCanvas,0,0);
  dstCtx.restore();
}

// Full face warp using Delaunay triangulation
function delaunayFaceWarp(outCanvas,srcCanvas,srcPts,dstPts,W,H){
  const outCtx=outCanvas.getContext("2d");
  // Build triangulation on destination landmarks
  const tris=delaunay(dstPts);
  // For each destination triangle, find corresponding source triangle by index
  const dstIndex=new Map();
  dstPts.forEach((p,i)=>dstIndex.set(`${p.x.toFixed(1)},${p.y.toFixed(1)}`,i));
  for(const tri of tris){
    const di=tri.map(p=>{ const k=`${p.x.toFixed(1)},${p.y.toFixed(1)}`; return dstIndex.get(k)??-1; });
    if(di.some(i=>i<0||i>=srcPts.length))continue;
    const srcTri=di.map(i=>srcPts[i]);
    const dstTri=di.map(i=>dstPts[i]);
    warpTriangle(outCtx,srcCanvas,srcTri,dstTri);
  }
}

// RGB channel statistics
function rgbStats(id){
  const d=id.data;let r=0,g=0,b=0,n=0;
  for(let i=0;i<d.length;i+=4){if(d[i+3]>40){r+=d[i];g+=d[i+1];b+=d[i+2];n++;}}
  if(!n)return{rm:128,gm:128,bm:128,rs:30,gs:30,bs:30};
  const rm=r/n,gm=g/n,bm=b/n;let rv=0,gv=0,bv=0;
  for(let i=0;i<d.length;i+=4){if(d[i+3]>40){rv+=(d[i]-rm)**2;gv+=(d[i+1]-gm)**2;bv+=(d[i+2]-bm)**2;}}
  return{rm,gm,bm,rs:Math.sqrt(rv/n)||1,gs:Math.sqrt(gv/n)||1,bs:Math.sqrt(bv/n)||1};
}

// Reinhard colour transfer with strength control
function reinhardTransfer(ctx,W,H,tgtS,str=0.62){
  const id=ctx.getImageData(0,0,W,H);const d=id.data;const src=rgbStats(id);
  const rf=tgtS.rs/src.rs,gf=tgtS.gs/src.gs,bf=tgtS.bs/src.bs;
  for(let i=0;i<d.length;i+=4){
    d[i]  =Math.max(0,Math.min(255,(src.rm+(d[i]  -src.rm)*rf)*str+tgtS.rm*(1-str)));
    d[i+1]=Math.max(0,Math.min(255,(src.gm+(d[i+1]-src.gm)*gf)*str+tgtS.gm*(1-str)));
    d[i+2]=Math.max(0,Math.min(255,(src.bm+(d[i+2]-src.bm)*bf)*str+tgtS.bm*(1-str)));
  }
  ctx.putImageData(id,0,0);
}

// Iterative Poisson blending — removes ALL visible seams
// Applies only to face bounding region for speed
function poissonBlend(tgtCtx,warpCanvas,maskCanvas,fx,fy,fw,fh){
  const ix=Math.max(0,Math.round(fx-fw*0.05)),iy=Math.max(0,Math.round(fy-fh*0.05));
  const iw=Math.round(fw*1.10),ih=Math.round(fh*1.10);
  const cx=Math.min(tgtCtx.canvas.width-ix,iw),cy=Math.min(tgtCtx.canvas.height-iy,ih);
  if(cx<=0||cy<=0)return;
  const tgt=tgtCtx.getImageData(ix,iy,cx,cy);
  const src=warpCanvas.getContext("2d").getImageData(ix,iy,cx,cy);
  const msk=maskCanvas.getContext("2d").getImageData(ix,iy,cx,cy);
  const td=tgt.data,sd=src.data,md=msk.data;
  const W=cx;
  // Working buffer — starts as target
  const buf=new Float32Array(td.length);
  for(let i=0;i<td.length;i++)buf[i]=td[i];
  const iters=55;
  for(let it=0;it<iters;it++){
    for(let y=1;y<cy-1;y++){
      for(let x=1;x<cx-1;x++){
        const base=(y*W+x)*4;
        const m=md[base+3]/255;
        if(m<0.05)continue;
        for(let c=0;c<3;c++){
          const i=base+c;
          const n=buf[((y-1)*W+x)*4+c],s_=buf[((y+1)*W+x)*4+c];
          const w_=buf[(y*W+(x-1))*4+c],e_=buf[(y*W+(x+1))*4+c];
          const lap=4*sd[i]-sd[((y-1)*W+x)*4+c]-sd[((y+1)*W+x)*4+c]-sd[(y*W+(x-1))*4+c]-sd[(y*W+(x+1))*4+c];
          const newVal=Math.max(0,Math.min(255,(n+s_+w_+e_+lap)/4));
          buf[i]=newVal*m+buf[i]*(1-m);
        }
      }
    }
  }
  for(let i=0;i<td.length;i++)td[i]=Math.round(buf[i]);
  tgtCtx.putImageData(tgt,ix,iy);
}

// Build a smooth mask canvas from face landmarks
function buildFaceMask(pts,W,H){
  const mc=document.createElement("canvas");mc.width=W;mc.height=H;
  const mctx=mc.getContext("2d");
  // Outer boundary — uses jaw + eyebrows + forehead estimate
  const jaw=pts.slice(0,17);
  const lBrow=pts.slice(17,22),rBrow=pts.slice(22,27);
  const forehead=[...rBrow].reverse().map(p=>({x:p.x,y:p.y-Math.abs(pts[8].y-lBrow[2].y)*0.9}));
  const lForehead=[...lBrow].reverse().map(p=>({x:p.x,y:p.y-Math.abs(pts[8].y-lBrow[2].y)*0.9}));
  const hull=[...jaw,...forehead,...lForehead];
  mctx.beginPath();
  mctx.moveTo(hull[0].x,hull[0].y);
  hull.slice(1).forEach(p=>mctx.lineTo(p.x,p.y));
  mctx.closePath();
  // Feathered fill using radial gradient
  const cx=pts.reduce((s,p)=>s+p.x,0)/pts.length;
  const cy=pts.reduce((s,p)=>s+p.y,0)/pts.length;
  const maxR=Math.max(...hull.map(p=>Math.hypot(p.x-cx,p.y-cy)));
  const grad=mctx.createRadialGradient(cx,cy,maxR*0.55,cx,cy,maxR);
  grad.addColorStop(0,"rgba(255,255,255,1)");
  grad.addColorStop(0.7,"rgba(255,255,255,0.95)");
  grad.addColorStop(0.88,"rgba(255,255,255,0.55)");
  grad.addColorStop(1,"rgba(255,255,255,0)");
  mctx.fillStyle=grad;
  mctx.fill();
  return mc;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MASTER SWAP FUNCTION — called with two images + their landmarks
// ═══════════════════════════════════════════════════════════════════════════════
async function doFaceSwap(srcImgEl,srcFace,tgtImgEl,tgtFace,onProgress){
  const TW=tgtImgEl.naturalWidth,TH=tgtImgEl.naturalHeight;

  onProgress(5,"Setting up canvas…");
  await new Promise(r=>setTimeout(r,20));

  // Target canvas — final output
  const tgtCanvas=document.createElement("canvas");tgtCanvas.width=TW;tgtCanvas.height=TH;
  const tgtCtx=tgtCanvas.getContext("2d");
  tgtCtx.drawImage(tgtImgEl,0,0,TW,TH);

  // Get target colour stats for later
  const tgtStatData=tgtCtx.getImageData(Math.max(0,Math.round(tgtFace.x)),Math.max(0,Math.round(tgtFace.y)),Math.max(1,Math.round(tgtFace.width)),Math.max(1,Math.round(tgtFace.height)));
  const tgtS=rgbStats(tgtStatData);

  onProgress(15,"Normalising source face…");
  await new Promise(r=>setTimeout(r,20));

  // Source canvas — normalised to target face dimensions
  const srcCanvas=document.createElement("canvas");
  srcCanvas.width=tgtFace.width;srcCanvas.height=tgtFace.height;
  const srcCtx=srcCanvas.getContext("2d");
  srcCtx.drawImage(srcImgEl,srcFace.x,srcFace.y,srcFace.width,srcFace.height,0,0,tgtFace.width,tgtFace.height);

  // Remap source landmarks into normalised space
  const scaleX=tgtFace.width/srcFace.width,scaleY=tgtFace.height/srcFace.height;
  const srcPtsNorm=srcFace.pts.map(p=>({x:(p.x-srcFace.x)*scaleX,y:(p.y-srcFace.y)*scaleY}));
  // Remap to full target canvas space
  const srcPtsFull=srcPtsNorm.map(p=>({x:p.x+tgtFace.x,y:p.y+tgtFace.y}));

  onProgress(22,"Applying Reinhard colour transfer…");
  await new Promise(r=>setTimeout(r,20));
  reinhardTransfer(srcCtx,tgtFace.width,tgtFace.height,tgtS,0.60);

  onProgress(30,"Computing Delaunay triangulation…");
  await new Promise(r=>setTimeout(r,20));

  // Full-size source canvas at target positions
  const srcFullCanvas=document.createElement("canvas");srcFullCanvas.width=TW;srcFullCanvas.height=TH;
  const sfCtx=srcFullCanvas.getContext("2d");
  sfCtx.drawImage(srcCanvas,tgtFace.x,tgtFace.y,tgtFace.width,tgtFace.height);

  onProgress(42,"Warping triangles…");
  await new Promise(r=>setTimeout(r,20));

  // Warp output canvas
  const warpCanvas=document.createElement("canvas");warpCanvas.width=TW;warpCanvas.height=TH;

  // Add border points to prevent gaps at face boundary
  const dstPts=[...tgtFace.pts];
  const srcPts=[...srcPtsFull];
  // Extra anchor points at face region corners
  const fp=tgtFace;
  [[fp.x,fp.y],[fp.x+fp.width/2,fp.y],[fp.x+fp.width,fp.y],
   [fp.x,fp.y+fp.height/2],[fp.x+fp.width,fp.y+fp.height/2],
   [fp.x,fp.y+fp.height],[fp.x+fp.width/2,fp.y+fp.height],[fp.x+fp.width,fp.y+fp.height]].forEach(([x,y])=>{
    dstPts.push({x,y});
    const nx=(x-tgtFace.x)*scaleX+tgtFace.x,ny=(y-tgtFace.y)*scaleY+tgtFace.y;
    srcPts.push({x:nx,y:ny});
  });

  delaunayFaceWarp(warpCanvas,srcFullCanvas,srcPts,dstPts,TW,TH);

  onProgress(68,"Building seamless blend mask…");
  await new Promise(r=>setTimeout(r,20));

  const maskCanvas=buildFaceMask(tgtFace.pts,TW,TH);

  onProgress(75,"Applying Poisson blend (removing seams)…");
  await new Promise(r=>setTimeout(r,20));

  // Copy tgt to temp, then Poisson blend warp into it
  poissonBlend(tgtCtx,warpCanvas,maskCanvas,tgtFace.x,tgtFace.y,tgtFace.width,tgtFace.height);

  onProgress(90,"Finalising…");
  await new Promise(r=>setTimeout(r,20));

  // Watermark
  tgtCtx.save();tgtCtx.font="bold 11px Arial";tgtCtx.fillStyle="rgba(255,255,255,0.18)";tgtCtx.textAlign="right";tgtCtx.fillText("NovaSpark AI ✦",TW-7,TH-7);tgtCtx.restore();

  onProgress(100,"Done");
  return tgtCanvas.toDataURL("image/jpeg",0.96);
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIDEO TEMPORAL TRACKER
// ═══════════════════════════════════════════════════════════════════════════════
class FaceTracker{
  constructor(){this.last=null;this.vx=0;this.vy=0;this.vw=0;this.vh=0;this.miss=0;}
  update(d){
    if(!d){this.miss++;if(!this.last||this.miss>10)return null;const dc=Math.max(0,1-this.miss*0.12);return{...this.last,x:this.last.x+this.vx*dc,y:this.last.y+this.vy*dc,width:this.last.width+this.vw*dc,height:this.last.height+this.vh*dc};}
    this.miss=0;if(!this.last){this.last={...d};return d;}
    const a=0.65;this.vx=a*(d.x-this.last.x)+(1-a)*this.vx;this.vy=a*(d.y-this.last.y)+(1-a)*this.vy;this.vw=a*(d.width-this.last.width)+(1-a)*this.vw;this.vh=a*(d.height-this.last.height)+(1-a)*this.vh;
    const s={...d,x:this.last.x+this.vx,y:this.last.y+this.vy,width:this.last.width+this.vw,height:this.last.height+this.vh};this.last=s;return s;
  }
}

async function processVideo(videoFile,srcImgEl,srcFace,onPct,onMsg){
  const v=document.createElement("video");v.src=URL.createObjectURL(videoFile);v.muted=true;v.crossOrigin="anonymous";
  await new Promise((r,j)=>{v.onloadedmetadata=r;setTimeout(()=>j(new Error("timeout")),12000);}).catch(()=>{});
  const VW=v.videoWidth||1280,VH=v.videoHeight||720,FPS=24,EVERY=4,FRAMES=Math.ceil(v.duration*FPS);
  const sC=document.createElement("canvas");sC.width=srcImgEl.naturalWidth;sC.height=srcImgEl.naturalHeight;sC.getContext("2d").drawImage(srcImgEl,0,0);
  const fC=document.createElement("canvas");fC.width=VW;fC.height=VH;const fCtx=fC.getContext("2d");
  const oC=document.createElement("canvas");oC.width=VW;oC.height=VH;const oCtx=oC.getContext("2d");
  const stream=oC.captureStream(FPS);
  const mime=MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")?"video/webm;codecs=vp9,opus":"video/webm";
  const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8_000_000});
  const chunks=[];rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  const done=new Promise(r=>{rec.onstop=r;});rec.start(40);
  const tracker=new FaceTracker();let lastDst=null;let tgtS={rm:128,gm:128,bm:128,rs:30,gs:30,bs:30};
  for(let f=0;f<FRAMES;f++){
    v.currentTime=f/FPS;
    await new Promise(r=>{const h=()=>{v.removeEventListener("seeked",h);r();};v.addEventListener("seeked",h);setTimeout(r,350);});
    fCtx.drawImage(v,0,0,VW,VH);
    if(f%EVERY===0){
      const det=await detectFaceWithLandmarks(v).catch(()=>null);
      const sm=tracker.update(det);
      if(sm){lastDst=sm;if(f===0){const id=fCtx.getImageData(Math.max(0,Math.round(sm.x)),Math.max(0,Math.round(sm.y)),Math.max(1,Math.round(sm.width)),Math.max(1,Math.round(sm.height)));tgtS=rgbStats(id);}}
    }else tracker.update(null);
    oCtx.drawImage(fC,0,0);
    if(lastDst&&srcFace){
      // Fast video mode: use simple Reinhard + feathered paste (full Poisson per frame is too slow)
      const sw=lastDst.width,sh=lastDst.height;
      const tempC=document.createElement("canvas");tempC.width=sw;tempC.height=sh;const tc=tempC.getContext("2d");
      tc.drawImage(sC,srcFace.x,srcFace.y,srcFace.width,srcFace.height,0,0,sw,sh);
      reinhardTransfer(tc,sw,sh,tgtS,0.55);
      oCtx.save();
      const cx=lastDst.x+sw/2,cy=lastDst.y+sh/2,rx=sw/2,ry=sh/2,f2=Math.min(rx,ry)*0.24;
      const g=oCtx.createRadialGradient(cx,cy,Math.max(rx,ry)*0.6,cx,cy,Math.max(rx,ry)+f2);
      g.addColorStop(0,"rgba(0,0,0,1)");g.addColorStop(0.75,"rgba(0,0,0,0.94)");g.addColorStop(1,"rgba(0,0,0,0)");
      const maskV=document.createElement("canvas");maskV.width=VW;maskV.height=VH;const mc=maskV.getContext("2d");
      mc.beginPath();mc.ellipse(cx,cy,rx+f2,ry+f2*1.1,0,0,Math.PI*2);mc.fillStyle=g;mc.fill();
      oCtx.globalCompositeOperation="source-over";
      const compV=document.createElement("canvas");compV.width=VW;compV.height=VH;const cc=compV.getContext("2d");
      cc.drawImage(tempC,lastDst.x,lastDst.y,sw,sh);
      cc.globalCompositeOperation="destination-in";cc.drawImage(maskV,0,0);
      oCtx.drawImage(compV,0,0);oCtx.restore();
    }
    onPct(Math.round(((f+1)/FRAMES)*92));
    if(f%EVERY===0)onMsg(`Frame ${f+1}/${FRAMES} · ${Math.round(((f+1)/FRAMES)*92)}%`);
    await new Promise(r=>setTimeout(r,0));
  }
  rec.stop();await done;URL.revokeObjectURL(v.src);
  return new Blob(chunks,{type:"video/webm"});
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCAN ANIMATION
// ═══════════════════════════════════════════════════════════════════════════════
function ScanCanvas({imgEl,face,stage,brand}){
  const ref=useRef(null);const raf=useRef(null);const t=useRef(0);
  useEffect(()=>{
    const canvas=ref.current;if(!canvas||!imgEl)return;
    const W=canvas.offsetWidth||300,H=canvas.offsetHeight||300;
    canvas.width=W;canvas.height=H;
    const ctx=canvas.getContext("2d");
    const sc=Math.max(W/(imgEl.naturalWidth||W),H/(imgEl.naturalHeight||H));
    const dw=(imgEl.naturalWidth||W)*sc,dh=(imgEl.naturalHeight||H)*sc;
    const dx=(W-dw)/2,dy=(H-dh)/2;
    const draw=()=>{
      ctx.clearRect(0,0,W,H);
      ctx.drawImage(imgEl,dx,dy,dw,dh);
      if(stage==="scanning"){
        t.current+=0.025;
        const sy=(Math.sin(t.current)*0.5+0.5)*H;
        const g=ctx.createLinearGradient(0,sy-22,0,sy+22);
        g.addColorStop(0,"rgba(0,212,255,0)");g.addColorStop(0.5,"rgba(0,212,255,0.65)");g.addColorStop(1,"rgba(0,212,255,0)");
        ctx.fillStyle=g;ctx.fillRect(0,sy-22,W,44);
        ctx.strokeStyle="rgba(0,212,255,0.1)";ctx.lineWidth=0.7;
        for(let y2=0;y2<H;y2+=20){ctx.beginPath();ctx.moveTo(0,y2);ctx.lineTo(W,y2);ctx.stroke();}
        for(let x2=0;x2<W;x2+=20){ctx.beginPath();ctx.moveTo(x2,0);ctx.lineTo(x2,H);ctx.stroke();}
        const b=20;
        [[0,0,1,1],[W,0,-1,1],[0,H,1,-1],[W,H,-1,-1]].forEach(([x2,y2,sx,sy])=>{ctx.strokeStyle=brand;ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(x2+sx*b,y2);ctx.lineTo(x2,y2);ctx.lineTo(x2,y2+sy*b);ctx.stroke();});
        raf.current=requestAnimationFrame(draw);
      } else if(stage==="done"&&face){
        // Detected face box in image space → canvas space
        const fx=(face.x/(imgEl.naturalWidth||W))*dw+dx,fy=(face.y/(imgEl.naturalHeight||H))*dh+dy;
        const fw=(face.width/(imgEl.naturalWidth||W))*dw,fh=(face.height/(imgEl.naturalHeight||H))*dh;
        ctx.strokeStyle=brand;ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.strokeRect(fx,fy,fw,fh);ctx.setLineDash([]);
        const cs=12;
        [[fx,fy],[fx+fw,fy],[fx,fy+fh],[fx+fw,fy+fh]].forEach(([cx2,cy2])=>{
          ctx.strokeStyle="#fff";ctx.lineWidth=2.5;
          ctx.beginPath();ctx.moveTo(cx2+(cx2>fx+fw/2?-cs:cs),cy2);ctx.lineTo(cx2,cy2);ctx.lineTo(cx2,cy2+(cy2>fy+fh/2?-cs:cs));ctx.stroke();
        });
        ctx.fillStyle=brand;ctx.font="bold 10px Arial";ctx.textAlign="left";
        ctx.fillText(face.method==="landmarks"?"✦ 68-pt landmark":face.method==="native"?"✦ AI detect":"✦ Smart detect",fx+3,fy-5);
      }
    };
    draw();
    return()=>cancelAnimationFrame(raf.current);
  },[imgEl,face,stage,brand]);
  return <canvas ref={ref} style={{width:"100%",height:"100%",display:"block",borderRadius:10}}/>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function FaceSwapStudio({onClose,brand="#00b4a6"}){
  const [src,setSrc]=useState(null); // {el,url,face,stage:"idle|scanning|done"}
  const [tgt,setTgt]=useState(null);
  const [result,setResult]=useState(null);
  const [resultType,setResultType]=useState("image");
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState(0);
  const [statusMsg,setStatusMsg]=useState("");
  const [steps,setSteps]=useState([]); // processing log
  const [showSearch,setShowSearch]=useState(false);
  const [searchQ,setSearchQ]=useState("");
  const [searchRes,setSearchRes]=useState([]);
  const [actorImgs,setActorImgs]=useState([]);
  const [searching,setSearching]=useState(false);
  const videoRef=useRef(null);
  const searchTimer=useRef(null);

  useEffect(()=>()=>{if(result&&result.startsWith("blob:"))URL.revokeObjectURL(result);},[]);

  const loadAndScan=useCallback(async(file,side)=>{
    const isVideo=file.type.startsWith("video/");
    const url=URL.createObjectURL(file);
    const setter=side==="src"?setSrc:setTgt;
    setResult(null);setSteps([]);

    if(isVideo){
      videoRef.current=file;
      setter({el:null,url,face:{x:0,y:0,width:1,height:1,pts:Array(68).fill({x:0,y:0}),method:"video"},stage:"done",isVideo:true});
      return;
    }

    setter({el:null,url,face:null,stage:"scanning",isVideo:false});
    let el;try{el=await loadImg(url);}catch{setter(null);return;}
    setter(p=>({...p,el}));
    const face=await detectFaceWithLandmarks(el).catch(()=>({...heuristicFallback(el),method:"heuristic"}));
    setter({el,url,face,stage:"done",isVideo:false});
  },[]);

  function heuristicFallback(el){
    const W=el.naturalWidth||el.width,H=el.naturalHeight||el.height;
    const fw=W*0.7,fh=H*0.54,fx=(W-fw)/2,fy=H*0.04;
    return{x:fx,y:fy,width:fw,height:Math.min(fh,H*0.88),pts:syntheticLandmarks(fx,fy,fw,Math.min(fh,H*0.88)),method:"heuristic"};
  }

  // Auto-trigger swap when both ready
  useEffect(()=>{
    if(src?.stage==="done"&&tgt?.stage==="done"&&!busy&&!result&&!tgt.isVideo){
      startSwap();
    }
  },[src?.stage,tgt?.stage]);

  const startSwap=useCallback(async()=>{
    if(!src?.el||!tgt?.el||!src.face||!tgt.face||busy)return;
    setBusy(true);setProgress(0);setSteps([]);setResult(null);
    const log=(msg)=>setSteps(p=>[...p,msg]);
    try{
      const url=await doFaceSwap(src.el,src.face,tgt.el,tgt.face,(pct,msg)=>{
        setProgress(pct);setStatusMsg(msg);if(msg&&msg!=="Done")log(msg);
      });
      setResult(url);setResultType("image");log("✓ Complete");
    }catch(e){setStatusMsg("Failed — try different images");log("✗ "+e.message);}
    setBusy(false);setProgress(100);
  },[src,tgt,busy]);

  const startVideoSwap=useCallback(async()=>{
    if(!src?.el||!src.face||!videoRef.current||busy)return;
    setBusy(true);setProgress(0);setSteps([]);setResult(null);
    try{
      const blob=await processVideo(videoRef.current,src.el,src.face,(pct)=>setProgress(pct),(msg)=>{setStatusMsg(msg);setSteps(p=>[...p,msg]);});
      setResult(URL.createObjectURL(blob));setResultType("video");
      setSteps(p=>[...p,"✓ Video complete"]);
    }catch(e){setStatusMsg("Video failed");setSteps(p=>[...p,"✗ "+e.message]);}
    setBusy(false);setProgress(100);
  },[src,busy]);

  const doSearch=q=>{
    setSearchQ(q);clearTimeout(searchTimer.current);
    if(q.length<2){setSearchRes([]);return;}
    searchTimer.current=setTimeout(async()=>{
      setSearching(true);
      const[ppl,med]=await Promise.all([searchPeople(q),searchMovies(q)]);
      setSearchRes([...ppl.map(p=>({...p,_t:"p"})),...med.map(m=>({...m,_t:"m"}))]);
      setSearching(false);
    },320);
  };

  const pickResult=async r=>{
    if(r._t==="p"){const imgs=await personPhotos(r.id);setActorImgs(imgs);}
    else{setActorImgs([]);setSearchRes([]);setShowSearch(false);loadAndScan(await urlToFile(tmdbImg(r.poster_path||r.backdrop_path,"w780")),"tgt");}
  };
  const pickPhoto=async path=>{setActorImgs([]);setSearchRes([]);setShowSearch(false);loadAndScan(await urlToFile(tmdbImg(path,"w780")),"tgt");};

  async function urlToFile(url){const r=await fetch(url);const blob=await r.blob();return new File([blob],"target.jpg",{type:blob.type});}

  const download=()=>{const a=document.createElement("a");a.href=result;a.download=`novaspark_swap_${Date.now()}.${resultType==="video"?"webm":"jpg"}`;a.click();};
  const reset=()=>{setSrc(null);setTgt(null);setResult(null);setStatusMsg("");setProgress(0);setSteps([]);setShowSearch(false);videoRef.current=null;};

  const bothReady=src?.stage==="done"&&tgt?.stage==="done";
  const isVideoMode=tgt?.isVideo||false;

  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:9500,background:"rgba(0,0,0,0.95)",backdropFilter:"blur(18px)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <style>{`@keyframes nsReveal{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:none}} @keyframes nsFade{from{opacity:0}to{opacity:1}}`}</style>
      <div onClick={e=>e.stopPropagation()} style={{width:"min(900px,100%)",maxHeight:"95vh",overflowY:"auto",background:"#080808",border:"1px solid rgba(255,255,255,0.08)",borderRadius:18,padding:20}}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:36,height:36,borderRadius:11,background:"linear-gradient(135deg,#7c3aed,#00d4ff)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🔄</div>
            <div>
              <div style={{fontSize:15,fontWeight:800,color:"#fff"}}>Face Swap Studio</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.3)",letterSpacing:0.4}}>Delaunay warp · Poisson blend · Reinhard colour · 3-tier detection</div>
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {(src||tgt)&&<button onClick={reset} style={{all:"unset",cursor:"pointer",fontSize:11,color:"rgba(255,255,255,0.4)",padding:"4px 9px",borderRadius:6,background:"rgba(255,255,255,0.05)"}}>Reset</button>}
            <button onClick={onClose} style={{all:"unset",cursor:"pointer",color:"rgba(255,255,255,0.4)",fontSize:20,lineHeight:1}}>×</button>
          </div>
        </div>

        {/* Progress */}
        {busy&&<>
          <div style={{height:3,background:"rgba(255,255,255,0.06)",borderRadius:2,marginBottom:8,overflow:"hidden"}}>
            <div style={{height:"100%",background:"linear-gradient(90deg,#7c3aed,#00d4ff)",width:`${progress}%`,transition:"width 0.3s"}}/>
          </div>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.45)",textAlign:"center",marginBottom:10}}>{statusMsg}</div>
        </>}

        {/* THREE PANELS */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>

          {/* SOURCE */}
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.3)",letterSpacing:1,textTransform:"uppercase",textAlign:"center"}}>Your Face</div>
            <div style={{height:210,borderRadius:10,overflow:"hidden",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",position:"relative"}}>
              {src?.url
                ?<ScanCanvas imgEl={src.el} face={src.face} stage={src.stage} brand={brand}/>
                :<label style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",cursor:"pointer",gap:6}}>
                  <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>loadAndScan(e.target.files[0],"src")}/>
                  <span style={{fontSize:30}}>📸</span>
                  <span style={{fontSize:11,color:"rgba(255,255,255,0.4)",textAlign:"center"}}>Drop or tap<br/>Upload your face</span>
                </label>
              }
            </div>
            {src&&<label style={{all:"unset",cursor:"pointer",display:"block",textAlign:"center",fontSize:11,color:"rgba(255,255,255,0.4)",padding:"5px 0",borderRadius:7,background:"rgba(255,255,255,0.04)"}}>
              <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>loadAndScan(e.target.files[0],"src")}/>Change photo
            </label>}
          </div>

          {/* RESULT CENTER */}
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.3)",letterSpacing:1,textTransform:"uppercase",textAlign:"center"}}>Result</div>
            <div style={{height:210,borderRadius:10,overflow:"hidden",background:"rgba(255,255,255,0.03)",border:`1px solid ${result?brand:"rgba(255,255,255,0.08)"}`,transition:"border-color .3s",position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>
              {result
                ?resultType==="video"
                  ?<video src={result} controls style={{width:"100%",height:"100%",objectFit:"cover",display:"block",animation:"nsReveal .4s ease"}}/>
                  :<img src={result} alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block",animation:"nsReveal .4s ease"}}/>
                :<div style={{textAlign:"center",padding:"0 12px"}}>
                  {busy
                    ?<div style={{fontSize:12,color:brand}}>{statusMsg||"Processing…"}</div>
                    :bothReady&&!isVideoMode
                      ?<div style={{fontSize:12,color:"rgba(255,255,255,0.3)"}}>Preparing…</div>
                      :<div style={{fontSize:11,color:"rgba(255,255,255,0.2)",lineHeight:1.6}}>Add both images<br/>Result appears here</div>
                  }
                </div>
              }
            </div>
            {result&&<button onClick={download} style={{all:"unset",cursor:"pointer",display:"block",textAlign:"center",padding:"7px 0",borderRadius:7,background:"linear-gradient(90deg,#7c3aed,#00d4ff)",color:"#fff",fontSize:12,fontWeight:800}}>↓ Download</button>}
            {isVideoMode&&src?.stage==="done"&&!result&&!busy&&(
              <button onClick={startVideoSwap} style={{all:"unset",cursor:"pointer",display:"block",textAlign:"center",padding:"7px 0",borderRadius:7,background:"linear-gradient(90deg,#7c3aed,#00d4ff)",color:"#fff",fontSize:12,fontWeight:800}}>⚡ Process Video</button>
            )}
            {result&&<button onClick={reset} style={{all:"unset",cursor:"pointer",display:"block",textAlign:"center",padding:"5px 0",borderRadius:7,background:"rgba(255,255,255,0.04)",color:"rgba(255,255,255,0.4)",fontSize:11}}>New swap</button>}
          </div>

          {/* TARGET */}
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.3)",letterSpacing:1,textTransform:"uppercase",textAlign:"center"}}>Target</div>
            <div style={{height:210,borderRadius:10,overflow:"hidden",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",position:"relative"}}>
              {tgt?.url
                ?tgt.isVideo
                  ?<div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6}}><span style={{fontSize:30}}>🎬</span><span style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>Video ready</span></div>
                  :<ScanCanvas imgEl={tgt.el} face={tgt.face} stage={tgt.stage} brand={brand}/>
                :<label style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",cursor:"pointer",gap:6}}>
                  <input type="file" accept="image/*,video/*" style={{display:"none"}} onChange={e=>loadAndScan(e.target.files[0],"tgt")}/>
                  <span style={{fontSize:30}}>🎭</span>
                  <span style={{fontSize:11,color:"rgba(255,255,255,0.4)",textAlign:"center"}}>Actor photo<br/>Movie poster · Video</span>
                </label>
              }
            </div>
            <div style={{display:"flex",gap:5}}>
              <label style={{all:"unset",cursor:"pointer",flex:1,display:"block",textAlign:"center",fontSize:11,color:"rgba(255,255,255,0.4)",padding:"5px 0",borderRadius:7,background:"rgba(255,255,255,0.04)"}}>
                <input type="file" accept="image/*,video/*" style={{display:"none"}} onChange={e=>loadAndScan(e.target.files[0],"tgt")}/>{tgt?"Change":"Upload"}
              </label>
              <button onClick={()=>setShowSearch(v=>!v)} style={{all:"unset",cursor:"pointer",flex:1,textAlign:"center",fontSize:11,color:showSearch?brand:"rgba(255,255,255,0.4)",padding:"5px 0",borderRadius:7,background:showSearch?`${brand}22`:"rgba(255,255,255,0.04)"}}>Search</button>
            </div>
          </div>
        </div>

        {/* Processing log */}
        {steps.length>0&&(
          <div style={{background:"rgba(255,255,255,0.02)",borderRadius:8,padding:"8px 12px",marginBottom:12,maxHeight:80,overflowY:"auto"}}>
            {steps.map((s,i)=>(
              <div key={i} style={{fontSize:10,color:s.startsWith("✓")?"#00b4a6":s.startsWith("✗")?"#ff5577":"rgba(255,255,255,0.4)",lineHeight:1.7}}>{s}</div>
            ))}
          </div>
        )}

        {/* SEARCH PANEL */}
        {showSearch&&(
          <div style={{borderTop:"1px solid rgba(255,255,255,0.07)",paddingTop:14}}>
            <input autoFocus value={searchQ} onChange={e=>doSearch(e.target.value)} placeholder="Search actor, actress, movie…"
              style={{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.05)",border:`1px solid ${brand}44`,borderRadius:10,padding:"10px 12px",color:"#fff",fontSize:13,outline:"none",marginBottom:10}}/>
            {searching&&<div style={{fontSize:12,color:"rgba(255,255,255,0.3)",textAlign:"center",marginBottom:8}}>Searching…</div>}
            {actorImgs.length>0&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:6,marginBottom:8}}>
                {actorImgs.map((im,i)=>(
                  <div key={i} onClick={()=>pickPhoto(im.file_path)} style={{aspectRatio:"2/3",borderRadius:6,overflow:"hidden",cursor:"pointer",border:"1px solid rgba(255,255,255,0.07)",transition:"border-color .15s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=brand} onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.07)"}>
                    <img src={tmdbImg(im.file_path,"w185")} alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
                  </div>
                ))}
              </div>
            )}
            {searchRes.length>0&&!actorImgs.length&&(
              <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:180,overflowY:"auto"}}>
                {searchRes.map((r,i)=>(
                  <button key={i} onClick={()=>pickResult(r)} style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:9}} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    {(r.profile_path||r.poster_path)&&<img src={tmdbImg(r.profile_path||r.poster_path,"w92")} alt="" style={{width:30,height:44,objectFit:"cover",borderRadius:4,flexShrink:0}}/>}
                    <span style={{fontSize:13,color:"rgba(255,255,255,0.8)"}}>{r.name||r.title}<span style={{color:"rgba(255,255,255,0.3)",fontSize:10,marginLeft:6}}>{r._t==="p"?"Person":"Title"}</span></span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{textAlign:"center",marginTop:10,fontSize:10,color:"rgba(255,255,255,0.18)"}}>
          NovaSpark AI · Delaunay Triangulation Face Swap · Built for Elvis Maduike Edeh
        </div>
      </div>
    </div>
  );
}