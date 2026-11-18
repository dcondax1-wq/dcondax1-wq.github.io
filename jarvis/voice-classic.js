// Classic Jarvis voice screen (night-voice 2026-11-18, owner: "back to how it was: all of it"). The voice-mode look of 2026-11-06
// (black, violet glow, Orbitron capitals, the cut-corner fragments), shown only while the Classic Jarvis look is on
// (html[data-jlook=classic], classic.css sets the violet --c / --c3 / --cr). voice-mode.js stays AGORA and appends this to its sheet.
export const CLASSIC_SPEC = '#c084fc';      // the waveform's violet
export const CLASSIC_VM_CSS = `html[data-jlook=classic] .vm{color:var(--txt,#ece9f2);background:radial-gradient(120% 80% at 50% 38%,rgba(var(--cr2,124,58,237),.28),rgba(0,0,0,.94) 62%),#000;font-family:var(--fb,"Rajdhani",system-ui,sans-serif)}
html[data-jlook=classic] .vm::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.5;background:repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 1px,transparent 1px 3px)}
html[data-jlook=classic] .vm-top{border-bottom:0}
html[data-jlook=classic] .vm-tag{font:600 11px var(--fh,"Orbitron",sans-serif);letter-spacing:.16em;text-transform:uppercase;color:var(--c3,#c084fc);text-shadow:0 0 10px rgba(var(--cr,168,85,247),.7)}
html[data-jlook=classic] .vm-tag::after{display:none}
html[data-jlook=classic] .vm-btn,html[data-jlook=classic] .vm-ptt{border-radius:22px;border:1px solid rgba(var(--cr,168,85,247),.55);background:rgba(var(--cr,168,85,247),.12);color:var(--txt,#fff);font:600 11px var(--fh,"Orbitron",sans-serif);letter-spacing:.08em;text-transform:uppercase}
html[data-jlook=classic] .vm-x{border-color:rgba(255,77,109,.7);background:rgba(255,77,109,.16)}
html[data-jlook=classic] .vm[data-holding=on] .vm-ptt{background:var(--c,#a855f7);color:#fff}
html[data-jlook=classic] .vm-hud text{font:600 11px var(--fh,"Orbitron",sans-serif);letter-spacing:.3em;text-transform:uppercase;fill:var(--c3,#c084fc)}
html[data-jlook=classic] .vm-hud .arc{stroke:rgba(var(--cr,168,85,247),.35)}
html[data-jlook=classic] .vm-hud .gauge{stroke:var(--c,#a855f7);filter:drop-shadow(0 0 4px var(--c,#a855f7))}
html[data-jlook=classic] .vm-orb{background:transparent;border-color:rgba(var(--cr,168,85,247),.8);box-shadow:0 0 40px rgba(var(--cr,168,85,247),.6),inset 0 0 40px rgba(var(--cr,168,85,247),.45);transform:scale(calc(.92 + var(--lv,0) * .16))}
html[data-jlook=classic] .vm-orb i{background:radial-gradient(circle,#fff,var(--c3,#c084fc) 40%,transparent 72%);opacity:calc(.6 + var(--lv,0) * .4)}
html[data-jlook=classic] .vm[data-phase=listening] .vm-orb{border-color:rgba(255,77,109,.85);box-shadow:0 0 40px rgba(255,77,109,.55),inset 0 0 40px rgba(255,77,109,.4)}
html[data-jlook=classic] .vm-frag{border:1px solid rgba(var(--cr,168,85,247),.6);border-radius:0;background:rgba(var(--pr,12,10,20),.62);clip-path:polygon(0 0,calc(100% - 9px) 0,100% 9px,100% 100%,9px 100%,0 calc(100% - 9px));box-shadow:0 0 18px rgba(var(--cr,168,85,247),.35)}
html[data-jlook=classic] .vm-frag b{font:600 9px var(--fh,"Orbitron",sans-serif);letter-spacing:.2em;color:var(--c3,#c084fc);text-transform:uppercase}
html[data-jlook=classic] .vm-frag span{font:700 17px var(--fb,"Rajdhani",sans-serif);color:#fff;text-shadow:0 0 8px rgba(var(--cr,168,85,247),.8)}
html[data-jlook=classic] .vm-you{color:var(--mut,#8a8499)}
html[data-jlook=classic] .vm-you:not(:empty)::before{content:"YOU · ";font:600 9px var(--fh,"Orbitron",sans-serif);letter-spacing:.2em;color:#ffb3c2}
html[data-jlook=classic] .vm-jar{font:600 21px/1.3 var(--fb,"Rajdhani",sans-serif)}
html[data-jlook=classic] .vm-jar .w.on{text-shadow:0 0 12px rgba(var(--cr,168,85,247),.75)}
html[data-jlook=classic] .vm-hint,html[data-jlook=classic] .vm-state{font-family:var(--fh,"Orbitron",sans-serif);letter-spacing:.12em;color:var(--mut,#8a8499)}
html[data-jlook=classic] .vm-type input{border-radius:22px;border:1px solid rgba(var(--cr,168,85,247),.6);background:rgba(0,0,0,.5);color:#fff;font:500 16px var(--fb,"Rajdhani",sans-serif)}
html[data-jlook=classic] .vm[data-phase=listening] .vm-tag{color:#ffd0da;text-shadow:0 0 10px var(--bad,#ff4d6d)}`;
