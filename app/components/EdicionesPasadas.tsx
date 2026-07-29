"use client";

import { useState } from "react";
import { PAST_EDITIONS } from "@/lib/editions";
import { teamFlagSrc } from "@/lib/flags";

// Botón flotante "Ediciones pasadas" (esquina inferior izquierda) + modal
// con el palmarés histórico. Los datos vienen del archivo estático
// lib/editions.ts, así que se conservan aunque se reinicie la base de datos.
export default function EdicionesPasadas() {
  const [open, setOpen] = useState(false);

  const flag = (name: string) => teamFlagSrc(name);

  return (
    <>
      {/* Botón flotante (abajo-izquierda, espejo del selector de género) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-50 flex items-center gap-2 px-4 h-11 rounded-full bg-white/70 backdrop-blur-md border border-white/40 shadow-[0_10px_25px_rgba(16,32,76,0.12)] text-[#10204c] hover:text-[#233c97] transition-all active:scale-95 font-poppins"
        aria-label="Ver ediciones pasadas"
      >
        <span className="material-symbols-outlined !text-[22px] text-[#c99a2e]">emoji_events</span>
        <span className="hidden min-[375px]:inline text-xs font-semibold whitespace-nowrap">Ediciones pasadas</span>
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-[120] bg-[#10204c]/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 font-poppins"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-2xl max-h-[88vh] overflow-y-auto border border-[color:var(--border,#e5e9f2)] shadow-[0_20px_50px_rgba(16,32,76,0.25)]"
            onClick={(e) => e.stopPropagation()}
            style={{ scrollbarWidth: "none" }}
          >
            {/* Cabecera */}
            <div className="sticky top-0 bg-white/90 backdrop-blur-md px-5 sm:px-7 py-4 border-b border-slate-100 flex items-center justify-between z-10">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined !text-[26px] text-[#c99a2e]">emoji_events</span>
                <div>
                  <h2 className="text-lg sm:text-xl font-semibold text-[#233c97] leading-tight">Ediciones pasadas</h2>
                  <p className="text-[11px] text-[#10204c]/50">Palmarés histórico de la TMT CUP</p>
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

            {/* Ediciones */}
            <div className="p-5 sm:p-7 space-y-6">
              {PAST_EDITIONS.map((ed) => (
                <div key={ed.year} className="rounded-2xl border border-slate-200 overflow-hidden shadow-[0_4px_20px_rgba(16,32,76,0.04)]">
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

                  {/* Equipos participantes */}
                  <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-3">
                    <TeamChips titulo="Torneo Masculino" teams={ed.teamsMasculino} color="#233c97" flag={flag} />
                    <TeamChips titulo="Torneo Femenino" teams={ed.teamsFemenino} color="#7c3aed" flag={flag} />

                    {ed.nota && (
                      <p className="text-[11px] text-[#10204c]/50 italic border-t border-slate-100 mt-2 pt-2.5">
                        {ed.nota}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TeamChips({
  titulo,
  teams,
  color,
  flag,
}: {
  titulo: string;
  teams: string[];
  color: string;
  flag: (name: string) => string | null;
}) {
  return (
    <div>
      <span className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color }}>
        {titulo}
      </span>
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
