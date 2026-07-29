"use client";

import { useState } from "react";
import { PAST_EDITIONS, type PastEdition } from "@/lib/editions";
import FixtureEliminatoria from "./FixtureEliminatoria";

// "Ediciones pasadas": conserva la app para años futuros. Por decisión del
// organizador, cada edición archivada muestra ÚNICAMENTE el fixture (la llave
// de semifinales → gran final, con el estilo de Simón). Sin tablas, sin
// equipos, sin números y sin partidos. Las casillas quedan "sin registro".

// Llave vacía (sin registro): mismas casillas de la fase final pero sin
// equipos ni marcador. Se marca estado "FIN" y la fecha real de la edición
// para que se lea como algo ya jugado, no como algo por venir.
function llaveSinRegistro(fecha: string) {
  const casilla = {
    fecha,
    estado: "FIN" as const,
    equipoLocal: null,
    flagLocal: null,
    equipoVisita: null,
    flagVisita: null,
  };
  return { semifinales: [casilla, casilla], final: casilla };
}

export default function EdicionesPasadas() {
  const [open, setOpen] = useState(false);

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
                  <p className="text-[11px] text-[#10204c]/50">El fixture de cada edición de la TMT CUP</p>
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
                <EditionCard key={ed.year} ed={ed} />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function EditionCard({ ed }: { ed: PastEdition }) {
  const bracket = llaveSinRegistro(ed.fecha);

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

      {/* Solo el fixture: masculino y femenino */}
      <div className="p-4 sm:p-5 space-y-6">
        <CategoriaFixture titulo="Masculino" genero="masculino" icon="man" color="#233c97" bracket={bracket} />
        <CategoriaFixture titulo="Femenino" genero="femenino" icon="woman" color="#7c3aed" bracket={bracket} />
      </div>
    </div>
  );
}

function CategoriaFixture({
  titulo,
  genero,
  icon,
  color,
  bracket,
}: {
  titulo: string;
  genero: "masculino" | "femenino";
  icon: string;
  color: string;
  bracket: ReturnType<typeof llaveSinRegistro>;
}) {
  return (
    <div data-theme={genero} className="space-y-2.5">
      <div className="flex items-center justify-center gap-1.5">
        <span className="material-symbols-outlined !text-[20px]" style={{ color }}>{icon}</span>
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color }}>{titulo}</span>
      </div>
      <FixtureEliminatoria genero={genero} bracket={bracket} />
    </div>
  );
}
