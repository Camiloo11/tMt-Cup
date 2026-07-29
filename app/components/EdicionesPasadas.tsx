"use client";

import { useEffect, useState } from "react";
import { PAST_EDITIONS, type PastEdition } from "@/lib/editions";
import { teamFlagSrc } from "@/lib/flags";

// ── Snapshot archivado (viene de /api/editions, tabla `editions`) ──
type SnapTeam = { id: number; name: string; category: string; group: string | null; flag: string | null };
type SnapMatch = {
  id: number; phase: string; category: string | null; field: number; scheduledAt: string; status: string;
  teamA: string | null; teamAId: number | null; teamB: string | null; teamBId: number | null;
  scoreA: number | null; scoreB: number | null;
};
type SnapEvent = { matchId: number; teamId: number; type: "GOL" | "AMARILLA" | "ROJA"; minute: number | null; player: string | null };
type Snapshot = { teams: SnapTeam[]; matches: SnapMatch[]; events: SnapEvent[] };

const PHASE_LABEL: Record<string, string> = {
  GRUPOS: "Fase de grupos", CUARTOS: "Cuartos", SEMIFINAL: "Semifinal", FINAL: "Final",
};

// Tabla de posiciones de un grupo (pts → dif. de gol → goles a favor)
function standingsForGroup(teams: SnapTeam[], matches: SnapMatch[]) {
  const rows = teams.map((t) => {
    let pj = 0, pg = 0, pe = 0, pp = 0, gf = 0, gc = 0;
    for (const m of matches) {
      if (m.phase !== "GRUPOS" || m.status !== "FINALIZADO") continue;
      let f: number | null = null, c: number | null = null;
      if (m.teamAId === t.id) { f = m.scoreA; c = m.scoreB; }
      else if (m.teamBId === t.id) { f = m.scoreB; c = m.scoreA; }
      if (f === null || c === null) continue;
      pj++; gf += f; gc += c;
      if (f > c) pg++; else if (f === c) pe++; else pp++;
    }
    return { id: t.id, name: t.name, flag: t.flag, pj, pg, pe, pp, gf, gc, dg: gf - gc, pts: pg * 3 + pe };
  });
  rows.sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf);
  return rows;
}

