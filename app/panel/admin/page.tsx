"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { fetchSessionUser } from "@/lib/session-client";
import { teamFlagSrc } from "@/lib/flags";
import { HistoryPanel } from "./components/HistoryPanel";
import {
  AuditLogCard,
  FinishedMatchCardMasculino,
  FinishedMatchCardFemenino,
  type FinishedMatchActa,
  type AuditLog,
} from "./components/Proceedings";

// ── Tipos ──────────────────────────────────────────────────
type AdminPlayer = {
  id: number;
  name: string;
  document?: string | null;
  team_id: number;
  team: { id: number; name: string } | null;
  attended?: boolean;                // asistencia (check-in del día)
  tmt_status?: string | null;        // ¿Hace parte de tMt?
};

type AdminTeam = {
  id: number;
  name: string;
  category: "MASCULINO" | "FEMENINO";
  debt?: number;                     // deuda de inscripción (COP)
  debt_paid?: boolean;               // deuda marcada como saldada
};

// Respuesta cruda de /api/matches que necesita la mesa admin
type ApiAdminMatch = {
  id: number;
  status: string;
  phase: string;
  category: string | null;
  field_number: number;
  scheduled_at: string;
  finished_at: string | null;
  published_at: string | null;
  score_a: number | null;
  score_b: number | null;
  team_a_id: number | null;
  team_b_id: number | null;
  teamA: { name: string } | null;
  teamB: { name: string } | null;
  events?: Array<{ id: number; type: "GOL" | "AMARILLA" | "ROJA"; minute: number | null; team_id: number; player: { id: number; name: string } | null }>;
  incidents?: Array<{ id: number; type: string; note: string | null }>;
};

// PATCH con reintento de sesión: si el access token expiró (401), lo renueva
// con /api/auth/refresh y reintenta UNA vez. Arregla los 401 de tMt/registro
// cuando la mesa admin lleva un rato abierta.
async function patchAuth(url: string, body: unknown): Promise<Response> {
  const doFetch = () =>
    fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  let res = await doFetch();
  if (res.status === 401) {
    const refreshed = await fetch("/api/auth/refresh", { method: "POST" })
      .then((r) => r.ok)
      .catch(() => false);
    if (refreshed) res = await doFetch();
  }
  return res;
}

// ── Componente Principal ────────────────────────────────────

