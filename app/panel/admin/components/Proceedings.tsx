"use client";

// Tarjetas de la Mesa Admin: actas de partidos finalizados (masc/fem) y
// tarjeta del historial de auditoría. Extraídas de page.tsx sin cambios
// de estilo. Los tipos compartidos del acta viven aquí.

export type MatchEvent = {
  id: number;
  type: "GOL" | "AMARILLA" | "ROJA";
  minute: number;
  team: "A" | "B";
  player: string;
};

export type FinishedMatchActa = {
  id: number;
  fieldNumber: number;
  gender: "masculino" | "femenino";
  phase: string;
  teamA: string;
  logoA?: string;
  teamB: string;
  logoB?: string;
  scoreA: number;
  scoreB: number;
  supervisorName: string;
  finishedAt: string;
  events: MatchEvent[];
  incidentsNotes?: string;
  isLocked: boolean;
  group?: string;
  estado?: "PROGRAMADO" | "EN_ESPERA" | "EN_JUEGO" | "FINALIZADO";
  // Para editar partidos de fase final "por definir" desde el admin
  category?: "MASCULINO" | "FEMENINO";
  teamAId?: number | null;
  teamBId?: number | null;
};

// Badge de estado del partido (color según en qué punto va)
function EstadoBadge({ estado }: { estado?: FinishedMatchActa["estado"] }) {
  const cfg =
    estado === "EN_JUEGO" || estado === "EN_ESPERA"
      ? { txt: "En juego", bg: "rgba(220, 38, 38, 0.1)", color: "#dc2626" }
      : estado === "PROGRAMADO"
        ? { txt: "Por jugar", bg: "rgba(35, 60, 151, 0.08)", color: "var(--primary)" }
        : { txt: "Finalizado", bg: "rgba(22, 163, 74, 0.1)", color: "var(--success)" };
  return (
    <span className="px-3 py-1 rounded-full text-[10px] md:text-xs font-medium" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
      {cfg.txt}
    </span>
  );
}

export type AuditLog = {
  id: number;
  adminName: string;
  adminEmail: string;
  timestamp: string;
  action: string;
  details: string;
  matchId: number;
  gender: "masculino" | "femenino";
};

// ── Tarjeta del Historial de Auditoría ──────────────────────

