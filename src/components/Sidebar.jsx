import { useState, useEffect, useRef, useCallback } from "react";
import { imgUrl } from "../utils/api";
import { getEffectivePlan as getCurrentPlan } from "../utils/premium";
import DonateModal from "../components/DonateModal";

// ── Thin-stroke modern icon set ─────────────────────────────────────────────
// Consistent: 1.75px stroke, 20px, rounded caps/joins
const S = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" };
function Ico({ d, children }) { return <svg {...S}>{children || <path d={d}/>}</svg>; }

const IcoSearch   = () => <Ico><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" strokeLinejoin="miter"/></Ico>;
const IcoHome     = () => <Ico><path d="M3 9.5 12 3l9 6.5V20a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z"/></Ico>;
const IcoLibrary  = () => <Ico><rect x="3" y="3" width="7" height="8" rx="1.4"/><rect x="14" y="3" width="7" height="5" rx="1.4"/><rect x="14" y="11" width="7" height="9" rx="1.4"/><rect x="3" y="14" width="7" height="6" rx="1.4"/></Ico>;
const IcoDl       = () => <Ico><path d="M12 3v11m0 0-4-4m4 4 4-4M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17"/></Ico>;
const IcoBack     = () => <Ico><path d="M19 12H5m0 0 7 7m-7-7 7-7"/></Ico>;
const IcoSettings = () => <Ico><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></Ico>;
const IcoHelp     = () => <Ico><circle cx="12" cy="12" r="9.5"/><path d="M9.1 9.3a3 3 0 0 1 5.7 1.2c0 1.8-2.1 2.4-2.6 3.4-.15.3-.2.6-.2 1"/><circle cx="12" cy="17.3" r="0.25" fill="currentColor" stroke="none"/></Ico>;
const IcoHeart    = () => <Ico><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></Ico>;
const IcoAppDl    = () => <Ico><rect x="2.5" y="3.5" width="19" height="12.5" rx="1.8"/><path d="M8.5 20.5h7M12 16v4.3"/></Ico>;
const IcoPower    = () => <Ico><path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v8"/></Ico>;
const IcoFilm     = () => <Ico><rect x="2.5" y="2.5" width="19" height="19" rx="2.2"/><path d="M7 2.5v19M17 2.5v19M2.5 8.5h4M2.5 15.5h4M17 15.5h4.5M17 8.5h4.5"/></Ico>;
const IcoChevron  = ({ open }) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)", transform: open ? "rotate(180deg)" : "rotate(0)", flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>;
const IcoShorts   = () => <Ico><rect x="3" y="2" width="13" height="20" rx="3.2"/><path d="M9.6 9.2 14 12l-4.4 2.8z" fill="currentColor" stroke="none"/><path d="M18.5 6.5 21 4M19 11h2.5M18.5 15.5 21 18"/></Ico>;

// NS-AI gradient icon (kept as the one intentional spark of color in the rail)
const IcoAI = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id="aig2" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
        <stop stopColor="#00d4ff"/><stop offset="1" stopColor="#7c3aed"/>
      </linearGradient>
    </defs>
    <path d="M12 3.5l1.85 4.65L18.5 10l-4.65 1.85L12 16.5l-1.85-4.65L5.5 10l4.65-1.85z" fill="url(#aig2)"/>
    <path d="M18.5 14.5l.75 1.9 1.9.75-1.9.75-.75 1.9-.75-1.9-1.9-.75 1.9-.75z" fill="url(#aig2)" opacity="0.85"/>
  </svg>
);

// ── Constants ────────────────────────────────────────────────────────────────
const SB_W = { collapsed: 56, expanded: 224 };

function getPlanTier(id) {
  if (id === "premium") return "diamond";
  if (id === "standard") return "gold";
  if (id === "basic" || id === "mobile") return "silver";
  return "free";
}
const TIER = {
  free:    { label:"Free",    g0:"#00b4a6", g1:"#007a72", ring:"#00b4a6", badge:null },
  silver:  { label:"Silver",  g0:"#d0d8e0", g1:"#8a9aaa", ring:"#c0c8d0", badge:{ sym:"✦", col:"#c8d0d8" } },
  gold:    { label:"Gold",    g0:"#f5a623", g1:"#c87800", ring:"#f5a623", badge:{ sym:"★", col:"#f5a623" } },
  diamond: { label:"Diamond", g0:"#00d4ff", g1:"#7c3aed", ring:"#00d4ff", badge:{ sym:"◆", col:"#00d4ff" } },
};

