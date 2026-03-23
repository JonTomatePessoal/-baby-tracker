// src/App.jsx
import { useState, useEffect } from "react";
import { db } from "./firebase";
import {
  collection, onSnapshot, doc,
  setDoc, deleteDoc, query, orderBy
} from "firebase/firestore";

// ─── Dados iniciais (carregados uma única vez se o banco estiver vazio) ───────
const defaultSessions = [
  { id: "1", date: "2026-03-22", woke: "06:30", slept: "08:00" },
  { id: "2", date: "2026-03-22", woke: "08:45", slept: "10:45" },
  { id: "3", date: "2026-03-22", woke: "13:45", slept: "16:30" },
  { id: "4", date: "2026-03-22", woke: "17:00", slept: "19:35" },
  { id: "5", date: "2026-03-22", woke: "21:45", slept: "22:22" },
  { id: "6", date: "2026-03-23", woke: "00:26", slept: "00:48" },
  { id: "7", date: "2026-03-23", woke: "04:35", slept: "05:10" },
];

// ─── Utilitários ──────────────────────────────────────────────────────────────
function toMins(t) {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function toHHMM(m) {
  const total = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
function diffMins(from, to) {
  let d = toMins(to) - toMins(from);
  if (d < 0) d += 1440;
  return d;
}
function fmt(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h${m > 0 ? m + "min" : ""}` : `${m}min`;
}
function isNight(t) {
  const m = toMins(t);
  return m >= 19 * 60 || m < 7 * 60;
}
function formatDate(d) {
  const [, mo, day] = d.split("-");
  return `${day}/${mo}`;
}
function nowHHMM() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
}
function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}
function newId() {
  return Date.now().toString();
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const iStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 9,
  border: "1.5px solid #f0e0d0", fontSize: 14,
  fontFamily: "Georgia, serif", color: "#2d1f0e",
  background: "#fffbf8", boxSizing: "border-box", outline: "none",
};
const btnBase = {
  border: "none", borderRadius: 8, fontSize: 13,
  cursor: "pointer", fontFamily: "Georgia, serif", padding: "9px",
};
const orange = "#e76f51", blue = "#4a7fb5", muted = "#9e8777";

// ─── Componente principal ─────────────────────────────────────────────────────
export default function App() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("previsoes");
  const [editId, setEditId] = useState(null);
  const [editBuf, setEditBuf] = useState({});
  const [newDate, setNewDate] = useState(todayISO);
  const [newWoke, setNewWoke] = useState("");
  const [newSlept, setNewSlept] = useState("");
  const [now, setNow] = useState(nowHHMM());

  // Relógio ao vivo
  useEffect(() => {
    const t = setInterval(() => setNow(nowHHMM()), 30000);
    return () => clearInterval(t);
  }, []);

  // Escuta o Firestore em tempo real
  useEffect(() => {
    const q = query(collection(db, "sessions"), orderBy("date"), orderBy("woke"));
    const unsub = onSnapshot(q, async (snap) => {
      if (snap.empty) {
        // Banco vazio: carrega dados iniciais
        for (const s of defaultSessions) {
          await setDoc(doc(db, "sessions", s.id), s);
        }
      } else {
        setSessions(snap.docs.map(d => ({ ...d.data(), id: d.id })));
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  // ─── Estatísticas ───────────────────────────────────────────────────────────
  const sorted = [...sessions].sort((a, b) =>
    (a.date + a.woke) < (b.date + b.woke) ? -1 : 1
  );

  const sleepPeriods = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].slept) {
      const mins = diffMins(sorted[i].slept, sorted[i + 1].woke);
      if (mins > 0 && mins < 600)
        sleepPeriods.push({ mins, night: isNight(sorted[i].slept) });
    }
  }
  const awakePeriods = sorted
    .filter(s => s.slept)
    .map(s => ({ mins: diffMins(s.woke, s.slept) }))
    .filter(p => p.mins > 0 && p.mins < 300);

  const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
  const avgSleep = avg(sleepPeriods.map(p => p.mins)) ?? 90;
  const avgAwake = avg(awakePeriods.map(p => p.mins)) ?? 60;
  const avgNight = avg(sleepPeriods.filter(p => p.night).map(p => p.mins)) ?? 240;

  // ─── Previsão ao vivo ───────────────────────────────────────────────────────
  const last = sorted[sorted.length - 1];
  const babyIsAwake = last && !last.slept;
  const babyIsSleeping = last && !!last.slept;

  let liveLabel = "", liveTime = "", liveType = "", liveBottle = "";
  if (babyIsAwake) {
    const sleepAt = toMins(last.woke) + avgAwake;
    liveTime = toHHMM(sleepAt);
    liveLabel = `Previsão de dormir às ${liveTime}`;
    liveType = "sleep";
  } else if (babyIsSleeping) {
    const len = isNight(last.slept) ? avgNight : avgSleep;
    const wakeAt = toMins(last.slept) + len;
    liveTime = toHHMM(wakeAt);
    liveLabel = `Previsão de acordar às ${liveTime}`;
    liveBottle = toHHMM(wakeAt - 10);
    liveType = "wake";
  }

  // ─── Cadeia de previsões ────────────────────────────────────────────────────
  const predictions = [];
  if (last) {
    let cursor = last.slept
      ? toMins(last.slept)
      : toMins(last.woke) + avgAwake;

    if (babyIsAwake) {
      predictions.push({ type: "sleep", time: toHHMM(cursor), label: `Dorme (~${fmt(avgAwake)} acordado)`, alert: toHHMM(cursor - 10), bottle: false });
    }
    for (let i = 0; i < 5; i++) {
      const night = cursor >= 19 * 60 || cursor < 7 * 60;
      const len = night ? avgNight : avgSleep;
      const wakeT = cursor + len;
      const sleepT = wakeT + avgAwake;
      predictions.push({ type: "wake", time: toHHMM(wakeT), label: `Acorda (~${fmt(len)} dormindo)`, alert: toHHMM(wakeT - 10), bottle: true });
      predictions.push({ type: "sleep", time: toHHMM(sleepT), label: `Dorme (~${fmt(avgAwake)} acordado)`, alert: toHHMM(sleepT - 10), bottle: false });
      cursor = sleepT;
    }
  }

  // ─── Handlers Firebase ──────────────────────────────────────────────────────
  const saveSession = async (s) => {
    await setDoc(doc(db, "sessions", s.id), s);
  };
  const removeSession = async (id) => {
    await deleteDoc(doc(db, "sessions", id));
  };
  const startEdit = (s) => { setEditId(s.id); setEditBuf({ date: s.date, woke: s.woke, slept: s.slept || "" }); };
  const saveEdit = async () => {
    await saveSession({ id: editId, ...editBuf });
    setEditId(null);
  };
  const addSession = async () => {
    if (!newWoke) return;
    const s = { id: newId(), date: newDate, woke: newWoke, slept: newSlept || "" };
    await saveSession(s);
    setNewWoke(""); setNewSlept("");
  };

  // ─── Agrupamento por data ───────────────────────────────────────────────────
  const byDate = {};
  sorted.forEach(s => { if (!byDate[s.date]) byDate[s.date] = []; byDate[s.date].push(s); });
  const dateGroups = Object.keys(byDate).sort().reverse();

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "#fef9f3", fontFamily: "Georgia, serif", color: muted }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🌙</div>
      <div>Carregando dados...</div>
    </div>
  );

  return (
    <div style={{ fontFamily: "Georgia, serif", background: "#fef9f3", minHeight: "100vh", color: "#2d1f0e" }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #f4a261, #e76f51)", padding: "24px 20px 18px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -20, right: -20, width: 110, height: 110, borderRadius: "50%", background: "rgba(255,255,255,0.1)" }} />
        <div style={{ fontSize: 32 }}>🌙</div>
        <h1 style={{ margin: "4px 0 2px", fontSize: 20, fontWeight: "bold", color: "#fff" }}>Sono do Bebê</h1>
        <p style={{ margin: 0, color: "rgba(255,255,255,0.85)", fontSize: 12 }}>5 meses · {now} · ☁️ sincronizado</p>
      </div>

      {/* Banner ao vivo */}
      {liveTime && (
        <div style={{ background: liveType === "sleep" ? "#eef3fb" : "#fff4ee", borderBottom: `3px solid ${liveType === "sleep" ? blue : orange}`, padding: "14px 20px", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 32 }}>{liveType === "sleep" ? "🌙" : "☀️"}</div>
          <div>
            <div style={{ fontSize: 11, color: muted, textTransform: "uppercase", letterSpacing: 0.8 }}>
              {liveType === "sleep" ? "Bebê está acordado" : "Bebê está dormindo"}
            </div>
            <div style={{ fontSize: 18, fontWeight: "bold", color: liveType === "sleep" ? blue : orange }}>
              {liveLabel}
            </div>
            {liveType === "wake" && liveBottle && (
              <div style={{ fontSize: 11, color: "#c1440e", marginTop: 2 }}>🍼 Preparar mamadeira às {liveBottle}</div>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: "flex", background: "#fff", borderBottom: "1px solid #f0e8df", padding: "10px 8px", justifyContent: "space-around" }}>
        {[
          { label: "Sono médio", value: fmt(avgSleep), icon: "💤" },
          { label: "Acordado médio", value: fmt(avgAwake), icon: "👀" },
          { label: "Sono noturno", value: fmt(avgNight), icon: "🌛" },
        ].map(stat => (
          <div key={stat.label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16 }}>{stat.icon}</div>
            <div style={{ fontSize: 15, fontWeight: "bold", color: orange }}>{stat.value}</div>
            <div style={{ fontSize: 10, color: muted }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: "#fff", borderBottom: "2px solid #f0e8df" }}>
        {[["previsoes", "Previsões"], ["historico", "Histórico"], ["adicionar", "Registrar"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ flex: 1, padding: "11px 8px", border: "none", background: "none", fontFamily: "Georgia, serif", fontSize: 13, fontWeight: tab === key ? "bold" : "normal", color: tab === key ? orange : muted, borderBottom: tab === key ? `2px solid ${orange}` : "2px solid transparent", cursor: "pointer" }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: "14px", maxWidth: 480, margin: "0 auto" }}>

        {/* PREVISÕES */}
        {tab === "previsoes" && (
          <div>
            <p style={{ fontSize: 11, color: muted, margin: "0 0 14px", textAlign: "center" }}>Próximos ciclos previstos</p>
            {predictions.map((p, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 14, padding: "12px 14px", marginBottom: 9, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", borderLeft: `4px solid ${p.type === "wake" ? "#f4a261" : "#6b9fd4"}`, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 26 }}>{p.type === "wake" ? "☀️" : "🌙"}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: "bold", fontSize: 19, color: p.type === "wake" ? orange : blue }}>{p.time}</div>
                  <div style={{ fontSize: 11, color: "#7a6655", marginTop: 1 }}>{p.label}</div>
                  {p.bottle && (
                    <div style={{ marginTop: 5, display: "inline-flex", alignItems: "center", gap: 4, background: "#fff8f0", borderRadius: 20, padding: "2px 9px", fontSize: 11, color: "#c1440e", fontWeight: "bold", border: "1px solid #ffd5b8" }}>
                      🍼 Preparar às {p.alert}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* HISTÓRICO */}
        {tab === "historico" && (
          <div>
            {dateGroups.map(date => (
              <div key={date} style={{ marginBottom: 22 }}>
                <h3 style={{ fontSize: 11, color: muted, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 1 }}>{formatDate(date)}</h3>
                {byDate[date].map(s => {
                  const gi = sorted.findIndex(x => x.id === s.id);
                  const nextS = sorted[gi + 1];
                  const trueSleep = (s.slept && nextS) ? diffMins(s.slept, nextS.woke) : null;
                  const awakeWin = s.slept ? diffMins(s.woke, s.slept) : null;
                  return (
                    <div key={s.id} style={{ background: "#fff", borderRadius: 12, padding: "11px 13px", marginBottom: 7, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                      {editId === s.id ? (
                        <div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                            <div style={{ gridColumn: "1/-1" }}>
                              <label style={{ fontSize: 11, color: muted, display: "block", marginBottom: 3 }}>Data</label>
                              <input type="date" value={editBuf.date} onChange={e => setEditBuf({ ...editBuf, date: e.target.value })} style={{ ...iStyle, fontSize: 13 }} />
                            </div>
                            <div>
                              <label style={{ fontSize: 11, color: orange, display: "block", marginBottom: 3 }}>☀️ Acordou</label>
                              <input type="time" value={editBuf.woke} onChange={e => setEditBuf({ ...editBuf, woke: e.target.value })} style={{ ...iStyle, fontSize: 13 }} />
                            </div>
                            <div>
                              <label style={{ fontSize: 11, color: blue, display: "block", marginBottom: 3 }}>🌙 Dormiu</label>
                              <input type="time" value={editBuf.slept} onChange={e => setEditBuf({ ...editBuf, slept: e.target.value })} style={{ ...iStyle, fontSize: 13 }} />
                            </div>
                          </div>
                          {editBuf.slept && (
                            <button onClick={() => setEditBuf({ ...editBuf, slept: "" })} style={{ ...btnBase, width: "100%", marginBottom: 8, background: "#fff0f7", color: "#b04080", border: "1px solid #f0b0d0", fontSize: 12 }}>
                              🗑 Limpar "dormiu" (deixar em aberto)
                            </button>
                          )}
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={saveEdit} style={{ ...btnBase, flex: 1, background: orange, color: "#fff", fontWeight: "bold" }}>✓ Salvar</button>
                            <button onClick={() => setEditId(null)} style={{ ...btnBase, flex: 1, background: "#f0e8df", color: "#7a6655" }}>Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                          <div style={{ fontSize: 20 }}>{isNight(s.woke) ? "🌙" : "☀️"}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: "bold" }}>
                              <span style={{ color: orange }}>▲ {s.woke}</span>
                              {s.slept ? <span style={{ color: blue }}> → ▼ {s.slept}</span> : <span style={{ color: "#bbb", fontSize: 12 }}> → em aberto...</span>}
                            </div>
                            <div style={{ fontSize: 11, color: muted, marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
                              {awakeWin !== null && <span>👀 {fmt(awakeWin)} acordado</span>}
                              {trueSleep !== null && trueSleep < 600 && <span>💤 {fmt(trueSleep)} dormindo</span>}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 5 }}>
                            <button onClick={() => startEdit(s)} style={{ padding: "5px 9px", background: "#fff4ee", border: `1px solid #f4a261`, borderRadius: 7, fontSize: 12, cursor: "pointer", color: orange }}>✏️</button>
                            <button onClick={() => removeSession(s.id)} style={{ padding: "5px 9px", background: "#fff0f0", border: "1px solid #ffb0b0", borderRadius: 7, fontSize: 12, cursor: "pointer", color: "#cc4444" }}>🗑️</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* ADICIONAR */}
        {tab === "adicionar" && (
          <div>
            <div style={{ background: "#fff", borderRadius: 14, padding: 18, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <h3 style={{ margin: "0 0 14px", fontSize: 15, color: "#2d1f0e" }}>Novo registro</h3>
              <label style={{ fontSize: 12, color: muted, display: "block", marginBottom: 4 }}>Data</label>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={iStyle} />
              <label style={{ fontSize: 12, color: muted, display: "block", marginBottom: 4, marginTop: 12 }}>☀️ Acordou às</label>
              <input type="time" value={newWoke} onChange={e => setNewWoke(e.target.value)} style={iStyle} />
              <label style={{ fontSize: 12, color: muted, display: "block", marginBottom: 4, marginTop: 12 }}>
                🌙 Dormiu às <span style={{ color: "#ccc", fontSize: 11 }}>(deixe vazio se ainda acordado)</span>
              </label>
              <input type="time" value={newSlept} onChange={e => setNewSlept(e.target.value)} style={iStyle} />
              <button onClick={addSession} style={{ marginTop: 16, width: "100%", padding: "13px", background: `linear-gradient(135deg, #f4a261, ${orange})`, color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: "bold", cursor: "pointer", fontFamily: "Georgia, serif", boxShadow: "0 4px 12px rgba(231,111,81,0.3)" }}>
                Salvar registro
              </button>
            </div>
            <div style={{ marginTop: 12, background: "#fff8f0", borderRadius: 12, padding: "12px 14px", fontSize: 12, color: "#7a6655", lineHeight: 1.8 }}>
              <strong style={{ color: orange }}>💡 Fluxo sugerido:</strong><br />
              1. Bebê acordou → registre só o "Acordou"<br />
              2. App mostra previsão de quando vai dormir<br />
              3. Bebê dormiu → edite e preencha "Dormiu"<br />
              4. App mostra previsão de quando vai acordar<br />
              5. Repita! Sua esposa vê tudo em tempo real ☁️
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