export function AuditLogCard({ log }: { log: AuditLog }) {
  const isGol = log.action.toLowerCase().includes("gol");

  let eventosAntes: MatchEvent[] = [];
  let eventosDespues: MatchEvent[] = [];

  try {
    const datos = JSON.parse(log.details);
    eventosAntes = datos.antes || [];
    eventosDespues = datos.despues || [];
  } catch {
    eventosAntes = [];
    eventosDespues = [];
  }

  const renderListaEventos = (eventos: MatchEvent[]) => {
    if (eventos.length === 0) {
      return <span className="text-[11px] text-gray-400 italic font-light">Sin eventos</span>;
    }
    return (
      <div className="space-y-1 w-full text-left px-1">
        {eventos.map((ev, idx) => (
          <div key={`${ev.id}-${idx}`} className="text-[11px] font-light text-gray-700 flex items-center gap-1 bg-white p-1 rounded-lg border border-black/5 truncate">
            <span className="shrink-0">
              {ev.type === "GOL" ? "⚽" : ev.type === "AMARILLA" ? "🟨" : "🟥"}
            </span>
            <span className="truncate">
              {ev.player} <span className="text-gray-400">({ev.minute}&apos;)</span>
            </span>
            <span className="text-[9px] font-medium text-gray-400 bg-gray-100 px-1 rounded-sm shrink-0 ml-auto">
              {ev.team}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="w-full rounded-2xl p-4 shadow-[0_2px_12px_rgba(16,32,76,0.02)] transition-all font-poppins text-left bg-white border border-gray-100">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base leading-none">
          {isGol ? "⚽" : "🟨"}
        </span>
        <span className="text-xs font-bold text-[#10204c]/80 tracking-wide">
          {isGol ? "Ajuste de goles" : "Ajuste de tarjetas"}
        </span>
      </div>

      <div className="grid grid-cols-7 items-start bg-gray-50/60 p-3 rounded-xl border border-gray-100 gap-1 min-h-[80px]">
        <div className="col-span-3 flex flex-col items-center justify-start w-full">
          <span className="text-[10px] text-gray-400 font-medium mb-2 block text-center">Registro inicial</span>
          {renderListaEventos(eventosAntes)}
        </div>

        <div className="col-span-1 flex items-center justify-center text-gray-400 h-full self-center">
          <span className="material-symbols-outlined !text-[18px] md:!text-[20px]">
            arrow_forward
          </span>
        </div>

        <div className="col-span-3 flex flex-col items-center justify-start w-full">
          <span className="text-[10px] text-gray-400 font-medium mb-2 block text-center">Resultado final</span>
          {renderListaEventos(eventosDespues)}
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 mt-3 border-t border-gray-50 text-[10px] md:text-xs text-gray-400">
        <span>
          Por: <strong className="font-semibold text-gray-600">{log.adminName}</strong>
        </span>
        <span className="opacity-75">{log.timestamp} hs</span>
      </div>
    </div>
  );
}

// ── Actas de Partido con Incidentes Integrados ──────────────

export function FinishedMatchCardMasculino({ acta, onEdit }: { acta: FinishedMatchActa; onEdit: (acta: FinishedMatchActa) => void }) {
  return (
    <div
      data-theme="masculino"
      className="w-full rounded-3xl p-4 md:p-6 shadow-[0_4px_20px_rgba(16,32,76,0.02)] transition-all font-poppins"
      style={{ backgroundColor: "var(--card-strong)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between border-b border-gray-50 pb-2 md:pb-3 mb-3 md:mb-4">
        <span className="text-xs md:text-sm font-light tracking-widest" style={{ color: "var(--foreground)", opacity: 0.5 }}>
          Cancha {acta.fieldNumber} • <span className="font-normal">{acta.phase}</span> {acta.group && `• ${acta.group}`}
        </span>
        <EstadoBadge estado={acta.estado} />
      </div>

      <div className="grid grid-cols-7 items-center justify-between my-2">
        <div className="col-span-3 flex flex-col items-center text-center gap-2">
          <div className="w-10 h-10 md:w-16 md:h-16 rounded-full flex items-center justify-center text-xs md:text-base font-normal border border-gray-100 shadow-sm transition-all" style={{ backgroundColor: "rgba(16, 32, 76, 0.02)", color: "var(--primary)" }}>
            {acta.logoA ? <img src={acta.logoA} alt={acta.teamA} className="w-full h-full object-cover rounded-full" /> : acta.teamA.substring(0, 2).toUpperCase()}
          </div>
          <span className="text-xs md:text-sm font-medium truncate max-w-full px-1" style={{ color: "var(--foreground)" }}>
            {acta.teamA}
          </span>
        </div>

        <div className="col-span-1 flex items-center justify-center">
          <div className="font-secondary-modak flex items-baseline justify-center gap-1 tabular-nums transition-all" style={{ fontSize: 'clamp(2.1rem, 4vw, 3.5rem)', lineHeight: 1 }}>
            <span style={{ color: "var(--primary)" }}>{acta.scoreA}</span>
            <span className="text-gray-300 font-light text-xl md:text-3xl -mb-0.5">:</span>
            <span style={{ color: "var(--primary)" }}>{acta.scoreB}</span>
          </div>
        </div>

        <div className="col-span-3 flex flex-col items-center text-center gap-2">
          <div className="w-10 h-10 md:w-16 md:h-16 rounded-full flex items-center justify-center text-xs md:text-base font-normal border border-gray-100 shadow-sm transition-all" style={{ backgroundColor: "rgba(16, 32, 76, 0.02)", color: "var(--primary)" }}>
            {acta.logoB ? <img src={acta.logoB} alt={acta.teamB} className="w-full h-full object-cover rounded-full" /> : acta.teamB.substring(0, 2).toUpperCase()}
          </div>
          <span className="text-xs md:text-sm font-medium truncate max-w-full px-1" style={{ color: "var(--foreground)" }}>
            {acta.teamB}
          </span>
        </div>
      </div>

      {acta.events.length > 0 && (
        <div className="border-t border-gray-50 mt-4 pt-3 text-[11px] md:text-xs space-y-2" style={{ color: "var(--foreground)", opacity: 0.7 }}>
          {acta.events.map((ev) => (
            <div key={ev.id} className="grid grid-cols-2 gap-4">
              <div className="text-left pl-1 min-h-[16px] font-light">
                {ev.team === "A" && (
                  <span>
                    {ev.type === "GOL" ? "⚽" : ev.type === "AMARILLA" ? "🟨" : "🟥"} {ev.player} ({ev.minute}&apos;)
                  </span>
                )}
              </div>
              <div className="text-right pr-1 min-h-[16px] font-light">
                {ev.team === "B" && (
                  <span>
                    {ev.player} ({ev.minute}&apos;) {ev.type === "GOL" ? "⚽" : ev.type === "AMARILLA" ? "🟨" : "🟥"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {acta.incidentsNotes && (
        <div className="mt-4 p-3 rounded-2xl bg-amber-50/60 border border-amber-100 text-left">
          <span className="text-[12px] font-medium tracking-wider text-amber-800 flex items-center gap-1">
            <span className="material-symbols-outlined !text-[14px]">warning</span> Incidentes:
          </span>
          <p className="text-xs font-light text-amber-950 mt-1 italic">&quot;{acta.incidentsNotes}&quot;</p>
        </div>
      )}

      <div className="flex items-center justify-between pt-4 mt-4 border-t border-gray-100">
        <div className="flex flex-col text-gray-400 justify-center text-left">
          <span className="text-[10px] md:text-xs leading-tight">
            Enviado por: <strong className="font-semibold" style={{ color: "var(--foreground)" }}>{acta.supervisorName}</strong>
          </span>
          <span className="text-[9px] md:text-[11px] opacity-75">{acta.finishedAt} hs</span>
        </div>
        <button
          type="button"
          onClick={() => onEdit(acta)}
          className="bg-[#233c97] hover:bg-[#1a2e75] text-white font-bold rounded-full shadow-md hover:shadow-lg transition-all duration-200 active:scale-95 whitespace-nowrap flex items-center justify-center h-8 min-[375px]:h-9 md:h-10 text-[9px] min-[375px]:text-[10px] min-[425px]:text-xs md:text-xs lg:text-xs px-4 min-[375px]:px-5 md:px-6 py-2.5"
        >
          Editar
        </button>
      </div>
    </div>
  );
}

export function FinishedMatchCardFemenino({ acta, onEdit }: { acta: FinishedMatchActa; onEdit: (acta: FinishedMatchActa) => void }) {
  return (
    <div
      data-theme="femenino"
      className="w-full rounded-3xl p-4 md:p-6 shadow-[0_4px_20px_rgba(16,32,76,0.02)] transition-all font-poppins"
      style={{ backgroundColor: "var(--card-strong)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between border-b border-gray-50 pb-2 md:pb-3 mb-3 md:mb-4">
        <span className="text-xs md:text-sm font-light tracking-widest" style={{ color: "var(--foreground)", opacity: 0.5 }}>
          Cancha {acta.fieldNumber} • <span className="font-normal">{acta.phase}</span> {acta.group && `• ${acta.group}`}
        </span>
        <EstadoBadge estado={acta.estado} />
      </div>

      <div className="grid grid-cols-7 items-center justify-between my-2">
        <div className="col-span-3 flex flex-col items-center text-center gap-2">
          <div className="w-10 h-10 md:w-16 md:h-16 rounded-full flex items-center justify-center text-xs md:text-base font-normal border border-gray-100 shadow-sm transition-all" style={{ backgroundColor: "rgba(16, 32, 76, 0.02)", color: "var(--primary)" }}>
            {acta.logoA ? <img src={acta.logoA} alt={acta.teamA} className="w-full h-full object-cover rounded-full" /> : acta.teamA.substring(0, 2).toUpperCase()}
          </div>
          <span className="text-xs md:text-sm font-medium truncate max-w-full px-1" style={{ color: "var(--foreground)" }}>
            {acta.teamA}
          </span>
        </div>

        <div className="col-span-1 flex items-center justify-center">
          <div className="font-secondary-modak flex items-baseline justify-center gap-1 tabular-nums transition-all" style={{ fontSize: 'clamp(2.1rem, 4vw, 3.5rem)', lineHeight: 1 }}>
            <span style={{ color: "var(--primary)" }}>{acta.scoreA}</span>
            <span className="text-gray-300 font-light text-xl md:text-3xl -mb-0.5">:</span>
            <span style={{ color: "var(--primary)" }}>{acta.scoreB}</span>
          </div>
        </div>

        <div className="col-span-3 flex flex-col items-center text-center gap-2">
          <div className="w-10 h-10 md:w-16 md:h-16 rounded-full flex items-center justify-center text-xs md:text-base font-normal border border-gray-100 shadow-sm transition-all" style={{ backgroundColor: "rgba(16, 32, 76, 0.02)", color: "var(--primary)" }}>
            {acta.logoB ? <img src={acta.logoB} alt={acta.teamB} className="w-full h-full object-cover rounded-full" /> : acta.teamB.substring(0, 2).toUpperCase()}
          </div>
          <span className="text-xs md:text-sm font-medium truncate max-w-full px-1" style={{ color: "var(--foreground)" }}>
            {acta.teamB}
          </span>
        </div>
      </div>

      {acta.events.length > 0 && (
        <div className="border-t border-gray-50 mt-4 pt-3 text-[11px] md:text-xs space-y-2" style={{ color: "var(--foreground)", opacity: 0.7 }}>
          {acta.events.map((ev) => (
            <div key={ev.id} className="grid grid-cols-2 gap-4">
              <div className="text-left pl-1 min-h-[16px] font-light">
                {ev.team === "A" && (
                  <span>
                    {ev.type === "GOL" ? "⚽" : ev.type === "AMARILLA" ? "🟨" : "🟥"} {ev.player} ({ev.minute}&apos;)
                  </span>
                )}
              </div>
              <div className="text-right pr-1 min-h-[16px] font-light">
                {ev.team === "B" && (
                  <span>
                    {ev.player} ({ev.minute}&apos;) {ev.type === "GOL" ? "⚽" : ev.type === "AMARILLA" ? "🟨" : "🟥"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {acta.incidentsNotes && (
        <div className="mt-4 p-3 rounded-2xl bg-amber-50/60 border border-amber-100 text-left">
          <span className="text-[12px] font-medium tracking-wider text-amber-800 flex items-center gap-1">
            <span className="material-symbols-outlined !text-[14px]">warning</span> Incidentes:
          </span>
          <p className="text-xs font-light text-amber-950 mt-1 italic">&quot;{acta.incidentsNotes}&quot;</p>
        </div>
      )}

      <div className="flex items-center justify-between pt-4 mt-4 border-t border-gray-100">
        <div className="flex flex-col text-gray-400 justify-center text-left">
          <span className="text-[10px] md:text-xs leading-tight">
            Enviado por: <strong className="font-semibold" style={{ color: "var(--foreground)" }}>{acta.supervisorName}</strong>
          </span>
          <span className="text-[9px] md:text-[11px] opacity-75">{acta.finishedAt} hs</span>
        </div>
        <button
          type="button"
          onClick={() => onEdit(acta)}
          className="bg-[#233c97] hover:bg-[#1a2e75] text-white font-bold rounded-full shadow-md hover:shadow-lg transition-all duration-200 active:scale-95 whitespace-nowrap flex items-center justify-center h-8 min-[375px]:h-9 md:h-10 text-[9px] min-[375px]:text-[10px] min-[425px]:text-xs md:text-xs lg:text-xs px-4 min-[375px]:px-5 md:px-6 py-2.5"
        >
          Editar
        </button>
      </div>
    </div>
  );
}