// ── Download popup ────────────────────────────────────────────────────────────
function DownloadPopup({ onClose, expanded }) {
  const [rel,setRel]=useState(null),[loading,setLd]=useState(true),[dl,setDl]=useState(false);
  const DIRECT = { url:"https://github.com/Guudiecodes/novasparks-gen/releases/download/v2.4.0/NovaSpark.Setup.2.4.0.exe", version:"v2.4.0", name:"NovaSpark Setup 2.4.0.exe", size:"84.5 MB" };
  useEffect(()=>{setRel(DIRECT);setLd(false);},[]);
  const download=()=>{if(!rel?.url)return;setDl(true);const a=document.createElement("a");a.href=rel.url;a.download=rel.name;document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(()=>setDl(false),3000);};
  const left = expanded ? SB_W.expanded + 12 : SB_W.collapsed + 12;
  return (
    <div style={{position:"fixed",left,bottom:100,zIndex:99998,width:272,background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:12,overflow:"hidden"}}>
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
  const t=TIER[tier]||TIER.free, gid=`nsg${tier}`;
  return (
    <svg viewBox="0 0 44 44" fill="none" style={{width:"100%",height:"100%",display:"block"}}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor={t.g0}/><stop offset="1" stopColor={t.g1}/>
        </linearGradient>
      </defs>
      <circle cx="22" cy="22" r="20" fill={`url(#${gid})`} opacity={tier==="free"?0.08:0.14}/>
      <circle cx="22" cy="22" r="20" stroke={`url(#${gid})`} strokeWidth={tier==="free"?"1.5":"2"} fill="none"/>
      <text x="22" y="28" textAnchor="middle" fontFamily="'Bebas Neue','Outfit',sans-serif" fontSize="18" fontWeight="700" fill={`url(#${gid})`} letterSpacing="1">NS</text>
    </svg>
  );
}
function TierDot({ tier }) {
  if (tier==="free") return null;
  const t=TIER[tier];
  return <div style={{position:"absolute",bottom:-1,right:-1,width:13,height:13,borderRadius:"50%",background:"var(--bg,#050c0f)",border:`1.5px solid ${t.badge.col}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,color:t.badge.col,fontWeight:900,pointerEvents:"none"}}>{t.badge.sym}</div>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
function useIsMobile() {
  const [m,setM]=useState(()=>window.innerWidth<=768);
  useEffect(()=>{const mq=window.matchMedia("(max-width:768px)");const h=e=>setM(e.matches);mq.addEventListener("change",h);return()=>mq.removeEventListener("change",h);},[]);
  return m;
}

// ── Corner badge — sits ON TOP of an icon's corner, never expands the row ────
// This is what fixes the "floating dot poking outside the sidebar" bug: a
// badge is never laid out inline next to the icon, it's pinned to the icon's
// own 20×20 box, so it physically cannot overflow the 56px collapsed rail.
function IconWithBadge({ icon, badge }) {
  return (
    <span style={{ position:"relative", width:20, height:20, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
      {icon}
      {badge && <span style={{ position:"absolute", top:-3, right:-4, lineHeight:0 }}>{badge}</span>}
    </span>
  );
}
const DotBadge = ({ color="var(--red)" }) => <span style={{ display:"block", width:7, height:7, borderRadius:"50%", background:color, border:"1.5px solid var(--bg,#050c0f)" }}/>;
const CountBadge = ({ n }) => <span style={{ display:"flex", minWidth:15, height:15, padding:"0 3px", borderRadius:8, background:"var(--red)", border:"1.5px solid var(--bg,#050c0f)", color:"#fff", fontSize:9, fontWeight:800, alignItems:"center", justifyContent:"center" }}>{n>9?"9+":n}</span>;

// ── Sidebar button ────────────────────────────────────────────────────────────
function SBtn({ active, icon, label, badge, shortcut, onClick, expanded, accent }) {
  const [hov,setHov]=useState(false);
  const col = active ? "var(--red)" : accent || (hov ? "var(--text)" : "var(--text3)");
  const bg  = active ? "rgba(0,180,166,0.1)" : hov ? "rgba(255,255,255,0.05)" : "transparent";
  return (
    <button
      onClick={onClick}
      onMouseEnter={()=>setHov(true)}
      onMouseLeave={()=>setHov(false)}
      title={!expanded ? label : undefined}
      style={{ all:"unset", display:"flex", alignItems:"center", gap:12, width:"calc(100% - 12px)", margin:"1px 6px", padding:"0 11px", height:40, borderRadius:9, cursor:"pointer", color:col, background:bg, transition:"background 0.15s, color 0.15s", flexShrink:0, boxSizing:"border-box" }}
    >
      <IconWithBadge icon={icon} badge={!expanded ? badge : null}/>
      <span style={{ fontSize:13, fontWeight:500, letterSpacing:0.1, whiteSpace:"nowrap", overflow:"hidden", maxWidth: expanded ? 130 : 0, opacity: expanded ? 1 : 0, transition:"max-width 0.25s cubic-bezier(0.4,0,0.2,1), opacity 0.2s 0.05s", flex:1, textOverflow:"ellipsis" }}>{label}</span>
      {expanded && shortcut && <span style={{ flexShrink:0, fontSize:10, color:"var(--text3)", opacity:0.6, letterSpacing:0.5 }}>{shortcut}</span>}
      {expanded && badge && <span style={{ marginLeft: shortcut?6:"auto", flexShrink:0 }}>{badge}</span>}
    </button>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────
function SLabel({ label, expanded }) {
  return (
    <div style={{ height: expanded ? 26 : 8, overflow:"hidden", transition:"height 0.25s cubic-bezier(0.4,0,0.2,1)", flexShrink:0 }}>
      <div style={{ padding:"10px 17px 2px", fontSize:9, fontWeight:700, letterSpacing:2, textTransform:"uppercase", color:"var(--text3)", whiteSpace:"nowrap", opacity: expanded ? 0.55 : 0, transition:"opacity 0.2s" }}>
        {label}
      </div>
    </div>
  );
}

// ── Accordion "More" menu — expands in place, pushing the rest of the rail
//    down, and collapses the instant the sidebar itself collapses ───────────
function AccordionMore({ page, onNavigate, onShowShortcuts, setShowDonate, setShowDownload, isWeb, expanded }) {
  const [open,setOpen]=useState(false);
  const [hov,setHov]=useState(false);
  const col = (open||hov) ? "var(--text)" : "var(--text3)";

  useEffect(()=>{ if(!expanded) setOpen(false); },[expanded]);

  const items = [
    { label:"Settings",    icon:<IcoSettings/>,  active:page==="settings", action:()=>onNavigate("settings") },
    { label:"Help",        icon:<IcoHelp/>,       action:()=>onShowShortcuts() },
    { label:"Support",     icon:<IcoHeart/>,      accent:"#e8547a", action:()=>setShowDonate(true) },
    ...(isWeb ? [{ label:"Desktop App", icon:<IcoAppDl/>, accent:"var(--amber,#f5a623)", action:()=>setShowDownload(v=>!v) }] : []),
    ...(window.electron?.quitApp ? [{ label:"Quit", icon:<IcoPower/>, accent:"#e53e3e", action:()=>window.electron.quitApp() }] : []),
  ];

  return (
    <div style={{ flexShrink:0 }}>
      <button
        onClick={()=>expanded && setOpen(v=>!v)}
        onMouseEnter={()=>setHov(true)}
        onMouseLeave={()=>setHov(false)}
        title={!expanded ? "More" : undefined}
        style={{ all:"unset", display:"flex", alignItems:"center", gap:12, width:"calc(100% - 12px)", margin:"1px 6px", padding:"0 11px", height:40, borderRadius:9, cursor:"pointer", color: open ? "var(--red)" : col, background: open ? "rgba(0,180,166,0.08)" : hov ? "rgba(255,255,255,0.05)" : "transparent", transition:"background 0.15s, color 0.15s", boxSizing:"border-box" }}
      >
        <span style={{ flexShrink:0, width:20, height:20, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
          </svg>
        </span>
        <span style={{ fontSize:13, fontWeight:500, whiteSpace:"nowrap", overflow:"hidden", maxWidth: expanded ? 130 : 0, opacity: expanded ? 1 : 0, transition:"max-width 0.25s cubic-bezier(0.4,0,0.2,1), opacity 0.2s 0.05s", flex:1 }}>More</span>
        {expanded && <IcoChevron open={open}/>}
      </button>

      <div style={{ overflow:"hidden", maxHeight: open ? `${items.length * 42 + 10}px` : "0", transition:"max-height 0.3s cubic-bezier(0.4,0,0.2,1)" }}>
        <div style={{ height:1, margin:"3px 17px 5px", background:"var(--border)", opacity:0.6 }}/>
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
  const collapseTimer = useRef(null);
  const isMobile = useIsMobile();

  useEffect(()=>{ const h=()=>setPlanId(getCurrentPlan()); window.addEventListener("ns:plan-changed",h); return()=>window.removeEventListener("ns:plan-changed",h); },[]);
  useEffect(()=>{ setPlanId(getCurrentPlan()); },[isPremium]);

  const tier = getPlanTier(planId);
  const tc   = TIER[tier];
  const isWeb = !window.electron;

  const expand = useCallback(()=>{
    clearTimeout(collapseTimer.current);
    setExpanded(true);
    document.documentElement.style.setProperty("--sidebar", `${SB_W.expanded}px`);
  },[]);
  const collapse = useCallback(()=>{
    // Tiny grace period stops accidental flicker when the cursor grazes the edge.
    collapseTimer.current = setTimeout(()=>{
      setExpanded(false);
      document.documentElement.style.setProperty("--sidebar", `${SB_W.collapsed}px`);
    }, 120);
  },[]);
  useEffect(()=>()=>clearTimeout(collapseTimer.current),[]);

  useEffect(()=>{
    const close=()=>setCtxMenu(null);
    window.addEventListener("click",close);
    window.addEventListener("contextmenu",close);
    return()=>{ window.removeEventListener("click",close); window.removeEventListener("contextmenu",close); };
  },[]);

  // Drag handlers (re-order watchlist)
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
      { id:"search",    label:"Search",
        icon:(a)=><svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none" stroke={a?"var(--red)":"var(--text3)"} strokeWidth="1.75" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" strokeLinejoin="miter"/></svg>,
        onTap:onSearch },
      { id:"home",      label:"Home",
        icon:(a)=><svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none" stroke={a?"var(--red)":"var(--text3)"} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg> },
      { id:"reel",      label:"Shorts",
        icon:(a)=><svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none" stroke={a?"#f5a623":"var(--text3)"} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="14" height="18" rx="3.2"/><path d="M10.6 9.8 14.5 12l-3.9 2.2z" fill={a?"#f5a623":"var(--text3)"} stroke="none"/></svg>,
        corner:(a)=>!a&&<span style={{position:"absolute",top:1,right:6,background:"linear-gradient(135deg,#f5a623,#e74c3c)",borderRadius:3,padding:"1px 3px",fontSize:6,fontWeight:900,color:"#fff",lineHeight:1.5}}>NEW</span> },
      { id:"nsai",      label:"NS AI",    onTap:()=>onNavigate("nsai"), icon:()=><IcoAI/>,
        corner:()=><span style={{position:"absolute",top:2,right:7,width:6,height:6,borderRadius:"50%",background:"linear-gradient(135deg,#00d4ff,#7c3aed)",animation:"ns-ai-pulse 2s ease-in-out infinite",pointerEvents:"none"}}/> },
      { id:"history",   label:"Library",
        icon:(a)=><svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none" stroke={a?"var(--red)":"var(--text3)"} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="8" rx="1.3"/><rect x="14" y="3" width="7" height="5" rx="1.3"/><rect x="14" y="11" width="7" height="9" rx="1.3"/><rect x="3" y="14" width="7" height="6" rx="1.3"/></svg> },
      { id:"downloads", label:"Downloads", badge:activeDownloads>0?activeDownloads:null,
        icon:(a)=><svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none" stroke={a?"var(--red)":"var(--text3)"} strokeWidth="1.75" strokeLinecap="round"><path d="M12 3v11m0 0-4-4m4 4 4-4M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17"/></svg> },
      { id:"settings",  label:"Settings",
        icon:(a)=><svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none" stroke={a?"var(--red)":"var(--text3)"} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
      { id:"donate",    label:"Support",  onTap:()=>setShowDonate(true),
        icon:()=><svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> },
      ...(isWeb?[{ id:"get-app",label:"App",onTap:()=>setShowDl(v=>!v), icon:()=><svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="3.5" width="19" height="12.5" rx="1.8"/><path d="M8.5 20.5h7M12 16v4.3"/></svg> }]:[]),
    ];
    return (
      <>
      {/* Mobile top bar */}
      <div style={{position:"fixed",top:0,left:0,right:0,height:52,background:"rgba(4,8,13,0.98)",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",zIndex:100}}>
        <div onClick={()=>onNavigate("pricing")} title={logoLabel} style={{position:"relative",width:32,height:32,cursor:"pointer"}}>
          <NSLogo tier={tier}/><TierDot tier={tier}/>
        </div>
        <span style={{fontFamily:"var(--font-display)",fontSize:18,letterSpacing:3,color:"var(--text)"}}>NOVASPARK</span>
        <div onClick={()=>onNavigate("pricing")} style={{display:"flex",alignItems:"center",gap:5,padding:"3px 9px",borderRadius:20,border:`1px solid ${tier==="free"?"var(--border)":tc.ring}`,background:tier==="free"?"rgba(255,255,255,0.03)":"rgba(0,180,166,0.07)",cursor:"pointer"}}>
          <span style={{width:6,height:6,borderRadius:"50%",background:tier==="free"?"var(--red)":tier==="silver"?"#c0c8d0":tier==="gold"?"#f5a623":"linear-gradient(135deg,#00d4ff,#7c3aed)"}}/>
          <span style={{fontSize:9,fontWeight:700,letterSpacing:0.5,color:tier==="free"?"var(--text3)":tc.g0,textTransform:"uppercase"}}>{tc.label}</span>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(4,8,13,0.98)",borderTop:"1px solid var(--border)",paddingBottom:"env(safe-area-inset-bottom,0)",zIndex:100}}>
        <style>{`@keyframes ns-ai-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.45;transform:scale(0.65);}}`}</style>
        <div style={{display:"flex",alignItems:"stretch",overflowX:"auto",scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
        <div style={{width:6,flexShrink:0}}/>
        {mobileItems.map(({id,icon,label,badge,onTap,corner})=>{
          const isAction=["search","donate","get-app"].includes(id);
          const active=!isAction&&page===id;
          const isReel=id==="reel",isAI=id==="nsai";
          const ac=isReel?"#f5a623":isAI?"#00d4ff":"var(--red)";
          return (
          <button
            key={id}
            onClick={onTap ?? (() => onNavigate(id))}
            style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,height:54,minWidth:58,background:"none",border:"none",cursor:"pointer",padding:"0 6px",position:"relative",fontFamily:"var(--font-body)",borderTop:active?`2px solid ${ac}`:"2px solid transparent",transition:"border-color 0.2s"}}
          >
            <span style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center",transform:active?"scale(1.12)":"scale(1)",transition:"transform 0.15s"}}>
              {icon(active)}
              {corner?.(active)}
            </span>
            <span style={{fontSize:8.5,fontWeight:600,color:active?ac:"var(--text3)",letterSpacing:0.2,lineHeight:1,whiteSpace:"nowrap"}}>{label}</span>
            {badge!=null&&<span style={{position:"absolute",top:6,right:8,minWidth:15,height:15,borderRadius:8,background:"var(--red)",color:"#fff",fontSize:8,fontWeight:800,lineHeight:"15px",textAlign:"center",padding:"0 3px",border:"1.5px solid rgba(4,8,13,1)"}}>{badge>9?"9+":badge}</span>}
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
          display: "flex",
          flexDirection: "column",
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 90,
        }}
      >
        <style>{`
          @keyframes ns-ai-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.45;transform:scale(0.65);}}
          .main{transition:margin-left 0.25s cubic-bezier(0.4,0,0.2,1)!important;}
          .sidebar::-webkit-scrollbar{display:none;}
          .ns-sb-scroll{scrollbar-width:thin;}
          .ns-sb-scroll::-webkit-scrollbar{width:3px;}
          .ns-sb-scroll::-webkit-scrollbar-track{background:transparent;}
          .ns-sb-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:2px;}
          .ns-sb-scroll::-webkit-scrollbar-thumb:hover{background:rgba(0,180,166,0.3);}
        `}</style>

        {/* ── Logo header ── */}
        <div onClick={()=>onNavigate("pricing")} title={logoLabel} style={{ display:"flex", alignItems:"center", gap:11, padding:"6px 7px", margin:"8px 6px 6px", cursor:"pointer", borderRadius:10, flexShrink:0, transition:"background 0.15s", overflow:"hidden" }} onMouseEnter={e=>e.currentTarget.style.background="rgba(0,180,166,0.06)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          <div style={{ position:"relative", width:32, height:32, flexShrink:0 }}>
            <NSLogo tier={tier}/><TierDot tier={tier}/>
          </div>
          <span style={{ fontFamily:"var(--font-display)", fontSize:16, letterSpacing:2.5, color:"var(--red)", whiteSpace:"nowrap", overflow:"hidden", maxWidth: expanded ? 140 : 0, opacity: expanded ? 1 : 0, transition:"max-width 0.25s cubic-bezier(0.4,0,0.2,1), opacity 0.2s 0.06s" }}>NOVASPARK</span>
        </div>

        {/* ── Nav section ── */}
        <SLabel label="Navigate" expanded={expanded}/>
        <SBtn expanded={expanded} onClick={onSearch}                                   icon={<IcoSearch/>} label="Search" shortcut="⌘F"/>
        <SBtn expanded={expanded} active={page==="home"} onClick={()=>onNavigate("home")} icon={<IcoHome/>}   label="Home"/>

        {/* Reels / Shorts — corner badge, never overflows the rail */}
        <SBtn
          expanded={expanded} active={page==="reel"} onClick={()=>onNavigate("reel")}
          icon={<span style={{color:page==="reel"?"#f5a623":undefined}}><IcoShorts/></span>}
          label="NS Shorts"
          badge={!expanded
            ? <DotBadge color="#f5a623"/>
            : <span style={{fontSize:7,fontWeight:800,background:"linear-gradient(135deg,#f5a623,#e74c3c)",borderRadius:3,padding:"1px 5px",color:"#fff",letterSpacing:0.3,lineHeight:1.5}}>NEW</span>}
        />

        {/* NS AI */}
        <SBtn
          expanded={expanded} active={page==="nsai"} onClick={()=>onNavigate("nsai")}
          icon={<IcoAI/>} label="NS AI"
          badge={<span style={{width:6,height:6,borderRadius:"50%",display:"inline-block",background:"linear-gradient(135deg,#00d4ff,#7c3aed)",animation:"ns-ai-pulse 2s ease-in-out infinite"}}/>}
        />

        {/* ── Library section ── */}
        <SLabel label="Library" expanded={expanded}/>
        <SBtn expanded={expanded} active={page==="history"}   onClick={()=>onNavigate("history")}   icon={<IcoLibrary/>} label="Library & History"/>
        <SBtn expanded={expanded} active={page==="downloads"} onClick={()=>onNavigate("downloads")} icon={<IcoDl/>}      label="Downloads" badge={activeDownloads>0 ? (expanded?<CountBadge n={activeDownloads}/>:<DotBadge/>) : undefined}/>
        {canGoBack && <SBtn expanded={expanded} onClick={onBack} icon={<IcoBack/>} label="Back" shortcut="⌃Z"/>}

        {/* ── More accordion ── */}
        <div style={{ height:1, margin:"5px 17px", background:"var(--border)", opacity:0.6, flexShrink:0 }}/>
        <AccordionMore
          page={page} onNavigate={onNavigate} onShowShortcuts={onShowShortcuts}
          setShowDonate={setShowDonate} setShowDownload={setShowDl}
          isWeb={isWeb} expanded={expanded}
        />
        <div style={{ height:1, margin:"5px 17px", background:"var(--border)", opacity:0.6, flexShrink:0 }}/>

        {/* ── Watchlist ── */}
        {savedList.length > 0 && (
          <>
            <SLabel label={`Watchlist · ${savedList.length}`} expanded={expanded}/>
            <div
              className="ns-sb-scroll"
              style={{ flex:1, overflowY:"auto", overflowX:"hidden", minHeight:0, padding: expanded ? "2px 8px 10px" : "2px 6px 10px" }}
            >
              <div style={{ display:"grid", gridTemplateColumns: expanded ? "repeat(3,1fr)" : "1fr", gap: expanded ? 6 : 6, alignItems:"start" }}>
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
                      onMouseEnter={e=>{if(!expanded)setTooltip({title,y:e.currentTarget.getBoundingClientRect().top+20});}}
                      onMouseLeave={()=>setTooltip(null)}
                      title={expanded?title:undefined}
                      style={{ cursor:"grab", borderRadius:7, overflow:"hidden", border:"1px solid var(--border)", background:"var(--surface3)", transition:"border-color 0.15s, transform 0.15s", position:"relative", aspectRatio:"2/3", width: expanded ? "100%" : 42 }}
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
        <div style={{ position:"fixed", left:64, top:tooltip.y, transform:"translateY(-50%)", background:"var(--surface3)", color:"var(--text)", fontSize:12, fontWeight:500, padding:"5px 10px", borderRadius:6, border:"1px solid var(--border)", zIndex:9999, pointerEvents:"none", whiteSpace:"nowrap", maxWidth:180, lineHeight:1.3 }}>
          {tooltip.title}
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <div style={{ position:"fixed", top:ctxMenu.y, left:ctxMenu.x, zIndex:9999, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:4, minWidth:170 }} onClick={e=>e.stopPropagation()}>
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