export default function AdminSupervisorPage() {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);
  const [genderFilter, setGenderFilter] = useState(0);
  const [historyGenderFilter, setHistoryGenderFilter] = useState(0);

  const [searchQuery, setSearchQuery] = useState("");
  const [historySearchQuery, setHistorySearchQuery] = useState("");

  const [historyOpen, setHistoryOpen] = useState(false);

  // ── Registro: búsqueda de jugadores por ID / nombre ──
  const [playerIdQuery, setPlayerIdQuery] = useState("");
  const [playerNameQuery, setPlayerNameQuery] = useState("");

  // ── Registro: dropdown "¿Hace parte de tMt?" abierto (id del jugador) ──
  const [openTmtPlayer, setOpenTmtPlayer] = useState<number | null>(null);

  const navTabs = [{ label: "Dashboard" }, { label: "Registro" }];

  const genderTabs = [
    { label: "Todos", icon: "groups" },
    { label: "Masculino", icon: "man" },
    { label: "Femenino", icon: "woman" }
  ];

  useEffect(() => {
    fetchSessionUser()
      .then((u) => { if (u?.role !== "ADMIN") router.replace("/panel"); })
      .catch(() => router.replace("/panel"));
  }, [router]);

  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [teams, setTeams] = useState<AdminTeam[]>([]);

  useEffect(() => {
    fetch("/api/players").then((r) => r.json()).then((d) => setPlayers(Array.isArray(d) ? d : [])).catch(() => setPlayers([]));
    fetch("/api/teams").then((r) => r.json()).then((d) => setTeams(Array.isArray(d) ? d : [])).catch(() => setTeams([]));
  }, []);

  // ── Actas e historial REALES (Supabase vía /api/matches y /api/audit) ──
  const [actas, setActas] = useState<FinishedMatchActa[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const PHASE_LABEL: Record<string, string> = {
    GRUPOS: "Fase de Grupos", CUARTOS: "Cuartos de Final", SEMIFINAL: "Semifinal", FINAL: "Final",
  };
  const hora = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : "--:--";

  const cargarActasYAuditoria = async () => {
    const [matchesRes, agendaRes, auditRes] = await Promise.all([
      fetch("/api/matches").then((r) => r.json()).catch(() => []),
      fetch("/api/agenda").then((r) => r.json()).catch(() => []),
      fetch("/api/audit").then((r) => r.json()).catch(() => []),
    ]);

    // Supervisor por cancha (agenda del día)
    const supervisorPorCancha = new Map<number, string>();
    for (const a of Array.isArray(agendaRes) ? agendaRes : []) {
      supervisorPorCancha.set(a.field_number, a.supervisor_name);
    }

    // TODOS los partidos (no solo los finalizados): el admin puede registrar
    // el resultado de cualquiera aunque no se haya "jugado" en la vista viva.
    const todos = Array.isArray(matchesRes) ? (matchesRes as ApiAdminMatch[]) : [];

    setActas(todos.map((m) => ({
      id: m.id,
      fieldNumber: m.field_number,
      gender: m.category === "FEMENINO" ? "femenino" : "masculino",
      category: (m.category === "FEMENINO" ? "FEMENINO" : "MASCULINO") as "MASCULINO" | "FEMENINO",
      phase: PHASE_LABEL[m.phase] ?? m.phase,
      estado: m.status as "PROGRAMADO" | "EN_ESPERA" | "EN_JUEGO" | "FINALIZADO",
      teamA: m.teamA?.name ?? "Por definir",
      logoA: teamFlagSrc(m.teamA?.name) ?? undefined,
      teamAId: m.team_a_id ?? null,
      teamB: m.teamB?.name ?? "Por definir",
      logoB: teamFlagSrc(m.teamB?.name) ?? undefined,
      teamBId: m.team_b_id ?? null,
      scoreA: m.score_a ?? 0,
      scoreB: m.score_b ?? 0,
      supervisorName: supervisorPorCancha.get(m.field_number) ?? "Supervisor",
      finishedAt: hora(m.finished_at ?? m.scheduled_at),
      isLocked: !!m.published_at,
      incidentsNotes: (m.incidents ?? []).map((i) => i.note).filter(Boolean).join(" · ") || undefined,
      events: (m.events ?? []).map((ev) => ({
        id: ev.id,
        type: ev.type,
        minute: ev.minute ?? 0,
        team: (ev.team_id === m.team_a_id ? "A" : "B") as "A" | "B",
        player: ev.player?.name ?? "De oficio",
      })),
    })));

    setAuditLogs((Array.isArray(auditRes) ? auditRes : []).map((l: { id: number; admin_name: string; action: string; details: string; match_id: number | null; gender: string | null; created_at: string }) => ({
      id: l.id,
      adminName: l.admin_name,
      adminEmail: "",
      timestamp: hora(l.created_at),
      action: l.action,
      details: l.details,
      matchId: l.match_id ?? 0,
      gender: (l.gender === "femenino" ? "femenino" : "masculino") as "masculino" | "femenino",
    })));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- los setState ocurren tras el fetch (async), no en el render
    cargarActasYAuditoria();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga única al montar
  }, []);

  const [actaEdicion, setActaEdicion] = useState<FinishedMatchActa | null>(null);
  // Jugador cuyo menú de eventos (+/-) está abierto en el roster del modal
  const [openActaPlayer, setOpenActaPlayer] = useState<string | null>(null);
  const [guardandoActa, setGuardandoActa] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);

  const abrirEdicionActa = (acta: FinishedMatchActa) => {
    setErrorGuardado(null);
    setActaEdicion(JSON.parse(JSON.stringify(acta)));
  };

  // Guarda el acta EN EL BACKEND (marcador + eventos + nota de incidentes).
  // El servidor escribe también la fila de auditoría; al volver, se refresca todo.
  const guardarCambiosActa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actaEdicion || guardandoActa) return;
    setGuardandoActa(true);
    setErrorGuardado(null);
    try {
      const res = await patchAuth(`/api/matches/${actaEdicion.id}/acta`, {
          scoreA: actaEdicion.scoreA,
          scoreB: actaEdicion.scoreB,
          // Fase final "por definir": manda los equipos elegidos en el modal
          teamAId: actaEdicion.teamAId ?? undefined,
          teamBId: actaEdicion.teamBId ?? undefined,
          incidentNote: actaEdicion.incidentsNotes ?? "",
          events: actaEdicion.events.map((ev) => ({
            type: ev.type,
            minute: ev.minute,
            side: ev.team,
            player: ev.player,
          })),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorGuardado(data?.error ?? "No se pudo guardar el acta. Intenta de nuevo.");
        return;
      }
      await cargarActasYAuditoria();
      setActaEdicion(null);
      setOpenActaPlayer(null);
    } catch {
      setErrorGuardado("Sin conexión con el servidor. Intenta de nuevo.");
    } finally {
      setGuardandoActa(false);
    }
  };

  const agregarEventoEnEdicion = (tipo: "GOL" | "AMARILLA" | "ROJA", equipo: "A" | "B", minuto: number, jugador: string) => {
    if (!actaEdicion) return;
    let nuevosGolesA = actaEdicion.scoreA;
    let nuevosGolesB = actaEdicion.scoreB;
    if (tipo === "GOL") { if (equipo === "A") nuevosGolesA += 1; else nuevosGolesB += 1; }
    setActaEdicion({ ...actaEdicion, scoreA: nuevosGolesA, scoreB: nuevosGolesB, events: [...actaEdicion.events, { id: Date.now(), type: tipo, minute: minuto || 0, team: equipo, player: jugador || "Jugador" }] });
  };

  const eliminarEventoEnEdicion = (eventoId: number) => {
    if (!actaEdicion) return;
    const ev = actaEdicion.events.find((e) => e.id === eventoId);
    if (!ev) return;
    const restaA = ev.type === "GOL" && ev.team === "A" ? 1 : 0;
    const restaB = ev.type === "GOL" && ev.team === "B" ? 1 : 0;
    setActaEdicion({ ...actaEdicion, scoreA: Math.max(0, actaEdicion.scoreA - restaA), scoreB: Math.max(0, actaEdicion.scoreB - restaB), events: actaEdicion.events.filter((e) => e.id !== eventoId) });
  };

  // ── Roster del acta (como en "partido en vivo"): jugadores reales del
  //    equipo + cualquiera que ya tenga eventos registrados en el acta ──
  const rosterActa = (teamName: string, side: "A" | "B") => {
    const reales = players.filter((p) => p.team?.name === teamName).map((p) => p.name);
    const conEventos = (actaEdicion?.events ?? [])
      .filter((e) => e.team === side)
      .map((e) => e.player);
    return Array.from(new Set([...reales, ...conEventos]));
  };
  const eventosDeJugador = (side: "A" | "B", jugador: string) =>
    (actaEdicion?.events ?? []).filter((e) => e.team === side && e.player === jugador);

  // Agregar / quitar un evento a un jugador concreto desde el roster
  const agregarEventoJugador = (tipo: "GOL" | "AMARILLA" | "ROJA", side: "A" | "B", jugador: string) =>
    agregarEventoEnEdicion(tipo, side, 0, jugador);
  const quitarEventoJugador = (tipo: "GOL" | "AMARILLA" | "ROJA", side: "A" | "B", jugador: string) => {
    if (!actaEdicion) return;
    const delTipo = actaEdicion.events.filter(
      (e) => e.team === side && e.player === jugador && e.type === tipo
    );
    const ultimo = delTipo[delTipo.length - 1];
    if (ultimo) eliminarEventoEnEdicion(ultimo.id);
  };

  // Cerrar sesión DE VERDAD: borra las cookies en el servidor y luego
  // redirige. (Antes solo navegaba a /panel y la sesión viva te devolvía
  // al admin de inmediato — por eso "no funcionaba".)
  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // sin red: igual salimos de la vista
    }
    router.replace("/panel");
  };

  // Filtra jugadores de cada equipo según los buscadores de ID y nombre (aplican en conjunto)
  const jugadorCoincideBusqueda = (p: AdminPlayer) => {
    const idQuery = playerIdQuery.trim().toLowerCase();
    const nameQuery = playerNameQuery.trim().toLowerCase();
    const coincideId = idQuery ? (p.document || "").toLowerCase().includes(idQuery) || p.id.toString().includes(idQuery) : true;
    const coincideNombre = nameQuery ? p.name.toLowerCase().includes(nameQuery) : true;
    return coincideId && coincideNombre;
  };

  const hayFiltroDeJugadorActivo = playerIdQuery.trim() !== "" || playerNameQuery.trim() !== "";

  const equiposConJugadores = teams.map((t) => ({
    team: t,
    jugadores: players.filter((p) => p.team_id === t.id),
    jugadoresFiltrados: players.filter((p) => p.team_id === t.id && jugadorCoincideBusqueda(p))
  }));

  // ── "¿Hace parte de tMt?": opciones del dropdown y persistencia ──
  const TMT_OPTIONS = [
    { value: "SI", label: "Sí", dot: "bg-emerald-500" },
    { value: "NO_QUIERE", label: "No, pero quiere hacer parte", dot: "bg-amber-400" },
    { value: "NO_INTERESADO", label: "No, no está interesado", dot: "bg-gray-400" },
    { value: "NO_ASISTIO", label: "No asistió", dot: "bg-red-400" },
  ] as const;

  const marcarTmt = (playerId: number, value: string) => {
    const nuevo = players.find((p) => p.id === playerId)?.tmt_status === value ? null : value;
    setPlayers((prev) => prev.map((p) => (p.id === playerId ? { ...p, tmt_status: nuevo } : p)));
    setOpenTmtPlayer(null);
    patchAuth(`/api/players/${playerId}`, { tmtStatus: nuevo }).catch(() => { });
  };

  // Asistencia (check del registro) persistida en players.attended
  const marcarAsistencia = (playerId: number, attended: boolean) => {
    setPlayers((prev) => prev.map((p) => (p.id === playerId ? { ...p, attended } : p)));
    patchAuth(`/api/players/${playerId}`, { attended }).catch(() => { });
  };

  // Deuda del equipo marcada como saldada (o no) desde el registro
  const marcarDeuda = (teamId: number, debtPaid: boolean) => {
    setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, debt_paid: debtPaid } : t)));
    patchAuth(`/api/teams/${teamId}`, { debtPaid }).catch(() => { });
  };

  const actasFiltradas = actas.filter((acta) => {
    if (genderFilter === 1 && acta.gender !== "masculino") return false;
    if (genderFilter === 2 && acta.gender !== "femenino") return false;
    const query = searchQuery.toLowerCase().trim();
    return query ? (acta.teamA.toLowerCase().includes(query) || acta.teamB.toLowerCase().includes(query) || acta.group?.toLowerCase().includes(query) || acta.phase?.toLowerCase().includes(query) || acta.incidentsNotes?.toLowerCase().includes(query)) : true;
  });

  const historialFiltrado = auditLogs.filter((log) => {
    if (historyGenderFilter === 1 && log.gender !== "masculino") return false;
    if (historyGenderFilter === 2 && log.gender !== "femenino") return false;
    const query = historySearchQuery.toLowerCase().trim();
    return query ? (log.details.toLowerCase().includes(query) || log.action.toLowerCase().includes(query) || log.adminName.toLowerCase().includes(query) || log.adminEmail.toLowerCase().includes(query) || log.matchId.toString() === query) : true;
  });

  const renderGenderFilterTabs = (currentFilter: number, filterSetter: (val: number) => void) => (
    <div className="w-full flex justify-center">
      <nav className="inline-flex rounded-full p-1 bg-[#10204c]/[0.05] border border-[#10204c]/[0.04] shadow-[inset_0_2px_4px_rgba(16,32,76,0.06)]">
        {genderTabs.map((tab, index) => {
          const isActive = currentFilter === index;
          return (
            <button
              key={index}
              type="button"
              onClick={() => filterSetter(index)}
              className={`flex items-center justify-center h-9 md:h-10 rounded-full px-4 text-xs font-semibold leading-none transition-all duration-200 outline-none select-none active:scale-[0.97] whitespace-nowrap ${isActive
                ? "bg-white text-[#233c97] shadow-[0_3px_10px_rgba(16,32,76,0.12),_0_1px_2px_rgba(16,32,76,0.04)] font-bold"
                : "text-[#10204c]/55 hover:text-[#10204c]/85"
                }`}
            >
              <span className="material-symbols-outlined max-[424px]:inline hidden !text-[24px]">
                {tab.icon}
              </span>
              <span className="hidden min-[425px]:inline text-xs md:text-sm px-1">
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );

  const renderHistoryContainer = () => (
    <div className="flex flex-col h-full w-full space-y-4">
      <div className="pb-2 flex flex-col items-center justify-center text-center gap-3 w-full">
        {renderGenderFilterTabs(historyGenderFilter, setHistoryGenderFilter)}

        <div className="w-full max-w-md mx-auto">
          <div className="relative flex items-center rounded-full p-0.5 min-[375px]:p-1 bg-[#10204c]/[0.05] border border-[#10204c]/[0.04] shadow-[inset_0_2px_4px_rgba(16,32,76,0.06)]">
            <span className="material-symbols-outlined absolute left-3.5 text-[#10204c]/55 !text-[19px] md:!text-[20px]">search</span>
            <input
              type="text"
              placeholder="Buscar por cambios, administrador o partido..."
              value={historySearchQuery}
              onChange={(e) => setHistorySearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 h-7 min-[375px]:h-8 min-[425px]:h-8 sm:h-9 md:h-10 rounded-full text-xs sm:text-xs md:text-sm font-semibold bg-transparent border-none focus:outline-none focus:ring-0 text-[#10204c]/85 placeholder:text-[#10204c]/40 transition-all"
            />
            {historySearchQuery && (
              <button onClick={() => setHistorySearchQuery("")} className="absolute right-3.5 text-[#10204c]/55 hover:text-[#10204c]/85 font-bold text-xs">
                <span className="material-symbols-outlined !text-[16px] md:!text-[18px]">close</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4 flex-1 overflow-y-auto pr-1 no-scrollbar" style={{ scrollbarWidth: "none" }}>
        {historialFiltrado.length === 0 ? (
          <div className="text-center py-10 opacity-50 space-y-1">
            <span className="material-symbols-outlined text-3xl">history</span>
            <p className="text-xs">No hay registros de modificaciones bajo este filtro.</p>
          </div>
        ) : (
          historialFiltrado.map((log) => (
            <AuditLogCard key={log.id} log={log} />
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen w-full flex flex-col font-poppins bg-[var(--background)] text-[var(--foreground)] transition-colors pt-16 min-[375px]:pt-20 md:pt-28 no-scrollbar">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />

      <style dangerouslySetInnerHTML={{
        __html: `
        ::-webkit-scrollbar {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
        }
        html, body, .no-scrollbar {
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
        }
      `}} />

      {/* HEADER */}
      <header className="fixed top-0 left-0 right-0 z-[100] w-full rounded-b-2xl md:rounded-b-3xl bg-white/45 backdrop-blur-md border-b-2 border-white/40 shadow-[0_10px_30px_rgba(16,32,76,0.15),_0_1px_3px_rgba(16,32,76,0.1)] font-poppins transform-gpu will-change-transform">
        <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 md:px-6 lg:px-8 py-1.5 md:py-0 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex-shrink-0 relative flex items-center justify-start w-[50px] min-[375px]:w-[70px] min-[425px]:w-[80px] md:w-[135px] lg:w-[160px]">
            <Image src="/assets/Logo_tMtCup.svg" alt="Logo oficial TMT CUP" width={140} height={140} className="object-contain drop-shadow-md w-[45px] h-[45px] min-[375px]:w-[65px] min-[375px]:h-[65px] min-[425px]:w-[75px] min-[425px]:h-[75px] md:w-[120px] md:h-[120px] lg:w-[140px] lg:h-[140px] transition-all duration-300" priority />
          </div>

          <nav className="flex-1 min-w-0 max-w-[150px] min-[375px]:max-w-[170px] min-[425px]:max-w-[190px] sm:max-w-[300px] md:max-w-[340px] mx-auto">
            <div className="grid grid-cols-2 w-full rounded-full p-1 bg-[#10204c]/[0.05] border border-[#10204c]/[0.04] shadow-[inset_0_2px_4px_rgba(16,32,76,0.06)]">
              {navTabs.map((tab, index) => {
                const isActive = activeIndex === index;
                const iconName = index === 0 ? "dashboard" : "groups";
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    title={tab.label}
                    className={`flex items-center justify-center gap-1.5 sm:gap-2 w-full min-w-0 h-7 min-[375px]:h-8 sm:h-9 md:h-10 rounded-full px-1 sm:px-3 text-xs sm:text-xs md:text-sm font-semibold leading-none transition-all duration-200 outline-none select-none active:scale-[0.97] whitespace-nowrap ${isActive
                      ? "bg-white text-[#233c97] shadow-[0_3px_10px_rgba(16,32,76,0.12),_0_1px_2px_rgba(16,32,76,0.04)] font-bold"
                      : "text-[#10204c]/55 hover:text-[#10204c]/85"
                      }`}
                  >
                    <span className="material-symbols-outlined !text-[18px] sm:!text-[19px] md:!text-[20px] shrink-0 w-5 h-5 flex items-center justify-center leading-none">
                      {iconName}
                    </span>
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* BOTÓN CERRAR SESIÓN HEADER */}
          <div className="hidden md:flex items-center justify-end flex-shrink-0">
            <button
              type="button"
              onClick={handleLogout}
              className="bg-[#f83636] hover:bg-[#d62b2b] text-white text-xs font-medium px-5 py-2 md:px-6 md:py-2.5 rounded-full shadow-md hover:shadow-lg transition-all duration-200 active:scale-95 whitespace-nowrap"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-2 min-[375px]:px-4 md:px-8 py-3 space-y-6 no-scrollbar">

        {/* DASHBOARD */}
        {activeIndex === 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start no-scrollbar">

            {/* SECCIÓN ACTAS CON INCIDENTES INTERNOS */}
            <section className="col-span-1 lg:col-span-6 bg-[var(--card-strong)] rounded-3xl p-4 min-[375px]:p-5 border border-[var(--border)] shadow-xs space-y-4 no-scrollbar">
              <div className="border-b border-[var(--border)] pb-4 flex flex-col items-center justify-center text-center gap-3 w-full">
                <h2 className="text-base min-[375px]:text-lg md:text-xl font-medium tracking-wide text-[#233c97]">
                  Partidos del torneo
                </h2>
                {renderGenderFilterTabs(genderFilter, setGenderFilter)}
                <div className="w-full max-w-md mx-auto">
                  <div className="relative flex items-center rounded-full p-0.5 min-[375px]:p-1 bg-[#10204c]/[0.05] border border-[#10204c]/[0.04] shadow-[inset_0_2px_4px_rgba(16,32,76,0.06)]">
                    <span className="material-symbols-outlined absolute left-3.5 text-[#10204c]/55 !text-[19px] md:!text-[20px]">search</span>
                    <input type="text" placeholder="Buscar por equipo, grupo o incidentes..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-10 h-7 min-[375px]:h-8 min-[425px]:h-8 sm:h-9 md:h-10 rounded-full text-xs sm:text-xs md:text-sm font-semibold bg-transparent border-none focus:outline-none focus:ring-0 text-[#10204c]/85 placeholder:text-[#10204c]/40 transition-all" />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery("")} className="absolute right-3.5 text-[#10204c]/55 hover:text-[#10204c]/85 font-bold text-xs">
                        <span className="material-symbols-outlined !text-[16px] md:!text-[18px]">close</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-4 max-h-[calc(100vh-230px)] overflow-y-auto pr-0 no-scrollbar" style={{ scrollbarWidth: "none" }}>
                {actasFiltradas.length === 0 ? (
                  <div className="text-center py-10 opacity-50 space-y-1">
                    <span className="material-symbols-outlined text-3xl">inbox</span>
                    <p className="text-xs">No se encontraron partidos bajo este filtro.</p>
                  </div>
                ) : (
                  actasFiltradas.map((acta) => (
                    acta.gender === "femenino" ? (
                      <FinishedMatchCardFemenino key={acta.id} acta={acta} onEdit={abrirEdicionActa} />
                    ) : (
                      <FinishedMatchCardMasculino key={acta.id} acta={acta} onEdit={abrirEdicionActa} />
                    )
                  ))
                )}
              </div>
            </section>

            {/* HISTORIAL DE AUDITORÍA LATERAL (Escritorio) */}
            <section className="hidden lg:flex lg:col-span-6 bg-[var(--card-strong)] rounded-3xl p-5 border border-[var(--border)] shadow-xs flex-col max-h-[calc(100vh-140px)] no-scrollbar">
              <h2 className="text-base min-[375px]:text-lg md:text-xl font-medium tracking-wide text-[#233c97] mb-2 text-center">
                Historial de Auditoría
              </h2>
              {renderHistoryContainer()}
            </section>

          </div>
        )}

        {/* REGISTRO */}
        {activeIndex === 1 && (
          <section className="bg-[var(--card-strong)] rounded-3xl p-4 min-[375px]:p-5 md:p-6 border border-[var(--border)] shadow-xs space-y-6 no-scrollbar">

            {/* Encabezado y Buscador */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[var(--border)] pb-5">
              <div className="w-full text-center lg:text-left">
                <h2 className="text-base min-[375px]:text-lg md:text-xl font-medium tracking-wide text-[#233c97]">
                  Nómina de Equipos y Jugadores Inscritos
                </h2>
              </div>

              {/* Buscador de Jugadores */}
              <div className="flex flex-col min-[425px]:flex-row gap-2 w-full lg:max-w-md mx-auto lg:mx-0">
                <div className="relative flex-1">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 !text-[18px]">search</span>
                  <input
                    type="text"
                    placeholder="Buscar por jugador, documento o equipo..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-8 h-9 rounded-xl text-xs font-medium bg-[#10204c]/[0.04] border border-transparent focus:bg-white focus:border-[#233c97] focus:outline-none transition-all"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <span className="material-symbols-outlined !text-[14px]">close</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Renderizado de Tarjetas de Equipos */}
            {teams.length === 0 ? (
              <p className="text-xs text-center py-12 opacity-50">No hay equipos registrados en el sistema.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 no-scrollbar">
                {equiposConJugadores.map(({ team, jugadores }) => {
                  const isFem = team.category === "FEMENINO";

                  // Una sola caja: busca por jugador (nombre/documento) y TAMBIÉN
                  // por nombre de equipo (si el equipo coincide, se muestra completo).
                  const query = searchQuery.toLowerCase().trim();
                  const coincideEquipo = query !== "" && team.name.toLowerCase().includes(query);
                  const jugadoresFiltrados = jugadores.filter((p) => {
                    if (!query || coincideEquipo) return true;
                    return p.name.toLowerCase().includes(query) || (p.document || "").toLowerCase().includes(query);
                  });

                  if (searchQuery && !coincideEquipo && jugadoresFiltrados.length === 0) return null;

                  return (
                    <div key={team.id} className="rounded-2xl bg-[var(--background)] border border-[var(--border)] overflow-hidden shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between">

                      {/* Cabecera del Equipo */}
                      <div className={`p-3 border-b flex items-center justify-between gap-2 ${isFem ? "bg-purple-50/40 border-purple-100/60 text-purple-950" : "bg-blue-50/40 border-blue-100/60 text-blue-950"}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-white border border-black/5 flex items-center justify-center text-xs shrink-0 select-none overflow-hidden">
                            {teamFlagSrc(team.name) ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={teamFlagSrc(team.name)!} alt="" className="w-full h-full object-cover" />
                            ) : (
                              "⚽"
                            )}
                          </div>
                          <h3 className="text-xs min-[375px]:text-sm font-medium tracking-wide truncate text-[#10204c]">
                            {team.name}
                          </h3>
                        </div>
                        <span className="text-[10px] font-normal tracking-wider opacity-60 lowercase first-letter:uppercase">
                          {isFem ? "Femenino" : "Masculino"}
                        </span>
                      </div>

                      {/* Lista Interna del Equipo */}
                      <div className="p-3 space-y-2 flex-1 max-h-72 overflow-y-auto no-scrollbar" style={{ scrollbarWidth: "none" }}>
                        {jugadoresFiltrados.map((p, idx) => {
                          const isRegistered = p.attended === true;
                          const tmtActual = TMT_OPTIONS.find((o) => o.value === p.tmt_status) ?? null;
                          const tmtOpen = openTmtPlayer === p.id;

                          return (
                            <div key={p.id} className="flex flex-col gap-2 p-2 rounded-xl bg-white border border-black/5 shadow-xs transition-all hover:border-gray-200">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-[10px] font-medium text-gray-400 w-4 shrink-0 text-right">{idx + 1}.</span>
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-medium text-[11.5px] text-[#10204c]/90 truncate">{p.name}</span>
                                    <span className="text-[9.5px] font-light text-gray-400">{p.document || "Sin Documento"}</span>
                                  </div>
                                </div>

                                {/* Controles: tMt + Registro (asistencia) */}
                                <div className="flex items-center gap-1.5 shrink-0">

                                  {/* Botón tMt → despliega "¿Hace parte de tMt?" */}
                                  <button
                                    type="button"
                                    onClick={() => setOpenTmtPlayer(tmtOpen ? null : p.id)}
                                    title="¿Hace parte de tMt?"
                                    className={`flex items-center justify-center gap-1 h-7 px-2 rounded-lg border text-[10px] font-black tracking-tight transition-all duration-200 active:scale-95 ${tmtActual
                                      ? "bg-[#233c97] border-[#233c97] text-white shadow-sm"
                                      : "bg-gray-50 border-black/5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                                      }`}
                                  >
                                    tMt
                                    {tmtActual && <span className={`w-1.5 h-1.5 rounded-full ${tmtActual.dot}`} />}
                                  </button>

                                  {/* Registro / asistencia (persistido en Supabase) */}
                                  <button
                                    type="button"
                                    onClick={() => marcarAsistencia(p.id, !isRegistered)}
                                    className={`flex items-center justify-center w-7 h-7 rounded-lg border transition-all duration-200 ${isRegistered
                                      ? "bg-emerald-500 border-emerald-500 text-white shadow-sm"
                                      : "bg-gray-50 border-black/5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 active:scale-95"
                                      }`}
                                    title={isRegistered ? "Quitar registro" : "Confirmar registro"}
                                  >
                                    <span className="material-symbols-outlined !text-[16px] font-bold">
                                      {isRegistered ? "check" : "how_to_reg"}
                                    </span>
                                  </button>

                                </div>
                              </div>

                              {/* Desplegable ¿Hace parte de tMt? */}
                              {tmtOpen && (
                                <div className="rounded-xl bg-gray-50/80 border border-black/5 p-1.5 space-y-1">
                                  <span className="block text-[12px] font-medium text-gray-400 tracking-wider px-1">¿Hace parte de tMt?</span>
                                  {TMT_OPTIONS.map((opt) => {
                                    const activo = p.tmt_status === opt.value;
                                    return (
                                      <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => marcarTmt(p.id, opt.value)}
                                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-[10.5px] font-semibold transition-all active:scale-[0.98] ${activo
                                          ? "bg-[#233c97] text-white shadow-sm"
                                          : "bg-white text-[#10204c]/75 border border-black/5 hover:border-[#233c97]/30"
                                          }`}
                                      >
                                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${opt.dot}`} />
                                        {opt.label}
                                        {activo && <span className="material-symbols-outlined !text-[13px] ml-auto">check</span>}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Footer: deuda del equipo (izquierda) + participantes (derecha) */}
                      <div className="p-2.5 bg-gray-50/40 border-t border-[var(--border)] flex items-center justify-between gap-2">
                        {(team.debt ?? 0) > 0 ? (
                          <label className={`flex items-center gap-1.5 cursor-pointer select-none rounded-lg px-2 py-1 border transition-all ${team.debt_paid
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : "bg-red-50 border-red-200 text-red-600"
                            }`}>
                            <input
                              type="checkbox"
                              checked={team.debt_paid === true}
                              onChange={(e) => marcarDeuda(team.id, e.target.checked)}
                              className="h-3 w-3 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                            <span className="text-[9.5px] font-bold tracking-tight">
                              {team.debt_paid ? "Deuda saldada" : `Debe $${(team.debt ?? 0).toLocaleString("es-CO")}`}
                            </span>
                          </label>
                        ) : (
                          <span className="text-[9.5px] font-semibold text-emerald-600/70 px-1">Sin deuda</span>
                        )}
                        <span className="text-[10px] font-normal text-gray-400">
                          {jugadoresFiltrados.length} registrados
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

      </main>

      {/* MODAL DE EDICIÓN ACTA */}
      {actaEdicion && (
        <div className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 no-scrollbar">
          <div className="bg-white rounded-3xl w-full max-w-2xl p-4 min-[375px]:p-6 border border-[var(--border)] shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar" style={{ scrollbarWidth: "none" }}>
            {/* Cabecera: equipos, cancha y supervisor (sin "Editar Partido #") */}
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div>
                <h3 className="text-lg font-medium text-[var(--primary)]">{actaEdicion.teamA} <span className="opacity-40">vs</span> {actaEdicion.teamB}</h3>
                <p className="text-[10px] opacity-60">Cancha {actaEdicion.fieldNumber} • {actaEdicion.phase} • Registrado por {actaEdicion.supervisorName}</p>
              </div>
              <button onClick={() => { setActaEdicion(null); setOpenActaPlayer(null); }} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors flex items-center justify-center"><span className="material-symbols-outlined !text-[18px]">close</span></button>
            </div>
            <form onSubmit={guardarCambiosActa} className="space-y-4">
              {/* Fase final "por definir": elegir los equipos que se enfrentan */}
              {(actaEdicion.teamAId == null || actaEdicion.teamBId == null) && (
                <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2">
                  <span className="block text-[11px] font-bold text-amber-800 tracking-wider">
                    {actaEdicion.phase} por definir — elige los equipos
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={actaEdicion.teamAId ?? ""}
                      onChange={(e) => {
                        const id = e.target.value ? Number(e.target.value) : null;
                        const t = teams.find((x) => x.id === id);
                        setActaEdicion({ ...actaEdicion, teamAId: id, teamA: t?.name ?? "Por definir", logoA: teamFlagSrc(t?.name) ?? undefined });
                      }}
                      className="w-full p-2 text-xs rounded-xl border border-[var(--border)] bg-white"
                    >
                      <option value="">Equipo A…</option>
                      {teams.filter((t) => t.category === actaEdicion.category && t.id !== actaEdicion.teamBId).map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <select
                      value={actaEdicion.teamBId ?? ""}
                      onChange={(e) => {
                        const id = e.target.value ? Number(e.target.value) : null;
                        const t = teams.find((x) => x.id === id);
                        setActaEdicion({ ...actaEdicion, teamBId: id, teamB: t?.name ?? "Por definir", logoB: teamFlagSrc(t?.name) ?? undefined });
                      }}
                      className="w-full p-2 text-xs rounded-xl border border-[var(--border)] bg-white"
                    >
                      <option value="">Equipo B…</option>
                      {teams.filter((t) => t.category === actaEdicion.category && t.id !== actaEdicion.teamAId).map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Marcador (se ajusta solo al asignar goles a los jugadores) */}
              <div className="p-3 rounded-2xl bg-gray-50 border border-[var(--border)]">
                <div className="grid grid-cols-5 items-center gap-2">
                  <div className="col-span-2 text-center"><span className="text-xs font-semibold block truncate">{actaEdicion.teamA}</span><input type="number" min="0" value={actaEdicion.scoreA} onChange={(e) => setActaEdicion({ ...actaEdicion, scoreA: parseInt(e.target.value) || 0 })} className="w-16 mx-auto text-center py-1 font-bold text-lg rounded-xl border border-[var(--border)] bg-white" /></div>
                  <div className="col-span-1 text-center font-bold opacity-40">:</div>
                  <div className="col-span-2 text-center"><span className="text-xs font-semibold block truncate">{actaEdicion.teamB}</span><input type="number" min="0" value={actaEdicion.scoreB} onChange={(e) => setActaEdicion({ ...actaEdicion, scoreB: parseInt(e.target.value) || 0 })} className="w-16 mx-auto text-center py-1 font-bold text-lg rounded-xl border border-[var(--border)] bg-white" /></div>
                </div>
              </div>

              {/* ROSTER estilo "partido en vivo": jugadores por equipo con sus eventos.
                  Toca la flecha de un jugador para agregar/quitar gol, amarilla o roja. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  { title: actaEdicion.teamA, side: "A" as const },
                  { title: actaEdicion.teamB, side: "B" as const },
                ]).map((team) => (
                  <div key={team.side} className="rounded-2xl border border-[var(--border)] bg-white p-3">
                    <div className="flex items-center justify-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 border border-[var(--border)] flex items-center justify-center shrink-0"><span className="text-[11px] font-black text-[var(--primary)]">{team.title[0]}</span></div>
                      <h4 className="text-sm font-semibold text-[var(--primary)] truncate">{team.title}</h4>
                    </div>
                    <div className="space-y-2">
                      {rosterActa(team.title, team.side).length === 0 && (
                        <p className="text-[10px] text-center opacity-50 py-2">Sin jugadores en la base para este equipo.</p>
                      )}
                      {rosterActa(team.title, team.side).map((jugador) => {
                        const evs = eventosDeJugador(team.side, jugador);
                        const key = `${team.side}-${jugador}`;
                        const isOpen = openActaPlayer === key;
                        const expulsado = evs.some((e) => e.type === "ROJA");
                        return (
                          <div key={key} className={`rounded-xl border border-[var(--border)] bg-white px-2.5 py-2 flex flex-col gap-2 ${expulsado ? "opacity-50 grayscale-[0.6] bg-gray-100" : ""}`}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-800 truncate">
                                {jugador}
                                {expulsado && <span className="ml-1.5 align-middle text-[9px] font-black tracking-wider text-red-600">🟥 EXPULSADO</span>}
                              </span>
                              <button type="button" onClick={() => setOpenActaPlayer(isOpen ? null : key)} className="h-7 w-7 rounded-full bg-[var(--primary)]/5 hover:bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center shrink-0">
                                <span className={`material-symbols-outlined !text-[16px] transition-transform ${isOpen ? "rotate-180" : ""}`}>expand_more</span>
                              </button>
                            </div>
                            {evs.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {evs.map((ev) => (
                                  <span key={ev.id} className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 border border-[var(--border)] text-slate-600 select-none">
                                    {ev.type === "GOL" ? "⚽" : ev.type === "AMARILLA" ? "🟨" : "🟥"} {ev.minute}&apos;
                                  </span>
                                ))}
                              </div>
                            )}
                            {isOpen && (
                              <div className="flex flex-wrap gap-1.5 justify-center pt-1">
                                {([
                                  { icon: "⚽", type: "GOL" as const },
                                  { icon: "🟨", type: "AMARILLA" as const },
                                  { icon: "🟥", type: "ROJA" as const },
                                ]).map((act) => (
                                  <div key={act.type} className="flex items-center gap-1 px-1.5 py-1 rounded-full border border-[var(--border)] bg-gray-50">
                                    <button type="button" onClick={() => quitarEventoJugador(act.type, team.side, jugador)} className="w-5 h-5 rounded-full bg-white hover:bg-gray-200 border border-[var(--border)] flex items-center justify-center font-bold text-xs active:scale-90 transition-transform"><span className="leading-none mt-[-2px]">-</span></button>
                                    <span className="text-[11px] select-none">{act.icon}</span>
                                    <button type="button" onClick={() => agregarEventoJugador(act.type, team.side, jugador)} className="w-5 h-5 rounded-full bg-white hover:bg-gray-200 border border-[var(--border)] flex items-center justify-center font-bold text-xs active:scale-90 transition-transform"><span className="leading-none mt-[-1px]">+</span></button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Eventos registrados (original) vs. actualizados (tras la edición) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-2.5 rounded-2xl bg-gray-50 border border-[var(--border)]">
                  <span className="block text-[13px] font-medium opacity-60 tracking-wider mb-1.5">Eventos registrados</span>
                  <div className="space-y-1 max-h-28 overflow-y-auto pr-1 no-scrollbar" style={{ scrollbarWidth: "none" }}>
                    {(actas.find((a) => a.id === actaEdicion.id)?.events ?? []).length === 0 && <p className="text-[10px] opacity-40">Sin eventos.</p>}
                    {(actas.find((a) => a.id === actaEdicion.id)?.events ?? []).map((ev) => (
                      <div key={`o-${ev.id}`} className="text-[10px] text-slate-600">{ev.type === "GOL" ? "⚽" : ev.type === "AMARILLA" ? "🟨" : "🟥"} {ev.player} ({ev.minute}&apos;) · {ev.team === "A" ? actaEdicion.teamA : actaEdicion.teamB}</div>
                    ))}
                  </div>
                </div>
                <div className="p-2.5 rounded-2xl bg-[var(--primary)]/5 border border-[var(--primary)]/15">
                  <span className="block text-[13px] font-medium text-[var(--primary)] tracking-wider mb-1.5">Eventos actualizados</span>
                  <div className="space-y-1 max-h-28 overflow-y-auto pr-1 no-scrollbar" style={{ scrollbarWidth: "none" }}>
                    {actaEdicion.events.length === 0 && <p className="text-[10px] opacity-40">Sin eventos.</p>}
                    {actaEdicion.events.map((ev) => (
                      <div key={`u-${ev.id}`} className="text-[10px] text-slate-700">{ev.type === "GOL" ? "⚽" : ev.type === "AMARILLA" ? "🟨" : "🟥"} {ev.player} ({ev.minute}&apos;) · {ev.team === "A" ? actaEdicion.teamA : actaEdicion.teamB}</div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Incidentes */}
              <div>
                <label className="block text-[13px] font-medium opacity-70 tracking-wider mb-1">Incidentes</label>
                <textarea rows={2} value={actaEdicion.incidentsNotes || ""} onChange={(e) => setActaEdicion({ ...actaEdicion, incidentsNotes: e.target.value })} placeholder="Describe cualquier incidente del partido…" className="w-full p-2 text-xs rounded-xl border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]" />
              </div>
              {errorGuardado && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-2.5 text-center text-[11px] font-semibold text-red-600">
                  {errorGuardado}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button type="button" onClick={() => { setActaEdicion(null); setOpenActaPlayer(null); }} className="px-4 py-2 rounded-xl text-xs font-semibold hover:bg-gray-100">Cancelar</button>
                <button type="submit" disabled={guardandoActa} className="px-5 py-2 rounded-full bg-[var(--primary)] text-white text-xs font-bold shadow-sm hover:opacity-90 transition-all flex items-center gap-1 disabled:opacity-50">{guardandoActa ? "Guardando..." : "Guardar"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PANEL DESPLEGABLE HISTORIAL DE AUDITORÍA (Móvil - Bottom Sheet con soporte para gestos) */}
      <HistoryPanel isOpen={historyOpen} onClose={() => setHistoryOpen(false)}>
        {renderHistoryContainer()}
      </HistoryPanel>

      {/* ── BOTONES FLOTANTES MÓVIL RESPONSIVE ── */}
      <div className="fixed bottom-4 left-4 min-[375px]:bottom-5 min-[375px]:left-5 min-[425px]:bottom-6 min-[425px]:left-6 z-40 block lg:hidden">
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="h-11 w-11 min-[375px]:h-13 min-[375px]:w-13 min-[425px]:h-14 min-[425px]:w-14 sm:h-16 sm:w-16 shrink-0 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-[0_8px_30px_rgba(245,158,11,0.4)] flex items-center justify-center border border-white/20 active:scale-95 transition-all duration-200"
          aria-label="Ver Historial de Auditoría"
        >
          <span className="material-symbols-outlined !text-[20px] min-[375px]:!text-[22px] min-[425px]:!text-[24px] sm:!text-[28px]">history</span>
        </button>
      </div>

      <div className="fixed bottom-4 right-4 min-[375px]:bottom-5 min-[375px]:right-5 min-[425px]:bottom-6 min-[425px]:right-6 z-40 flex md:hidden">
        <button
          type="button"
          onClick={handleLogout}
          title="Cerrar Sesión"
          className="h-11 w-11 min-[375px]:h-13 min-[375px]:w-13 min-[425px]:h-14 min-[425px]:w-14 shrink-0 rounded-full bg-[#f83636] text-white shadow-[0_4px_15px_rgba(248,54,54,0.35)] hover:bg-[#d62b2b] flex items-center justify-center border border-white/10 active:scale-95 transition-all duration-200"
        >
          <span className="material-symbols-outlined !text-[20px] min-[375px]:!text-[22px] min-[425px]:!text-[24px] flex items-center justify-center leading-none">logout</span>
        </button>
      </div>

    </div>
  );
}