export default function EdicionesPasadas() {
  const [open, setOpen] = useState(false);
  const [snaps, setSnaps] = useState<Record<number, Snapshot>>({});

  useEffect(() => {
    if (!open) return;
    fetch("/api/editions")
      .then((r) => r.json())
      .then((rows: Array<{ year: number; data: Snapshot }>) => {
        if (!Array.isArray(rows)) return;
        const map: Record<number, Snapshot> = {};
        for (const r of rows) if (r?.data) map[r.year] = r.data;
        setSnaps(map);
      })
      .catch(() => { });
  }, [open]);

  const flag = (name?: string | null) => (name ? teamFlagSrc(name) : null);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-50 flex items-center gap-2 px-4 h-11 rounded-full bg-white/70 backdrop-blur-md border border-white/40 shadow-[0_10px_25px_rgba(16,32,76,0.12)] text-[#10204c] hover:text-[#233c97] transition-all active:scale-95 font-poppins"
        aria-label="Ver ediciones pasadas"
      >
        <span className="material-symbols-outlined !text-[22px] text-[#c99a2e]">emoji_events</span>
        <span className="hidden min-[375px]:inline text-xs font-semibold whitespace-nowrap">Ediciones pasadas</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[120] bg-[#10204c]/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 font-poppins"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-2xl max-h-[88vh] overflow-y-auto border border-slate-200 shadow-[0_20px_50px_rgba(16,32,76,0.25)]"
            onClick={(e) => e.stopPropagation()}
            style={{ scrollbarWidth: "none" }}
          >
            <div className="sticky top-0 bg-white/90 backdrop-blur-md px-5 sm:px-7 py-4 border-b border-slate-100 flex items-center justify-between z-10">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined !text-[26px] text-[#c99a2e]">emoji_events</span>
                <div>
                  <h2 className="text-lg sm:text-xl font-semibold text-[#233c97] leading-tight">Ediciones pasadas</h2>
                  <p className="text-[11px] text-[#10204c]/50">Palmarés e historial de la TMT CUP</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors shrink-0"
                aria-label="Cerrar"
              >
                <span className="material-symbols-outlined !text-[20px]">close</span>
              </button>
            </div>

            <div className="p-5 sm:p-7 space-y-6">
              {PAST_EDITIONS.map((ed) => (
                <EditionCard key={ed.year} ed={ed} snap={snaps[ed.year]} flag={flag} />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function EditionCard({
  ed, snap, flag,
}: {
  ed: PastEdition;
  snap?: Snapshot;
  flag: (name?: string | null) => string | null;
}) {
  // Agrupar los partidos jugados por categoría (solo con marcador)
  const played = (snap?.matches ?? []).filter((m) => m.status === "FINALIZADO" && m.scoreA != null && m.scoreB != null);
  const eventsByMatch = new Map<number, SnapEvent[]>();
  for (const e of snap?.events ?? []) {
    eventsByMatch.set(e.matchId, [...(eventsByMatch.get(e.matchId) ?? []), e]);
  }

  // Grupos (para las tablas de posiciones)
  const grupos = new Map<string, { category: string; teams: SnapTeam[] }>();
  for (const t of snap?.teams ?? []) {
    const key = `${t.category}·${t.group ?? "?"}`;
    if (!grupos.has(key)) grupos.set(key, { category: t.category, teams: [] });
    grupos.get(key)!.teams.push(t);
  }
  const gruposMasc = [...grupos.entries()].filter(([, g]) => g.category === "MASCULINO");
  const gruposFem = [...grupos.entries()].filter(([, g]) => g.category === "FEMENINO");

  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-[0_4px_20px_rgba(16,32,76,0.04)]">
      {/* Franja del año */}
      <div className="px-5 py-3.5 bg-gradient-to-r from-[#233c97] to-[#10204c] text-white">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xl sm:text-2xl font-extrabold tracking-tight">TMT CUP {ed.year}</span>
          <span className="text-[11px] text-white/70 text-right">{ed.fecha}</span>
        </div>
        {ed.sede && <p className="text-[11px] text-white/60 mt-0.5">{ed.sede}</p>}
      </div>

      {/* Campeones */}
      <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ed.champions.map((c) => {
          const isFem = c.category === "Femenino";
          return (
            <div
              key={c.category}
              className="rounded-2xl p-4 flex items-center gap-3 border"
              style={{
                backgroundColor: isFem ? "rgba(124,58,237,0.05)" : "rgba(35,60,151,0.05)",
                borderColor: isFem ? "rgba(124,58,237,0.15)" : "rgba(35,60,151,0.15)",
              }}
            >
              <div className="w-12 h-12 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center overflow-hidden shrink-0">
                {flag(c.team) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={flag(c.team)!} alt={c.team} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-black text-[#10204c]/50">{c.team[0]}</span>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined !text-[16px] text-[#c99a2e]">emoji_events</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: isFem ? "#7c3aed" : "#233c97" }}>
                    Campeón {c.category}
                  </span>
                </div>
                <p className="text-lg font-extrabold text-[#10204c] truncate">{c.team}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tablas de posiciones (del snapshot) */}
      {(gruposMasc.length > 0 || gruposFem.length > 0) && (
        <div className="px-4 sm:px-5 pb-2 space-y-3">
          <SectionTitle icon="table_chart" text="Tablas de posiciones" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[...gruposMasc, ...gruposFem].map(([key, g]) => {
              const [, gname] = key.split("·");
              const isFem = g.category === "FEMENINO";
              const rows = standingsForGroup(g.teams, snap!.matches);
              return (
                <div key={key} className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-3 py-1.5 text-[11px] font-bold" style={{ color: isFem ? "#7c3aed" : "#233c97", backgroundColor: isFem ? "rgba(124,58,237,0.05)" : "rgba(35,60,151,0.05)" }}>
                    Grupo {gname} · {isFem ? "Femenino" : "Masculino"}
                  </div>
                  <div className="divide-y divide-slate-100">
                    {rows.map((r, i) => (
                      <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
                        <span className="w-3 text-slate-400 font-medium">{i + 1}</span>
                        {flag(r.name) && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={flag(r.name)!} alt="" className="h-[0.85em] w-auto rounded-[2px]" />
                        )}
                        <span className="flex-1 truncate font-medium text-[#10204c]">{r.name}</span>
                        <span className="w-6 text-center text-slate-400">{r.pj}</span>
                        <span className="w-7 text-center" style={{ color: r.dg > 0 ? "#16a34a" : r.dg < 0 ? "#dc2626" : "#64748b" }}>{r.dg > 0 ? `+${r.dg}` : r.dg}</span>
                        <span className="w-5 text-center font-bold text-[#233c97]">{r.pts}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Partidos jugados con goles */}
      {played.length > 0 && (
        <div className="px-4 sm:px-5 pb-2 space-y-2">
          <SectionTitle icon="sports_soccer" text="Partidos y goles" />
          <div className="space-y-2">
            {played.map((m) => {
              const evs = (eventsByMatch.get(m.id) ?? []).filter((e) => e.type === "GOL");
              const golesA = evs.filter((e) => e.teamId === m.teamAId);
              const golesB = evs.filter((e) => e.teamId === m.teamBId);
              return (
                <div key={m.id} className="rounded-xl border border-slate-200 px-3 py-2">
                  <div className="flex items-center justify-center gap-2 text-xs">
                    <span className="flex-1 flex items-center justify-end gap-1.5 font-semibold text-[#10204c] truncate">
                      <span className="truncate">{m.teamA}</span>
                      {flag(m.teamA) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={flag(m.teamA)!} alt="" className="h-4 w-auto rounded-[2px] shrink-0" />
                      )}
                    </span>
                    <span className="font-black text-[#233c97] tabular-nums px-2">{m.scoreA} - {m.scoreB}</span>
                    <span className="flex-1 flex items-center gap-1.5 font-semibold text-[#10204c] truncate">
                      {flag(m.teamB) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={flag(m.teamB)!} alt="" className="h-4 w-auto rounded-[2px] shrink-0" />
                      )}
                      <span className="truncate">{m.teamB}</span>
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3 mt-1 text-[10px] text-[#10204c]/60">
                    <div className="flex-1 text-right space-y-0.5">
                      {golesA.map((e, i) => <div key={i} className="truncate">⚽ {e.player ?? "Gol"} {e.minute ? `${e.minute}'` : ""}</div>)}
                    </div>
                    <span className="text-[9px] text-slate-300 shrink-0 pt-0.5">{PHASE_LABEL[m.phase] ?? m.phase}</span>
                    <div className="flex-1 space-y-0.5">
                      {golesB.map((e, i) => <div key={i} className="truncate">⚽ {e.player ?? "Gol"} {e.minute ? `${e.minute}'` : ""}</div>)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Equipos participantes + nota */}
      <div className="px-4 sm:px-5 pt-2 pb-4 sm:pb-5 space-y-3">
        <TeamChips titulo="Torneo Masculino" teams={ed.teamsMasculino} color="#233c97" flag={flag} />
        <TeamChips titulo="Torneo Femenino" teams={ed.teamsFemenino} color="#7c3aed" flag={flag} />
        {ed.nota && (
          <p className="text-[11px] text-[#10204c]/50 italic border-t border-slate-100 mt-2 pt-2.5">{ed.nota}</p>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-1.5 pt-1">
      <span className="material-symbols-outlined !text-[16px] text-[#233c97]/70">{icon}</span>
      <span className="text-[11px] font-bold uppercase tracking-wider text-[#10204c]/60">{text}</span>
    </div>
  );
}

function TeamChips({
  titulo, teams, color, flag,
}: {
  titulo: string;
  teams: string[];
  color: string;
  flag: (name?: string | null) => string | null;
}) {
  return (
    <div>
      <span className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color }}>{titulo}</span>
      <div className="flex flex-wrap gap-1.5">
        {teams.map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-[11px] font-medium text-[#10204c]/80">
            {flag(t) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={flag(t)!} alt="" className="h-[0.85em] w-auto rounded-[2px]" />
            )}
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
