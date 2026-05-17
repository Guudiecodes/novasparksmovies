import { useState, useEffect, useRef } from "react";

// Animated particle background
function Particles() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener("resize", resize);

    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.5 + 0.5,
      opacity: Math.random() * 0.5 + 0.1,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 212, 255, ${p.opacity})`;
        ctx.fill();
      });

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0, 212, 255, ${0.08 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />;
}

export default function NSAIPage({ onBack }) {
  const [glitch, setGlitch] = useState(false);

  // Occasional glitch effect
  useEffect(() => {
    const interval = setInterval(() => {
      setGlitch(true);
      setTimeout(() => setGlitch(false), 150);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg)",
      position: "relative",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
    }}>
      {/* Animated particle background */}
      <Particles />

      {/* Radial glow */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(0,212,255,0.08) 0%, rgba(124,58,237,0.05) 50%, transparent 80%)",
      }} />

      {/* Blur overlay — the "locked" effect */}
      <div style={{
        position: "absolute", inset: 0,
        backdropFilter: "blur(2px)",
        background: "rgba(0,0,0,0.45)",
        zIndex: 1,
      }} />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2, textAlign: "center", padding: "0 40px", maxWidth: 600 }}>

        {/* AI Icon */}
        <div style={{
          width: 100, height: 100,
          margin: "0 auto 32px",
          position: "relative",
        }}>
          <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
            <defs>
              <linearGradient id="page-ai-grad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
                <stop offset="0%"   stopColor="#00d4ff" />
                <stop offset="50%"  stopColor="#7c3aed" />
                <stop offset="100%" stopColor="#00d4ff" />
              </linearGradient>
              <filter id="page-ai-glow">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <circle cx="50" cy="50" r="45" stroke="url(#page-ai-grad)" strokeWidth="2" fill="none" opacity="0.4" filter="url(#page-ai-glow)" />
            <circle cx="50" cy="50" r="35" stroke="url(#page-ai-grad)" strokeWidth="1" fill="none" opacity="0.25" />
            <circle cx="50" cy="50" r="12" fill="url(#page-ai-grad)" opacity="0.9" filter="url(#page-ai-glow)" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
              const rad = (angle * Math.PI) / 180;
              const x1 = 50 + 12 * Math.cos(rad);
              const y1 = 50 + 12 * Math.sin(rad);
              const x2 = 50 + 45 * Math.cos(rad);
              const y2 = 50 + 45 * Math.sin(rad);
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="url(#page-ai-grad)" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />;
            })}
            {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
              const rad = (angle * Math.PI) / 180;
              const x  = 50 + 45 * Math.cos(rad);
              const y  = 50 + 45 * Math.sin(rad);
              return <circle key={i} cx={x} cy={y} r="3" fill="url(#page-ai-grad)" opacity="0.8" />;
            })}
          </svg>
          {/* Spinning ring */}
          <div style={{
            position: "absolute", inset: -8,
            border: "1px solid rgba(0,212,255,0.3)",
            borderTop: "1px solid rgba(0,212,255,0.8)",
            borderRadius: "50%",
            animation: "ns-ai-spin 3s linear infinite",
          }} />
          <div style={{
            position: "absolute", inset: -16,
            border: "1px solid rgba(124,58,237,0.2)",
            borderBottom: "1px solid rgba(124,58,237,0.6)",
            borderRadius: "50%",
            animation: "ns-ai-spin 5s linear infinite reverse",
          }} />
        </div>

        {/* Title */}
        <div style={{
          fontFamily: "var(--font-display)",
          fontSize: 64,
          letterSpacing: 4,
          color: "#fff",
          marginBottom: 8,
          textShadow: glitch
            ? "2px 0 rgba(0,212,255,0.8), -2px 0 rgba(124,58,237,0.8)"
            : "0 0 40px rgba(0,212,255,0.4)",
          transition: "text-shadow 0.1s",
          userSelect: "none",
        }}>
          NS AI
        </div>

        <div style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 6,
          textTransform: "uppercase",
          color: "rgba(0,212,255,0.7)",
          marginBottom: 40,
        }}>
          The Intelligence Layer
        </div>

        {/* Lock + Coming Soon badge */}
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 40,
          padding: "12px 28px",
          backdropFilter: "blur(20px)",
          marginBottom: 40,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="11" width="18" height="11" rx="2" stroke="rgba(0,212,255,0.7)" strokeWidth="1.5" />
            <path d="M7 11V7a5 5 0 0110 0v4" stroke="rgba(0,212,255,0.7)" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="12" cy="16" r="1.5" fill="rgba(0,212,255,0.7)" />
          </svg>
          <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.7)", letterSpacing: 2 }}>
            COMING SOON
          </span>
        </div>

        {/* Description */}
        <p style={{
          fontSize: 15,
          color: "rgba(255,255,255,0.45)",
          lineHeight: 1.8,
          maxWidth: 440,
          margin: "0 auto 48px",
        }}>
          An AI built for entertainment. Personalized recommendations, instant content summaries, intelligent search, and more — all powered by the NS intelligence layer.
        </p>

        {/* Feature previews */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 48 }}>
          {[
            { icon: "🎯", label: "Smart Picks" },
            { icon: "💬", label: "Chat with NS" },
            { icon: "📊", label: "Watch Analytics" },
            { icon: "🔍", label: "Deep Search" },
          ].map(({ icon, label }) => (
            <div key={label} style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              padding: "14px 18px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12,
              backdropFilter: "blur(10px)",
              minWidth: 90,
              filter: "blur(0.5px)",
              opacity: 0.7,
            }}>
              <span style={{ fontSize: 22 }}>{icon}</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, letterSpacing: 0.5 }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Back button */}
        <button
          onClick={onBack}
          className="btn btn-ghost"
          style={{ margin: "0 auto" }}
        >
          ← Back
        </button>
      </div>

      <style>{`
        @keyframes ns-ai-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}