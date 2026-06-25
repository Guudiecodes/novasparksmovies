import { useState, useEffect, useRef, useCallback } from "react";
import { imgUrl } from "../utils/api";
import { getEffectivePlan as getCurrentPlan } from "../utils/premium";
import DonateModal from "../components/DonateModal";

// ── Thin-stroke modern icon set ─────────────────────────────────────────────
// Consistent: 1.75px stroke, 20px, rounded caps/joins
const S = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" };
function Ico({ d, children }) { return <svg {...S}>{children || <path d={d}/>}</svg>; }

const IcoSearch  = () => <Ico><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" strokeLinejoin="miter"/></Ico>;
const IcoHome    = () => <Ico><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></Ico>;
const IcoLibrary = () => <Ico><rect x="3" y="3" width="7" height="8" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="11" width="7" height="9" rx="1"/><rect x="3" y="14" width="7" height="6" rx="1"/></Ico>;
const IcoDl      = () => <Ico><path d="M12 3v11m0 0l-4-4m4 4l4-4M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2"/></Ico>;
const IcoBack    = () => <Ico><path d="M19 12H5m0 0l7 7m-7-7l7-7"/></Ico>;
const IcoSettings= () => <Ico><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></Ico>;
const IcoHelp    = () => <Ico><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></Ico>;
const IcoHeart   = () => <Ico><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></Ico>;
const IcoAppDl   = () => <Ico><rect x="2" y="3" width="20" height="13" rx="2"/><path d="M8 21h8m-4-5v5"/><path d="M12 7v5m0 0l-2-2m2 2l2-2"/></Ico>;
const IcoPower   = () => <Ico><path d="M18.36 6.64a9 9 0 11-12.73 0M12 2v8"/></Ico>;
const IcoFilm    = () => <Ico><rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></Ico>;
const IcoChevron = ({ open }) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)", transform: open ? "rotate(180deg)" : "rotate(0)" }}><polyline points="6 9 12 15 18 9"/></svg>;
const IcoGlobe   = () => <Ico><circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="3.5"/><line x1="2.5" y1="12" x2="5.5" y2="12"/><line x1="18.5" y1="12" x2="21.5" y2="12"/><line x1="12" y1="2.5" x2="12" y2="5.5"/><line x1="12" y1="18.5" x2="12" y2="21.5"/><line x1="5.2" y1="5.2" x2="7.3" y2="7.3"/><line x1="16.7" y1="16.7" x2="18.8" y2="18.8"/><line x1="18.8" y1="5.2" x2="16.7" y2="7.3"/><line x1="7.3" y1="16.7" x2="5.2" y2="18.8"/></Ico>;

// NS-AI gradient icon
const IcoAI = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id="aig2" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
        <stop stopColor="#00d4ff"/><stop offset="1" stopColor="#7c3aed"/>
      </linearGradient>
    </defs>
    <circle cx="12" cy="12" r="9.5" stroke="url(#aig2)" strokeWidth="1.5" opacity="0.55"/>
    <circle cx="12" cy="12" r="3" fill="url(#aig2)" opacity="0.9"/>
    <line x1="12" y1="2.5" x2="12" y2="5.5"   stroke="url(#aig2)" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="12" y1="18.5" x2="12" y2="21.5" stroke="url(#aig2)" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="2.5" y1="12" x2="5.5" y2="12"   stroke="url(#aig2)" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="18.5" y1="12" x2="21.5" y2="12" stroke="url(#aig2)" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

// ── Constants ────────────────────────────────────────────────────────────────
const SB_W = { collapsed: 54, expanded: 220 };

function getPlanTier(id) {
  if (id === "premium") return "diamond";
  if (id === "standard") return "gold";
  if (id === "basic" || id === "mobile") return "silver";
  return "free";
}
const TIER = {
  free:    { label:"Free",    g0:"#00b4a6", g1:"#007a72", ring:"#00b4a6", glow:"transparent",             badge:null },
  silver:  { label:"Silver",  g0:"#d0d8e0", g1:"#8a9aaa", ring:"#c0c8d0", glow:"rgba(192,200,208,0.55)",  badge:{ sym:"✦", col:"#c8d0d8" } },
  gold:    { label:"Gold",    g0:"#f5a623", g1:"#c87800", ring:"#f5a623", glow:"rgba(245,166,35,0.65)",   badge:{ sym:"★", col:"#f5a623" } },
  diamond: { label:"Diamond", g0:"#00d4ff", g1:"#7c3aed", ring:"#00d4ff", glow:"rgba(0,212,255,0.75)",   badge:{ sym:"◆", col:"#00d4ff" } },
};

// ── Download popup ────────────────────────────────────────────────────────────
function DownloadPopup({ onClose, expanded }) {
  const [rel,setRel]=useState(null),[loading,setLd]=useState(true),[dl,setDl]=useState(false);
  const DIRECT = { url:"https://github.com/Guudiecodes/novasparks-gen/releases/download/v2.4.0/NovaSpark.Setup.2.4.0.exe", version:"v2.4.0", name:"NovaSpark Setup 2.4.0.exe", size:"84.5 MB" };
  useEffect(()=>{setRel(DIRECT);setLd(false);},[]);
  const download=()=>{if(!rel?.url)return;setDl(true);const a=document.createElement("a");a.href=rel.url;a.download=rel.name;document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(()=>setDl(false),3000);};
  const left = expanded ? SB_W.expanded + 12 : SB_W.collapsed + 12;
  return (
    <div style={{position:"fixed",left:left,bottom:100,zIndex:99998,width:272,background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:12,overflow:"hidden"}}>
      <style>{`@keyframes dlIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}`}</style>
      <div style={{animation:"dlIn 0.2s ease",padding:"12px 14px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <span style={{fontSize:13,fontWeight:700,color:"var(--text)"}}>Desktop App</span>
          <button onClick={onClose} style={{all:"unset",cursor:"pointer",color:"var(--text3)",fontSize:16,lineHeight:1}}>×</button>
        </div>
        {loading?<div style={{color:"var(--text3)",fontSize:12}}>Loading…</div>:rel?(
          <>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
              <div><div style={{fontSize:11,color:"var(--text3)"}}>Version</div><div style={{fontSize:14,fontWeight:700,color:"var(--amber)"}}>{rel.version}</div></div>
              <div style={{padding:"3px 9px",borderRadius:5,background:"var(--surface3)",fontSize:11,color:"var(--text3)",fontWeight:600,alignSelf:"center"}}>{rel.size}</div>
            </div>
            <button onClick={download} disabled={dl} style={{all:"unset",display:"flex",alignItems:"center",justifyContent:"center",gap:7,width:"100%",padding:"10px 0",borderRadius:8,background:dl?"var(--surface3)":"var(--red)",color:dl?"var(--text3)":"#fff",fontSize:13,fontWeight:700,cursor:dl?"default":"pointer",transition:"background 0.15s",fontFamily:"var(--font-body)"}}>
              {dl?"Downloading…":"Download Now"}
            </button>
            <div style={{marginTop:8,fontSize:10,color:"var(--text3)",textAlign:"center"}}>Windows 10+ · macOS 11+ · Free</div>
          </>
        ):null}
      </div>
    </div>
  );
}

// ── NS Logo ───────────────────────────────────────────────────────────────────
function NSLogo({ tier }) {
  const t=TIER[tier]||TIER.free, gid=`nsg${tier}`, fid=`nsf${tier}`;
  return (
    <svg viewBox="0 0 44 44" fill="none" style={{width:"100%",height:"100%",display:"block"}}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor={t.g0}/><stop offset="1" stopColor={t.g1}/>
        </linearGradient>
        <filter id={fid}><feGaussianBlur stdDeviation={tier==="diamond"?"2":"1.5"} result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <circle cx="22" cy="22" r="20" fill={`url(#${gid})`} opacity={tier==="free"?0.08:0.14}/>
      <circle cx="22" cy="22" r="20" stroke={`url(#${gid})`} strokeWidth={tier==="free"?"1.5":"2"} fill="none"/>
      <text x="22" y="28" textAnchor="middle" fontFamily="'Bebas Neue','Outfit',sans-serif" fontSize="18" fontWeight="700" fill={`url(#${gid})`} filter={`url(#${fid})`} letterSpacing="1">NS</text>
    </svg>
  );
}
function TierDot({ tier }) {
  if (tier==="free") return null;
  const t=TIER[tier];
  return <div style={{position:"absolute",bottom:0,right:0,width:13,height:13,borderRadius:"50%",background:"var(--bg,#050c0f)",border:`1.5px solid ${t.badge.col}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,color:t.badge.col,fontWeight:900,pointerEvents:"none"}}>{t.badge.sym}</div>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
function useIsMobile() {
  const [m,setM]=useState(()=>window.innerWidth<=768);
  useEffect(()=>{const mq=window.matchMedia("(max-width:768px)");const h=e=>setM(e.matches);mq.addEventListener("change",h);return()=>mq.removeEventListener("change",h);},[]);
  return m;
}

// ── Sidebar button ────────────────────────────────────────────────────────────
function SBtn({ active, icon, label, badge, onClick, expanded, accent }) {
  const [hov,setHov]=useState(false);
  const col = active ? "var(--red)" : accent || (hov ? "var(--text)" : "var(--text3)");
  const bg  = active ? "rgba(0,180,166,0.1)" : hov ? "rgba(255,255,255,0.05)" : "transparent";
  return (
    <button
      onClick={onClick}
      onMouseEnter={()=>setHov(true)}
      onMouseLeave={()=>setHov(false)}
      title={!expanded ? label : undefined}
      style={{ all:"unset", display:"flex", alignItems:"center", gap:11, width:`calc(100% - 12px)`, margin:"1px 6px", padding:"0 10px", height:40, borderRadius:8, cursor:"pointer", color:col, background:bg, transition:"background 0.15s, color 0.15s", flexShrink:0, position:"relative", overflow:"visible" }}
    >
      <span style={{ flexShrink:0, width:20, height:20, display:"flex", alignItems:"center", justifyContent:"center" }}>{icon}</span>
      <span style={{ fontSize:13, fontWeight:500, letterSpacing:0.1, whiteSpace:"nowrap", overflow:"hidden", maxWidth: expanded ? 150 : 0, opacity: expanded ? 1 : 0, transition:"max-width 0.25s cubic-bezier(0.4,0,0.2,1), opacity 0.2s 0.05s", flex:1 }}>{label}</span>
      {badge != null && <span style={{ marginLeft:"auto", flexShrink:0, minWidth:17, height:17, borderRadius:9, background:"var(--red)", color:"#fff", fontSize:9, fontWeight:800, lineHeight:"17px", textAlign:"center", padding:"0 4px" }}>{badge}</span>}
    </button>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────
function SLabel({ label, expanded }) {
  return (
    <div style={{ height: expanded ? 28 : 0, overflow:"hidden", transition:"height 0.25s cubic-bezier(0.4,0,0.2,1)" }}>
      <div style={{ padding:"10px 16px 2px", fontSize:9, fontWeight:700, letterSpacing:2, textTransform:"uppercase", color:"var(--text3)", whiteSpace:"nowrap", opacity: expanded ? 0.55 : 0, transition:"opacity 0.2s" }}>
        {label}
      </div>
    </div>
  );
}

// ── Accordion More menu ───────────────────────────────────────────────────────
function AccordionMore({ page, onNavigate, onShowShortcuts, setShowDonate, setShowDownload, isWeb, expanded }) {
  const [open,setOpen]=useState(false);
  const [hov,setHov]=useState(false);
  const col = (open||hov) ? "var(--text)" : "var(--text3)";

  const items = [
    { label:"Settings",    icon:<IcoSettings/>,  active:page==="settings", action:()=>{onNavigate("settings");}     },
    { label:"Help",        icon:<IcoHelp/>,       action:()=>{onShowShortcuts();}                                    },
    { label:"Support",     icon:<IcoHeart/>,      accent:"#e8547a", action:()=>{setShowDonate(true);}                },
    ...(isWeb ? [{ label:"Desktop App", icon:<IcoAppDl/>, accent:"var(--amber,#f5a623)", action:()=>{setShowDownload(v=>!v);} }] : []),
    ...(window.electron?.quitApp ? [{ label:"Quit",icon:<IcoPower/>, accent:"#e53e3e", action:()=>window.electron.quitApp() }] : []),
  ];

  return (
    <div style={{ flexShrink:0 }}>
      {/* Toggle */}
      <button
        onClick={()=>setOpen(v=>!v)}
        onMouseEnter={()=>setHov(true)}
        onMouseLeave={()=>setHov(false)}
        style={{ all:"unset", display:"flex", alignItems:"center", gap:11, width:`calc(100% - 12px)`, margin:"1px 6px", padding:"0 10px", height:40, borderRadius:8, cursor:"pointer", color: open ? "var(--red)" : col, background: open ? "rgba(0,180,166,0.08)" : hov ? "rgba(255,255,255,0.05)" : "transparent", transition:"background 0.15s, color 0.15s" }}
      >
        <span style={{ flexShrink:0, width:20, height:20, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5"  cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
          </svg>
        </span>
        {expanded && (
          <>
            <span style={{ fontSize:13, fontWeight:500, flex:1, letterSpacing:0.1 }}>More</span>
            <IcoChevron open={open}/>
          </>
        )}
      </button>

      {/* Accordion panel */}
      <div style={{ overflow:"hidden", maxHeight: open ? `${items.length * 42}px` : "0", transition:"max-height 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.25s", opacity: open ? 1 : 0 }}>
        {open && items.length > 0 && (
          <div style={{ height:1, margin:"2px 16px 4px", background:"linear-gradient(90deg,rgba(0,180,166,0.3),transparent)", borderRadius:1 }}/>
        )}
        {items.map(it => (
          <SBtn
            key={it.label}
            icon={<span style={{ color: it.accent || (it.active ? "var(--red)" : undefined) }}>{it.icon}</span>}
            label={it.label}
            active={it.active}
            expanded={expanded}
            accent={it.accent}
            onClick={()=>{ it.action(); setOpen(false); }}
          />
        ))}
        {open && items.length > 0 && (
          <div style={{ height:1, margin:"4px 16px 2px", background:"linear-gradient(90deg,transparent,rgba(0,180,166,0.15))", borderRadius:1 }}/>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SIDEBAR COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function Sidebar({
  page, onNavigate, onSearch, savedList, activeDownloads,
  onReorderSaved, onRemoveSaved, canGoBack, onBack,
  onShowShortcuts, isPremium, onUpgrade,
}) {
  const [expanded,   setExpanded]   = useState(false);
  const [showDonate, setShowDonate] = useState(false);
  const [showDl,     setShowDl]     = useState(false);
  const [ctxMenu,    setCtxMenu]    = useState(null);
  const [planId,     setPlanId]     = useState(()=>getCurrentPlan());
  const [tooltip,    setTooltip]    = useState(null);

  const dragItem = useRef(null);
  const dragNode = useRef(null);
  const isMobile = useIsMobile();

  useEffect(()=>{ const h=()=>setPlanId(getCurrentPlan()); window.addEventListener("ns:plan-changed",h); return()=>window.removeEventListener("ns:plan-changed",h); },[]);
  useEffect(()=>{ setPlanId(getCurrentPlan()); },[isPremium]);

  const tier = getPlanTier(planId);
  const tc   = TIER[tier];
  const isWeb = !window.electron;

  const expand = useCallback(()=>{
    setExpanded(true);
    document.documentElement.style.setProperty("--sidebar", `${SB_W.expanded}px`);
  },[]);
  const collapse = useCallback(()=>{
    setExpanded(false);
    document.documentElement.style.setProperty("--sidebar", `${SB_W.collapsed}px`);
  },[]);

  useEffect(()=>{
    const close=()=>setCtxMenu(null);
    window.addEventListener("click",close);
    window.addEventListener("contextmenu",close);
    return()=>{ window.removeEventListener("click",close); window.removeEventListener("contextmenu",close); };
  },[]);

  // Drag handlers
  const dStart=(e,i)=>{ dragItem.current=i; dragNode.current=e.currentTarget; setTimeout(()=>{ if(dragNode.current) dragNode.current.style.opacity="0.4"; },0); e.dataTransfer.effectAllowed="move"; };
  const dEnd=()=>{ if(dragNode.current) dragNode.current.style.opacity="1"; dragItem.current=null; dragNode.current=null; };
  const dEnter=(e,i)=>{ if(dragItem.current===i)return; };
  const dDrop=(e,di)=>{ e.preventDefault(); const from=dragItem.current; if(from==null||from===di)return; const next=[...savedList]; const [mv]=next.splice(from,1); next.splice(di,0,mv); onReorderSaved(next.map(i=>`${i.media_type}_${i.id}`)); };
  const dOver=(e)=>{ e.preventDefault(); e.dataTransfer.dropEffect="move"; };
  const ctxOpen=(e,item)=>{ e.preventDefault(); e.stopPropagation(); setTooltip(null); setCtxMenu({ item, x:e.clientX, y:e.clientY }); };

  const logoLabel = tier==="free" ? "Free · Upgrade" : `${tc.label} Plan`;
  const ICO = 22;

  // ── MOBILE ─────────────────────────────────────────────────────────────────
  if (isMobile) {
    const mobileItems = [
      { id:"search",    label:"Search",    onTap:onSearch,
        icon:(a)=><svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none" stroke={a?"var(--red)":"var(--text3)"} strokeWidth="1.75" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" strokeLinejoin="miter"/></svg> },
      { id:"home",      label:"Home",
        icon:(a)=><svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none" stroke={a?"var(--red)":"var(--text3)"} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
      { id:"reel",      label:"Shorts",
        icon:(a)=><svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none" stroke={a?"#f5a623":"var(--text3)"} strokeWidth="1.75" strokeLinecap="round"><circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="3.5"/><line x1="2.5" y1="12" x2="5.5" y2="12"/><line x1="18.5" y1="12" x2="21.5" y2="12"/><line x1="12" y1="2.5" x2="12" y2="5.5"/><line x1="12" y1="18.5" x2="12" y2="21.5"/></svg>,
        extra:(a)=>!a&&<span style={{position:"absolute",top:5,right:2,background:"linear-gradient(135deg,#f5a623,#e74c3c)",borderRadius:3,padding:"1px 3px",fontSize:6,fontWeight:900,color:"#fff",lineHeight:1.5}}>NEW</span> },
      { id:"nsai",      label:"NS AI",    onTap:()=>onNavigate("nsai"), icon:(a)=><IcoAI/>,
        extra:()=><span style={{position:"absolute",top:5,right:2,width:5,height:5,borderRadius:"50%",background:"linear-gradient(135deg,#00d4ff,#7c3aed)",boxShadow:"0 0 5px rgba(0,212,255,0.7)",animation:"ns-ai-pulse 2s ease-in-out infinite",pointerEvents:"none"}}/> },
      { id:"history",   label:"Library",
        icon:(a)=><svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none" stroke={a?"var(--red)":"var(--text3)"} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="8" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="11" width="7" height="9" rx="1"/><rect x="3" y="14" width="7" height="6" rx="1"/></svg> },
      { id:"downloads", label:"Downloads", badge:activeDownloads>0?activeDownloads:null,
        icon:(a)=><svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none" stroke={a?"var(--red)":"var(--text3)"} strokeWidth="1.75" strokeLinecap="round"><path d="M12 3v11m0 0l-4-4m4 4l4-4M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2"/></svg> },
      { id:"settings",  label:"Settings",
        icon:(a)=><svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none" stroke={a?"var(--red)":"var(--text3)"} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg> },
      { id:"donate",    label:"Support",  onTap:()=>setShowDonate(true),
        icon:()=><svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg> },
      ...(isWeb?[{ id:"get-app",label:"App",onTap:()=>setShowDl(v=>!v), icon:()=><svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="13" rx="2"/><path d="M8 21h8m-4-5v5"/></svg> }]:[]),
    ];
    return (
      <>
      {/* Mobile top bar */}
      <div style={{position:"fixed",top:0,left:0,right:0,height:52,background:"rgba(4,8,13,0.98)",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",zIndex:100}}>
        <div onClick={()=>onNavigate("pricing")} title={logoLabel} style={{position:"relative",width:32,height:32,cursor:"pointer"}}>
        <NSLogo tier={tier}/><TierDot tier={tier}/>
        </div>
        <span style={{fontFamily:"var(--font-display)",fontSize:18,letterSpacing:3,color:"var(--text)"}}>NOVASPARK</span>
        <div onClick={()=>onNavigate("pricing")} style={{display:"flex",alignItems:"center",gap:5,padding:"3px 9px",borderRadius:20,border:`1px solid ${tier==="free"?"var(--border)":tc.ring}`,background:tier==="free"?"rgba(255,255,255,0.03)":`rgba(0,180,166,0.07)`,cursor:"pointer"}}>
        <span style={{width:6,height:6,borderRadius:"50%",background:tier==="free"?"var(--red)":tier==="silver"?"#c0c8d0":tier==="gold"?"#f5a623":"linear-gradient(135deg,#00d4ff,#7c3aed)"}}/>
        <span style={{fontSize:9,fontWeight:700,letterSpacing:0.5,color:tier==="free"?"var(--text3)":tc.g0,textTransform:"uppercase"}}>{tc.label}</span>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(4,8,13,0.98)",borderTop:"1px solid var(--border)",paddingBottom:"env(safe-area-inset-bottom,0)",zIndex:100}}>
        <style>{`@keyframes ns-ai-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.5;transform:scale(0.7);}}`}</style>
        <div style={{display:"flex",alignItems:"stretch",overflowX:"auto",scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
        <div style={{width:6,flexShrink:0}}/>
        {mobileItems.map(({id,icon,label,badge,onTap,extra})=>{
          const isAction=["search","donate","get-app"].includes(id);
          const active=!isAction&&page===id;
          const isReel=id==="reel",isAI=id==="nsai";
          const ac=isReel?"#f5a623":isAI?"#00d4ff":"var(--red)";
          return (
          <button
            key={id}
            onClick={onTap ?? (() => onNavigate(id))}
            style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,height:54,minWidth:56,background:"none",border:"none",cursor:"pointer",padding:"0 6px",position:"relative",fontFamily:"var(--font-body)",borderTop:active?`2px solid ${ac}`:"2px solid transparent",transition:"border-color 0.2s"}}
          >
            <span style={{display:"flex",alignItems:"center",justifyContent:"center",transform:active?"scale(1.12)":"scale(1)",transition:"transform 0.15s"}}>{icon(active)}</span>
            <span style={{fontSize:8.5,fontWeight:600,color:active?ac:"var(--text3)",letterSpacing:0.2,lineHeight:1,textTransform:"capitalize",whiteSpace:"nowrap"}}>{label}</span>
            {badge&&<span style={{position:"absolute",top:7,right:3,minWidth:15,height:15,borderRadius:8,background:"var(--red)",color:"#050c0f",fontSize:8,fontWeight:800,lineHeight:"15px",textAlign:"center",padding:"0 3px"}}>{badge}</span>}
            {extra?.(active)}
          </button>
          );
        })}
        <div style={{width:6,flexShrink:0}}/>
        </div>
      </nav>

      {showDl&&isWeb&&<div data-dl-popup style={{position:"fixed",bottom:64,left:8,zIndex:99999}}><DownloadPopup onClose={()=>setShowDl(false)} expanded={false}/></div>}
      {showDonate&&<DonateModal onClose={()=>setShowDonate(false)}/>}
      </>
    );
  }

  // ── DESKTOP SIDEBAR ─────────────────────────────────────────────────────────
  return (
    <>
      <div
        className="sidebar"
        onMouseEnter={expand}
        onMouseLeave={collapse}
        style={{
          width: expanded ? SB_W.expanded : SB_W.collapsed,
          transition: "width 0.25s cubic-bezier(0.4,0,0.2,1)",
          overflow: "hidden",
          boxShadow: "none",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <style>{`
          @keyframes ns-ai-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.5;transform:scale(0.7);}}
          .main{transition:margin-left 0.25s cubic-bezier(0.4,0,0.2,1)!important;}
          .sidebar::-webkit-scrollbar{display:none;}
          .ns-sb-scroll::-webkit-scrollbar{width:3px;}
          .ns-sb-scroll::-webkit-scrollbar-track{background:transparent;}
          .ns-sb-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.07);border-radius:2px;}
          .ns-sb-scroll::-webkit-scrollbar-thumb:hover{background:rgba(0,180,166,0.25);}
        `}</style>

        {/* ── Logo header ── */}
        <div onClick={()=>onNavigate("pricing")} title={logoLabel} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 7px", margin:"6px 6px 4px", cursor:"pointer", borderRadius:10, flexShrink:0, transition:"background 0.15s", overflow:"hidden" }} onMouseEnter={e=>e.currentTarget.style.background="rgba(0,180,166,0.06)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          <div style={{ position:"relative", width:34, height:34, flexShrink:0 }}>
            <NSLogo tier={tier}/><TierDot tier={tier}/>
          </div>
          <span style={{ fontFamily:"var(--font-display)", fontSize:16, letterSpacing:2.5, color:"var(--red)", whiteSpace:"nowrap", overflow:"hidden", maxWidth: expanded ? 140 : 0, opacity: expanded ? 1 : 0, transition:"max-width 0.25s cubic-bezier(0.4,0,0.2,1), opacity 0.2s 0.06s" }}>NOVASPARK</span>
        </div>

        {/* ── Nav section ── */}
        <SLabel label="Navigate" expanded={expanded}/>
        <SBtn expanded={expanded} onClick={onSearch}                                      icon={<IcoSearch/>}  label="Search  ⌘F"/>
        <SBtn expanded={expanded} active={page==="home"}    onClick={()=>onNavigate("home")}    icon={<IcoHome/>}    label="Home"/>

        {/* Reels / Shorts */}
        <SBtn expanded={expanded} active={page==="reel"}    onClick={()=>onNavigate("reel")}    icon={<span style={{color:page==="reel"?"#f5a623":undefined}}><IcoGlobe/></span>}   label="NS Shorts"
          badge={<span style={{fontSize:7,fontWeight:800,background:"linear-gradient(135deg,#f5a623,#e74c3c)",borderRadius:3,padding:"1px 5px",color:"#fff",letterSpacing:0.3,lineHeight:1.5}}>NEW</span>}
        />

        {/* NS AI */}
        <SBtn expanded={expanded} onClick={()=>onNavigate("nsai")} icon={<IcoAI/>} label="NS AI"
          badge={<span style={{width:6,height:6,borderRadius:"50%",background:"linear-gradient(135deg,#00d4ff,#7c3aed)",boxShadow:"0 0 5px rgba(0,212,255,0.7)",animation:"ns-ai-pulse 2s ease-in-out infinite",display:"inline-block"}}/>}
        />

        {/* ── Library section ── */}
        <SLabel label="Library" expanded={expanded}/>
        <SBtn expanded={expanded} active={page==="history"}   onClick={()=>onNavigate("history")}   icon={<IcoLibrary/>} label="Library & History"/>
        <SBtn expanded={expanded} active={page==="downloads"} onClick={()=>onNavigate("downloads")} icon={<IcoDl/>}      label="Downloads" badge={activeDownloads>0?activeDownloads:undefined}/>
        {canGoBack && <SBtn expanded={expanded} onClick={onBack} icon={<IcoBack/>} label="Back  Ctrl+Z"/>}

        {/* ── More accordion ── */}
        <div style={{ height:1, margin:"4px 12px", background:"rgba(255,255,255,0.05)", flexShrink:0 }}/>
        <AccordionMore
          page={page} onNavigate={onNavigate} onShowShortcuts={onShowShortcuts}
          setShowDonate={setShowDonate} setShowDownload={setShowDl}
          isWeb={isWeb} expanded={expanded}
        />
        <div style={{ height:1, margin:"4px 12px", background:"rgba(255,255,255,0.05)", flexShrink:0 }}/>

        {/* ── Watchlist ── */}
        {savedList.length > 0 && (
          <>
            <SLabel label="Watchlist" expanded={expanded}/>
            <div
              className="ns-sb-scroll"
              style={{ flex:1, overflowY:"auto", overflowX:"hidden", minHeight:0, padding: expanded ? "2px 6px 8px" : "2px 5px 8px" }}
            >
              <div style={{ display:"grid", gridTemplateColumns: expanded ? "repeat(3,1fr)" : "1fr", gap: expanded ? 4 : 5, alignItems:"start" }}>
                {savedList.map((item, index) => {
                  const key=`${item.media_type}_${item.id}`;
                  const title=item.title||item.name;
                  return (
                    <div
                      key={key}
                      draggable
                      onDragStart={e=>dStart(e,index)}
                      onDragEnd={dEnd}
                      onDragEnter={e=>dEnter(e,index)}
                      onDragOver={dOver}
                      onDrop={e=>dDrop(e,index)}
                      onClick={()=>onNavigate(item.media_type==="tv"?"tv":"movie",item)}
                      onContextMenu={e=>ctxOpen(e,item)}
                      onMouseEnter={e=>{if(!expanded)setTooltip({title,y:e.currentTarget.getBoundingClientRect().top+32});}}
                      onMouseLeave={()=>setTooltip(null)}
                      title={expanded?title:undefined}
                      style={{ cursor:"grab", borderRadius:6, overflow:"hidden", border:"1px solid var(--border)", background:"var(--surface3)", transition:"border-color 0.15s, transform 0.15s", position:"relative", aspectRatio:"2/3", width: expanded ? "100%" : 40 }}
                      onMouseOver={e=>{e.currentTarget.style.borderColor="var(--red)";e.currentTarget.style.transform="scale(1.04)";}}
                      onMouseOut={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.transform="scale(1)";}}
                    >
                      {item.poster_path
                        ? <img src={imgUrl(item.poster_path,"w200")} alt={title} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
                        : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text3)"}}><IcoFilm/></div>
                      }
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Tooltip for collapsed state */}
      {tooltip && !expanded && (
        <div style={{ position:"fixed", left:62, top:tooltip.y, transform:"translateY(-50%)", background:"var(--surface3)", color:"var(--text)", fontSize:12, fontWeight:500, padding:"5px 10px", borderRadius:6, border:"1px solid var(--border)", zIndex:9999, pointerEvents:"none", whiteSpace:"nowrap", maxWidth:180, lineHeight:1.3 }}>
          {tooltip.title}
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <div style={{ position:"fixed", top:ctxMenu.y, left:ctxMenu.x, zIndex:9999, background:"rgba(10,18,28,0.98)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, padding:4, minWidth:160 }} onClick={e=>e.stopPropagation()}>
          <button style={{ all:"unset", display:"block", width:"100%", padding:"8px 12px", fontSize:13, color:"var(--text)", cursor:"pointer", borderRadius:5, transition:"background 0.12s" }} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.07)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"} onClick={()=>{onRemoveSaved?.(ctxMenu.item);setCtxMenu(null);}}>
            Remove from Watchlist
          </button>
        </div>
      )}

      {showDonate && <DonateModal onClose={()=>setShowDonate(false)}/>}
      {showDl && isWeb && <DownloadPopup onClose={()=>setShowDl(false)} expanded={expanded}/>}
    </>
  );
}