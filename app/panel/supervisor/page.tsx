"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NextImage from "next/image";
import MatchCardContainer, { type MatchCard } from "./components/MatchCardContainer";
import TeamPresenceCard from './components/TeamPresenceCard'
import ControlAlertPopup from './components/ControlAlertPopup'
import { SummarySection, SummaryRow, SummaryEmpty } from "./components/SummaryBlocks";
import { fetchSessionUser, clearSupervisorCache, SUPERVISOR_CACHE_KEY } from "@/lib/session-client";
import { teamFlagSrc } from "@/lib/flags";

type View = "dashboard" | "waiting" | "live" | "summary";
type Filter = "upcoming" | "finished";
type TeamSide = "home" | "away";
type EventKind = "goal" | "yellow" | "red";

type Player = {
  id: string;
  name: string;
  suspended?: boolean;
};

type LiveEvent = {
  id: string;
  playerId: string;
  team: TeamSide;
  kind: EventKind;
  minute: number;
};

type Incident = {
  id: string;
  label: string;
  note: string;
};

type Report = {
  title: string;
  subtitle: string;
  score: string;
  goals: Array<{ label: string; team: string }>;
  cards: Array<{ label: string; team: string }>;
  incidents: Incident[];
  walkover?: string;
};

// ── DATOS REALES DEL BACKEND ─────────────────────────────────────
// El dashboard sale de la agenda del día para la cancha asignada al
// supervisor logueado (según su credencial).

type ApiTeamRef = { id: number; name: string } | null;

type ApiMatch = {
  id: number;
  scheduled_at: string;
  phase: string;
  status: string; // PROGRAMADO | EN_ESPERA | EN_JUEGO | FINALIZADO
  field_number: number;
  score_a: number | null;
  score_b: number | null;
  team_a_id: number | null;
  team_b_id: number | null;
  waiting_started_at: string | null;
  kickoff_at: string | null;
  team_a_present_at: string | null;
  team_b_present_at: string | null;
  published_at: string | null;
  walkover: string | null;
  teamA: ApiTeamRef;
  teamB: ApiTeamRef;
};

type Assignment = {
  id: number;
  day: string;
  field_number: number;
  supervisor_name: string;
  referee_name: string;
};

type ApiEvent = {
  id: number;
  team_id: number;
  minute: number | null;
  type: string; // GOL | AMARILLA | ROJA
  player: { id: number; name: string } | null;
};

type ApiTeamDetail = {
  id: number;
  name: string;
  players?: Array<{ id: number; name: string; suspended?: boolean }>;
} | null;

type Rosters = { home: Player[]; away: Player[] };
type TeamIds = { home: number | null; away: number | null };

const PHASE_LABEL: Record<string, string> = {
  GRUPOS: "Fase de grupos",
  SEMIFINAL: "Semifinal",
  FINAL: "Final",
};

function phaseLabel(phase: string) {
  return PHASE_LABEL[phase] ?? phase;
}

// Hora local de Bogotá (el bug de AM/PM ya nos mordió una vez)
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-CO", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Bogota",
  });
}

function cardStatus(status: string): MatchCard["status"] {
  if (status === "EN_ESPERA" || status === "EN_JUEGO") return "live";
  if (status === "FINALIZADO") return "finished";
  return "upcoming";
}

function toCard(m: ApiMatch): MatchCard {
  return {
    id: String(m.id),
    time: formatTime(m.scheduled_at),
    phase: phaseLabel(m.phase),
    homeTeam: m.teamA?.name ?? "Por definir",
    awayTeam: m.teamB?.name ?? "Por definir",
    status: cardStatus(m.status),
    homeScore: m.score_a,
    awayScore: m.score_b,
    homeTeamId: m.team_a_id,
  };
}

// Nombres sin tildes ni mayúsculas para casar credencial ↔ asignación
function normalizeName(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function secondsSince(iso: string) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
}

// Respaldo local de la mesa de control: si el supervisor cierra la app o se le
// apaga el teléfono en medio de un partido, NADA se pierde. Solo se borra al
// enviar el acta (no es visual: convive con los estilos de Simón).
type PersistedControl = {
  version: 3;
  savedAt: number;
  view: View;
  match: MatchCard;
  matchDbId: number | null;
  fieldNumber: number | null;
  teamIds: TeamIds;
  rosters: Rosters;
  waitingSeconds: number;
  presence: { home: boolean; away: boolean };
  liveSeconds: number;
  paused: boolean;
  eventsByTeam: Record<TeamSide, Record<string, LiveEvent[]>>;
  incidents: Incident[];
  report: Report | null;
};

const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function readControlBackup(): PersistedControl | null {
  try {
    const raw = localStorage.getItem(SUPERVISOR_CACHE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as PersistedControl;
    if (saved?.version !== 3 || !saved.match || saved.view === "dashboard") return null;
    if (Date.now() - saved.savedAt > CACHE_MAX_AGE_MS) return null;
    return saved;
  } catch {
    return null;
  }
}

const matchDuration = 26 * 60;
const waitingDuration = 6 * 60;

// Etiquetas de eventos para chips y toasts (con género gramatical correcto)
const EVENT_LABEL: Record<EventKind, { icon: string; noun: string; added: string; removed: string }> = {
  goal: { icon: "⚽", noun: "gol", added: "Gol registrado a", removed: "Gol eliminado de" },
  yellow: { icon: "🟨", noun: "amarilla", added: "Amarilla registrada a", removed: "Amarilla eliminada de" },
  red: { icon: "🟥", noun: "roja", added: "Roja registrada a", removed: "Roja retirada a" },
};

function createEmptyEvents() {
  return { home: {}, away: {} } as Record<TeamSide, Record<string, LiveEvent[]>>;
}

function createEmptyPresence() {
  return { home: false, away: false };
}

function formatClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function countGoals(events: Record<TeamSide, Record<string, LiveEvent[]>>) {
  const countForSide = (side: TeamSide) =>
    Object.values(events[side]).reduce((total, playerEvents) => {
      return total + playerEvents.filter((event) => event.kind === "goal").length;
    }, 0);

  return { home: countForSide("home"), away: countForSide("away") };
}

// Convierte los eventos del servidor al formato de la consola en vivo
function hydrateEvents(
  events: ApiEvent[],
  teamAId: number | null,
  teamBId: number | null
): Record<TeamSide, Record<string, LiveEvent[]>> {
  const hydrated = createEmptyEvents();
  for (const ev of events) {
    const side: TeamSide | null =
      ev.team_id === teamAId ? "home" : ev.team_id === teamBId ? "away" : null;
    if (!side) continue;
    // Goles de oficio por sanción W llegan sin jugador: cuentan en el
    // marcador bajo un id especial (no pintan tarjeta en el roster).
    if (!ev.player?.id && ev.type !== "GOL") continue;
    const pid = ev.player?.id ? String(ev.player.id) : "__oficio__";
    const kind: EventKind = ev.type === "GOL" ? "goal" : ev.type === "AMARILLA" ? "yellow" : "red";
    hydrated[side][pid] = [
      ...(hydrated[side][pid] ?? []),
      { id: String(ev.id), playerId: pid, team: side, kind, minute: ev.minute ?? 0 },
    ];
  }
  return hydrated;
}

function buildReport(params: {
  match: MatchCard;
  score: { home: number; away: number };
  events: Record<TeamSide, Record<string, LiveEvent[]>>;
  incidents: Incident[];
  rosters: Rosters;
  walkover?: string;
}) {
  const findName = (side: TeamSide, playerId: string) =>
    playerId === "__oficio__"
      ? "Gol de oficio (sanción W)"
      : params.rosters[side].find((entry) => entry.id === playerId)?.name ??
        (side === "home" ? "Jugador local" : "Jugador visitante");

  const goals = (["home", "away"] as const).flatMap((side) =>
    Object.entries(params.events[side]).flatMap(([playerId, playerEvents]) =>
      playerEvents
        .filter((event) => event.kind === "goal")
        .map(() => ({
          label: findName(side, playerId),
          team: side === "home" ? params.match.homeTeam : params.match.awayTeam,
        })),
    ),
  );

  const cards = (["home", "away"] as const).flatMap((side) =>
    Object.entries(params.events[side]).flatMap(([playerId, playerEvents]) =>
      playerEvents
        .filter((event) => event.kind === "yellow" || event.kind === "red")
        .map((event) => ({
          label: `${findName(side, playerId)} · ${event.kind === "yellow" ? "Amarilla" : "Roja"}`,
          team: side === "home" ? params.match.homeTeam : params.match.awayTeam,
        })),
    ),
  );

  return {
    title: `${params.match.homeTeam} vs ${params.match.awayTeam}`,
    subtitle: `${params.match.phase} · ${params.match.time}`,
    score: `${params.score.home} - ${params.score.away}`,
    goals,
    cards,
    incidents: params.incidents,
    walkover: params.walkover,
  } satisfies Report;
}

const EMPTY_CARD: MatchCard = {
  id: "",
  time: "--:--",
  phase: "",
  homeTeam: "Local",
  awayTeam: "Visitante",
  status: "upcoming",
};

export default function SupervisorPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("dashboard");

  // ── Datos reales según la credencial ──────────────────────────
  const [supervisorName, setSupervisorName] = useState("");
  const [refereeName, setRefereeName] = useState("");
  const [fieldNumber, setFieldNumber] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [apiMatches, setApiMatches] = useState<ApiMatch[]>([]);

  const [activeFilter, setActiveFilter] = useState<Filter>("upcoming");
  const [selectedMatch, setSelectedMatch] = useState<MatchCard>(EMPTY_CARD);
  const [matchDbId, setMatchDbId] = useState<number | null>(null);
  const [rosters, setRosters] = useState<Rosters>({ home: [], away: [] });
  const [teamIds, setTeamIds] = useState<TeamIds>({ home: null, away: null });
  const [waitingSeconds, setWaitingSeconds] = useState(waitingDuration);
  const [presence, setPresence] = useState(createEmptyPresence);
  const [liveSeconds, setLiveSeconds] = useState(matchDuration);
  const [paused, setPaused] = useState(false);
  const [, setExtraTimeUnlocked] = useState(false);
  const [eventsByTeam, setEventsByTeam] = useState(createEmptyEvents);
  const [openEventMenu, setOpenEventMenu] = useState<{ team: TeamSide; playerId: string } | null>(null);
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [incidentDraft, setIncidentDraft] = useState("");
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [restored, setRestored] = useState(false);

  // ── Toast superior (reemplaza los popups nativos del navegador) ──
  const [toast, setToast] = useState<{ id: number; text: string; kind: "ok" | "err" } | null>(null);
  function notify(text: string, kind: "ok" | "err" = "ok") {
    // eslint-disable-next-line react-hooks/purity -- corre solo en handlers (id único del toast), nunca en render
    setToast({ id: Date.now(), text, kind });
  }
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // Confirmación personalizada del pitazo final (nada de window.confirm)
  const [confirmFinish, setConfirmFinish] = useState(false);

  const score = countGoals(eventsByTeam);

  // Canchas asignadas a ESTA persona (puede tener varias: p. ej. la
  // supervisora de la cancha 3 también lleva la final en la cancha 5).
  const [myFields, setMyFields] = useState<number[]>([]);

  // Carga la agenda del día. Si la persona tiene varias canchas asignadas,
  // combina los partidos de TODAS (ordenados por hora) para que la final
  // en otra cancha también le aparezca en su dashboard.
  async function loadField(field: number, allFields: number[] = [field]) {
    setFieldNumber(field);
    const fields = [...new Set([field, ...allFields])];
    const results = await Promise.all(
      fields.map((f) => fetch(`/api/agenda?field=${f}`).then((r) => r.json()).catch(() => null))
    );
    const assignment = (results[0]?.assignment ?? null) as Assignment | null;
    setRefereeName(assignment?.referee_name ?? "");
    const matches = results
      .flatMap((d) => (Array.isArray(d?.matches) ? d.matches : []))
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
    setApiMatches(matches);
  }

  async function loadAgenda(name: string) {
    const all = await fetch("/api/agenda").then((r) => r.json()).catch(() => []);
    const list: Assignment[] = Array.isArray(all) ? all : [];
    setAssignments(list);
    const mine = list.filter((a) => normalizeName(a.supervisor_name ?? "") === normalizeName(name));
    const fields = mine.map((a) => a.field_number);
    setMyFields(fields);
    const field = fields[0] ?? list[0]?.field_number ?? 1;
    await loadField(field, fields.length > 0 ? fields : [field]);
  }

  // Guard de sesión + carga inicial (no visual): solo staff entra.
  useEffect(() => {
    let cancelled = false;
    fetchSessionUser()
      .then(async (user) => {
        if (!user) {
          router.replace("/panel");
          return;
        }
        if (cancelled) return;
        setSupervisorName(user.name);
        await loadAgenda(user.name);
      })
      .catch(() => router.replace("/panel"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga inicial única por sesión
  }, [router]);

  // Cambiar de cancha tocando el número (útil para admins o reemplazos)
  function cycleField() {
    const fields = [...new Set(assignments.map((a) => a.field_number))].sort((a, b) => a - b);
    if (fields.length < 2 || view !== "dashboard") return;
    const idx = fields.indexOf(fieldNumber ?? fields[0]);
    const next = fields[(idx + 1) % fields.length];
    void loadField(next, myFields.includes(next) ? myFields : [next]);
  }

  // ── RESTAURAR: al abrir la app, si quedó un partido a medias se retoma ──
  /* eslint-disable react-hooks/set-state-in-effect -- localStorage solo existe en el cliente: restaurar el respaldo exige setState al montar */
  useEffect(() => {
    const saved = readControlBackup();
    if (saved) {
      const elapsed = Math.round((Date.now() - saved.savedAt) / 1000);
      setSelectedMatch(saved.match);
      setMatchDbId(saved.matchDbId);
      setRosters(saved.rosters ?? { home: [], away: [] });
      setTeamIds(saved.teamIds ?? { home: null, away: null });
      setPresence(saved.presence);
      setEventsByTeam(saved.eventsByTeam);
      setIncidents(saved.incidents);
      setReport(saved.report);
      setPaused(saved.paused);
      const waiting = saved.view === "waiting"
        ? Math.max(0, saved.waitingSeconds - elapsed)
        : saved.waitingSeconds;
      const live = saved.view === "live" && !saved.paused
        ? Math.max(0, saved.liveSeconds - elapsed)
        : saved.liveSeconds;
      setWaitingSeconds(waiting);
      setLiveSeconds(live);
      if (live === 0) setExtraTimeUnlocked(true);
      setView(saved.view);
    }
    setRestored(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── RESPALDAR: cada cambio de la mesa de control queda en localStorage ──
  useEffect(() => {
    if (!restored) return;
    try {
      if (view === "dashboard") return;
      const snapshot: PersistedControl = {
        version: 3,
        savedAt: Date.now(),
        view,
        match: selectedMatch,
        matchDbId,
        fieldNumber,
        teamIds,
        rosters,
        waitingSeconds,
        presence,
        liveSeconds,
        paused,
        eventsByTeam,
        incidents,
        report,
      };
      localStorage.setItem(SUPERVISOR_CACHE_KEY, JSON.stringify(snapshot));
    } catch {
      // sin espacio o modo privado: la mesa de control sigue funcionando
    }
  }, [restored, view, selectedMatch, matchDbId, fieldNumber, teamIds, rosters, waitingSeconds, presence, liveSeconds, paused, eventsByTeam, incidents, report]);

  useEffect(() => {
    if (view !== "waiting" || waitingSeconds === 0) return;
    const timer = window.setInterval(() => {
      setWaitingSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [view, waitingSeconds]);

  useEffect(() => {
    if (view !== "live" || paused || liveSeconds === 0) return;
    const timer = window.setInterval(() => {
      setLiveSeconds((current) => {
        if (current <= 1) {
          setExtraTimeUnlocked(true);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [view, paused, liveSeconds]);

  // El partido en curso REAL de esta cancha (EN_ESPERA o EN_JUEGO)
  const liveApi = apiMatches.find((m) => m.status === "EN_ESPERA" || m.status === "EN_JUEGO");
  const liveMatch = liveApi ? toCard(liveApi) : undefined;

  const upcomingCards = apiMatches.filter((m) => m.status === "PROGRAMADO").map(toCard);
  const finishedCards = apiMatches.filter((m) => m.status === "FINALIZADO").map(toCard);

  // El siguiente por jugar: es el único al que se le puede iniciar la espera
  const nextUpcomingId = !liveApi
    ? apiMatches.find((m) => m.status === "PROGRAMADO")?.id ?? null
    : null;

  const presenceCount = Number(presence.home) + Number(presence.away);
  const warningText =
    waitingSeconds > 240
      ? { text: "Esperando a los equipos... (Sin sanción)", tone: "text-slate-700" }
      : waitingSeconds > 120
        ? { text: "ALERTA: Sanción W · +1 gol a favor del equipo que llegó a tiempo", tone: "text-[#f7c600]" }
        : { text: "ALERTA: Sanción W · +2 goles a favor del equipo que llegó a tiempo", tone: "text-[#f83636]" };

  const waitingActionLabel =
    waitingSeconds === 0
      ? presenceCount === 0
        ? "Declarar doble walkover"
        : presenceCount === 1
          ? "Declarar walkover completo"
          : "Equipos en cancha"
      : "Equipos en cancha";

  async function lifecycleActionFor(id: number, action: string, extra?: Record<string, unknown>) {
    const res = await fetch(`/api/matches/${id}/lifecycle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, data };
  }

  async function lifecycleAction(action: string, extra?: Record<string, unknown>) {
    if (matchDbId == null) return { ok: false, data: null };
    return lifecycleActionFor(matchDbId, action, extra);
  }

  // Abre la mesa de control de un partido REAL, sincronizando el estado
  // local con el estado del servidor (espera / en juego / finalizado).
  async function beginMatchLifecycle(card: MatchCard) {
    if (busyAction) return;
    const apiMatch = apiMatches.find((m) => String(m.id) === card.id);
    if (!apiMatch) return;
    if (!apiMatch.team_a_id || !apiMatch.team_b_id) {
      notify("Este partido aún no tiene equipos definidos (se llenan al cerrar la fase anterior)", "err");
      return;
    }
    if (apiMatch.published_at) {
      notify("El acta ya fue publicada: solo un administrador puede modificarla", "err");
      return;
    }
    setBusyAction(true);
    try {
      const detail = await fetch(`/api/matches/${apiMatch.id}`).then((r) => r.json()).catch(() => null);
      const toRoster = (team: ApiTeamDetail): Player[] =>
        (team?.players ?? []).map((p) => ({ id: String(p.id), name: p.name, suspended: p.suspended }));

      let status = apiMatch.status;
      let waitingStartedAt = apiMatch.waiting_started_at;

      if (status === "PROGRAMADO") {
        const { ok, data } = await lifecycleActionFor(apiMatch.id, "start_waiting");
        if (!ok) {
          notify(data?.error ?? "No se pudo iniciar la espera", "err");
          return;
        }
        status = "EN_ESPERA";
        waitingStartedAt = data?.waiting_started_at ?? new Date().toISOString();
      }

      setSelectedMatch(card);
      setMatchDbId(apiMatch.id);
      setRosters({ home: toRoster(detail?.teamA ?? null), away: toRoster(detail?.teamB ?? null) });
      setTeamIds({ home: apiMatch.team_a_id, away: apiMatch.team_b_id });
      setPresence({ home: !!apiMatch.team_a_present_at, away: !!apiMatch.team_b_present_at });
      setEventsByTeam(hydrateEvents(detail?.events ?? [], apiMatch.team_a_id, apiMatch.team_b_id));
      setOpenEventMenu(null);
      setIncidentOpen(false);
      setIncidentDraft("");
      setIncidents([]);
      setReport(null);
      setShowSuccessPopup(false);
      setPaused(false);
      setExtraTimeUnlocked(false);

      if (status === "EN_ESPERA") {
        setWaitingSeconds(
          waitingStartedAt ? Math.max(0, waitingDuration - secondsSince(waitingStartedAt)) : waitingDuration
        );
        setLiveSeconds(matchDuration);
        setView("waiting");
      } else if (status === "EN_JUEGO") {
        setLiveSeconds(
          apiMatch.kickoff_at ? Math.max(0, matchDuration - secondsSince(apiMatch.kickoff_at)) : matchDuration
        );
        setView("live");
      } else if (status === "FINALIZADO") {
        const events = hydrateEvents(detail?.events ?? [], apiMatch.team_a_id, apiMatch.team_b_id);
        setEventsByTeam(events);
        setReport(
          buildReport({
            match: card,
            score: { home: apiMatch.score_a ?? 0, away: apiMatch.score_b ?? 0 },
            events,
            incidents: [],
            rosters: { home: toRoster(detail?.teamA ?? null), away: toRoster(detail?.teamB ?? null) },
            walkover: apiMatch.walkover ? `Walkover: ${apiMatch.walkover}` : undefined,
          })
        );
        setView("summary");
      }
    } finally {
      setBusyAction(false);
    }
  }

  // Marca la llegada de un equipo EN EL SERVIDOR (aplica sanción por retraso).
  async function togglePresence(team: TeamSide) {
    if (presence[team] || !matchDbId || busyAction) return;
    const { ok, data } = await lifecycleAction("team_present", { team: team === "home" ? "A" : "B" });
    if (!ok) {
      notify(data?.error ?? "No se pudo registrar la llegada del equipo", "err");
      return;
    }
    setPresence((current) => ({ ...current, [team]: true }));

    // Si la llegada generó sanción W, el servidor ya insertó los goles de
    // oficio: sumarlos al marcador local de inmediato (rival del tardío).
    if (data?.applied_sanction === "W_2MIN" || data?.applied_sanction === "W_4MIN") {
      const rival: TeamSide = team === "home" ? "away" : "home";
      const goles = data.applied_sanction === "W_4MIN" ? 2 : 1;
      setEventsByTeam((current) => ({
        ...current,
        [rival]: {
          ...current[rival],
          __oficio__: [
            ...(current[rival]["__oficio__"] ?? []),
            ...Array.from({ length: goles }, (_, i) => ({
              // eslint-disable-next-line react-hooks/purity -- handler de botón, nunca corre en render
              id: `oficio-${Date.now()}-${i}`,
              playerId: "__oficio__",
              team: rival,
              kind: "goal" as EventKind,
              minute: 0,
            })),
          ],
        },
      }));
      notify(`⚽ Sanción W aplicada: +${goles} gol${goles > 1 ? "es" : ""} para el equipo que llegó a tiempo`, "ok");
    }
  }

  // Registra el evento localmente y lo sincroniza con el servidor. Al confirmar,
  // reemplaza el id local por el id real del servidor (para poder quitarlo luego).
  function registerEvent(team: TeamSide, playerId: string, kind: EventKind) {
    const player = rosters[team].find((p) => p.id === playerId);
    const name = player?.name ?? "el jugador";

    // Bloqueo disciplinario: expulsado en este partido o suspendido de antes
    const hasRedHere = (eventsByTeam[team][playerId] ?? []).some((e) => e.kind === "red");
    if (hasRedHere) {
      notify(`🟥 ${name} está expulsado: no se le pueden registrar más eventos`, "err");
      return;
    }
    if (player?.suspended) {
      notify(`⛔ ${name} está suspendido por sanción: no puede jugar este partido`, "err");
      return;
    }

    const minute = Math.max(1, Math.ceil((matchDuration - liveSeconds) / 60));
    // eslint-disable-next-line react-hooks/purity -- corre solo en el handler del botón "+", nunca en render
    const localId = `${playerId}-${kind}-${Date.now()}`;
    const event: LiveEvent = { id: localId, playerId, team, kind, minute };

    setEventsByTeam((current) => ({
      ...current,
      [team]: {
        ...current[team],
        [playerId]: [...(current[team][playerId] ?? []), event],
      },
    }));

    const { icon, added } = EVENT_LABEL[kind];
    notify(
      kind === "red"
        ? `${icon} Roja registrada a ${name} — jugador bloqueado por expulsión`
        : `${icon} ${added} ${name} (min ${minute})`
    );

    const teamId = teamIds[team];
    if (matchDbId && teamId) {
      const type = kind === "goal" ? "GOL" : kind === "yellow" ? "AMARILLA" : "ROJA";
      fetch(`/api/matches/${matchDbId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, teamId, playerId: Number(playerId), minute }),
      })
        .then(async (res) => {
          const created = await res.json().catch(() => null);
          if (!res.ok) {
            notify(`El evento quedó local pero no se sincronizó: ${created?.error ?? `error ${res.status}`}`, "err");
            return;
          }
          // Reemplaza el id local por el id real del servidor
          if (created?.id != null) {
            setEventsByTeam((current) => ({
              ...current,
              [team]: {
                ...current[team],
                [playerId]: (current[team][playerId] ?? []).map((e) =>
                  e.id === localId ? { ...e, id: String(created.id) } : e
                ),
              },
            }));
          }
        })
        .catch(() => {
          notify("Sin conexión: el evento quedó guardado localmente y saldrá en el acta.", "err");
        });
    }
  }

  // Quita el ÚLTIMO evento de ese tipo del jugador (local + servidor si ya se sincronizó)
  function removeEvent(team: TeamSide, playerId: string, kind: EventKind) {
    const player = rosters[team].find((p) => p.id === playerId);
    const name = player?.name ?? "el jugador";
    const { icon, noun, removed } = EVENT_LABEL[kind];

    const list = eventsByTeam[team][playerId] ?? [];
    let idx = -1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].kind === kind) { idx = i; break; }
    }
    if (idx === -1) {
      notify(`${name} no tiene ${noun} para quitar`, "err");
      return;
    }
    const target = list[idx];

    setEventsByTeam((current) => {
      const arr = current[team][playerId] ?? [];
      return {
        ...current,
        [team]: { ...current[team], [playerId]: arr.filter((e) => e.id !== target.id) },
      };
    });

    notify(
      kind === "red"
        ? `${icon} Roja retirada a ${name} — jugador desbloqueado`
        : `${icon} ${removed} ${name}`
    );

    // Solo los eventos ya sincronizados tienen id numérico del servidor
    if (matchDbId && /^\d+$/.test(target.id)) {
      fetch(`/api/matches/${matchDbId}/events/${target.id}`, { method: "DELETE" }).catch(() => {
        // sin conexión: se quitó localmente, el acta local manda
      });
    }
  }

  function submitIncident() {
    if (!incidentDraft.trim()) return;
    const note = incidentDraft.trim();

    setIncidents((current) => [
      ...current,
      { id: `incident-${Date.now()}`, label: "Nota rápida del incidente", note },
    ]);
    setIncidentDraft("");
    setIncidentOpen(false);

    if (matchDbId) {
      fetch(`/api/matches/${matchDbId}/incidents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      }).catch(() => {
        // sin conexión: la nota sigue en el respaldo local
      });
    }
  }

  // Avanza desde la espera: kickoff si están los dos, walkover si se agotó la tolerancia.
  async function advanceWaiting() {
    if (!matchDbId || busyAction) return;
    setBusyAction(true);
    try {
      if (waitingSeconds === 0 && presenceCount < 2) {
        const { ok, data } = await lifecycleAction("declare_walkover");
        if (!ok) {
          notify(data?.error ?? "No se pudo declarar el walkover", "err");
          return;
        }
        const equipoPresente = presence.home ? selectedMatch?.homeTeam : selectedMatch?.awayTeam;
        const walkover = presenceCount === 0
          ? "Doble W: ningún equipo se presentó (sin puntos para ninguno)"
          : `🏆 Victoria por W 3-0 para ${equipoPresente ?? "el equipo presente"}`;
        setReport(
          buildReport({
            match: selectedMatch,
            score: { home: data?.score_a ?? 0, away: data?.score_b ?? 0 },
            events: eventsByTeam,
            incidents,
            rosters,
            walkover,
          })
        );
        setView("summary");
        return;
      }

      if (presenceCount < 2) {
        notify("Ambos equipos deben estar marcados como presentes para el kickoff", "err");
        return;
      }

      const { ok, data } = await lifecycleAction("kickoff");
      if (!ok) {
        notify(data?.error ?? "No se pudo iniciar el partido", "err");
        return;
      }
      setLiveSeconds(matchDuration);
      setView("live");
    } finally {
      setBusyAction(false);
    }
  }

  // Pitazo final: cierra el partido en el servidor y arma el resumen
  async function triggerManualFinish() {
    if (!matchDbId || busyAction) return;
    setBusyAction(true);
    try {
      const { ok, data } = await lifecycleAction("finish");
      if (!ok) {
        notify(data?.error ?? "No se pudo finalizar el partido", "err");
        return;
      }
      setReport(
        buildReport({
          match: selectedMatch,
          score: { home: data?.score_a ?? score.home, away: data?.score_b ?? score.away },
          events: eventsByTeam,
          incidents,
          rosters,
        })
      );
      setView("summary");
    } finally {
      setBusyAction(false);
    }
  }

  // Guardar y enviar = PUBLICAR el acta (bloquea la edición del supervisor)
  async function handleSaveAndSend() {
    if (busyAction) return;
    if (matchDbId != null) {
      setBusyAction(true);
      try {
        const { ok, data } = await lifecycleAction("publish");
        if (!ok) {
          notify(data?.error ?? "No se pudo enviar el acta", "err");
          return;
        }
      } finally {
        setBusyAction(false);
      }
    }
    setShowSuccessPopup(true);
  }

  // Volver al panel con la agenda actualizada (y limpiar el respaldo local)
  async function handleReturnToDashboard() {
    clearSupervisorCache();
    setShowSuccessPopup(false);
    setSelectedMatch(EMPTY_CARD);
    setMatchDbId(null);
    setReport(null);
    setView("dashboard");
    if (fieldNumber) await loadField(fieldNumber, myFields.includes(fieldNumber) ? myFields : [fieldNumber]);
  }

  async function handleLogout() {
    clearSupervisorCache(); // Limpia el partido guardado en el dispositivo
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null); // Destruye las cookies en el servidor
    window.location.href = "/panel"; // Redirige al login limpiando el estado global
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <style jsx global>{`
        @keyframes slideUp {
          from {
            transform: translateY(100px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes toastIn {
          from {
            transform: translateY(-16px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-toast-in {
          animation: toastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {/* TOAST SUPERIOR: confirmación de cada acción (sin popups del navegador) */}
      {toast && (
        <div key={toast.id} className="fixed top-4 inset-x-4 z-[70] mx-auto max-w-sm animate-toast-in pointer-events-none">
          <div
            className={`rounded-2xl bg-white/85 backdrop-blur-xl border border-white/40 shadow-[0_15px_35px_rgba(16,32,76,0.18)] px-4 py-3 flex items-center gap-2.5 relative overflow-hidden before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 ${toast.kind === "ok" ? "before:bg-emerald-500" : "before:bg-red-500"
              }`}
          >
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0 ${toast.kind === "ok" ? "bg-emerald-500" : "bg-red-500"
                }`}
            >
              {toast.kind === "ok" ? "✓" : "!"}
            </span>
            <p className="text-xs font-semibold text-[#10204c]/90 leading-snug">{toast.text}</p>
          </div>
        </div>
      )}

      <main className="flex-1 px-4 py-5 text-[15px] text-slate-800 sm:px-6 sm:py-6 md:px-8">
        <div className="mx-auto flex w-full flex-col gap-5 sm:gap-6">

          {/* VISTA DEL DASHBOARD / PANEL PRINCIPAL */}
          {view === "dashboard" && (
            <section className="flex flex-1 flex-col gap-6 w-full">
              <header className="sticky top-0 z-50 -mx-4 -mt-5 w-[calc(100%+2rem)] rounded-b-3xl bg-white/45 backdrop-blur-md border-b-2 border-white/40 shadow-[0_10px_30px_rgba(16,32,76,0.15),_0_1px_3px_rgba(16,32,76,0.1)] overflow-hidden font-poppins sm:-mx-6 sm:-mt-6 sm:w-[calc(100%+3rem)] md:-mx-8 md:w-[calc(100%+4rem)]">
                <div className="mx-auto w-full px-4 pt-5 pb-4 flex flex-col gap-4 sm:gap-5 sm:px-6 md:px-8">
                  <div className="flex items-center justify-between w-full gap-1">
                    <div className="flex flex-1 min-w-0 items-center justify-start">
                      <NextImage
                        src="/assets/Logo_tMtCup.svg"
                        alt="Logo oficial TMT CUP"
                        width={85}
                        height={85}
                        className="h-14 w-14 object-contain drop-shadow-sm sm:h-[72px] sm:w-[72px] md:h-[85px] md:w-[85px]"
                      />
                    </div>
                    <div onClick={cycleField} className="flex shrink-0 flex-col items-center justify-center font-poppins px-1">
                      <div className="mb-1 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-[#10204c] shadow-xl sm:mb-1.5 sm:h-20 sm:w-20">
                        <span className="font-secondary-modak mt-1 text-4xl leading-none text-white sm:text-5xl">
                          {fieldNumber ?? "1"}
                        </span>
                      </div>
                      <span className="text-[13px] font-medium leading-none tracking-wide text-[#10204c] sm:text-[15px]">
                        Cancha
                      </span>
                    </div>
                    <div className="flex flex-1 min-w-0 flex-col items-end justify-center pl-1 text-right sm:pl-2">
                      <span className="mb-0.5 truncate text-[10px] font-bold leading-none text-[#233c97]/50">
                        Supervisor
                      </span>
                      <h3 className="w-full truncate text-sm font-black leading-tight text-[#10204c] sm:text-base">
                        {supervisorName || "—"}
                      </h3>
                      <p className="mt-1 w-full truncate text-[10px] font-medium text-[#10204c]/60 sm:text-[11px]">
                        <span className="font-bold text-[#233c97]/70">Árb:</span> {refereeName || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="w-full h-[1px] bg-[#10204c]/5" />
                  <div className="w-full flex justify-center">
                    <nav className="w-full max-w-[210px] flex p-1 bg-[#10204c]/[0.05] rounded-full shadow-[inset_0_2px_4px_rgba(16,32,76,0.04)] border border-[#10204c]/[0.01] items-center px-1">
                      {["Próximos", "Finalizados"].map((tabLabel) => {
                        const tabValue = tabLabel === "Próximos" ? "upcoming" : "finished";
                        const isActive = activeFilter === tabValue;
                        return (
                          <button
                            key={tabLabel}
                            type="button"
                            onClick={() => setActiveFilter(tabValue as Filter)}
                            className={`
                              flex-1 py-1.5 text-[11px] font-bold rounded-full transition-all duration-200 select-none outline-none text-center whitespace-nowrap
                              ${isActive
                                ? "bg-white text-[#233c97] shadow-[0_3px_8px_rgba(16,32,76,0.08)] border border-white font-extrabold scale-[1.01]"
                                : "text-[#10204c]/50 hover:text-[#10204c]/80"
                              }
                              active:scale-[0.97] transition-transform
                            `}
                          >
                            {tabLabel}
                          </button>
                        );
                      })}
                    </nav>
                  </div>
                </div>
              </header>

              {liveMatch ? (
                <MatchCardContainer
                  match={liveMatch}
                  onAction={() => beginMatchLifecycle(liveMatch)}
                />
              ) : (
                <div className="p-4 text-center rounded-2xl bg-[var(--background)]/50 text-[var(--foreground)]/40 italic text-xs border border-dashed border-[var(--border)]">
                  No hay ningún partido en vivo en juego en este momento.
                </div>
              )}

              <div className="flex-1 overflow-hidden relative pb-6">
                <div
                  className="flex w-[200%] transition-transform duration-500 ease-in-out"
                  style={{
                    transform: activeFilter === "upcoming" ? "translateX(0%)" : "translateX(-50%)"
                  }}
                >
                  <div className="w-1/2 pr-2 shrink-0">
                    <div className="space-y-4">
                      {upcomingCards.length > 0 ? (
                        upcomingCards.map((c) => (
                          <MatchCardContainer
                            key={c.id}
                            match={c}
                            onAction={
                              nextUpcomingId != null && String(nextUpcomingId) === c.id
                                ? () => beginMatchLifecycle(c)
                                : undefined
                            }
                          />
                        ))
                      ) : (
                        <div className="p-4 text-center rounded-2xl bg-[var(--background)]/50 text-[var(--foreground)]/40 italic text-xs border border-dashed border-[var(--border)]">
                          No hay partidos próximos para mostrar.
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="w-1/2 pl-2 shrink-0">
                    <div className="space-y-4">
                      {finishedCards.length > 0 ? (
                        finishedCards.map((c) => (
                          <MatchCardContainer key={c.id} match={c} />
                        ))
                      ) : (
                        <div className="p-4 text-center rounded-2xl bg-[var(--background)]/50 text-[var(--foreground)]/40 italic text-xs border border-dashed border-[var(--border)]">
                          No hay partidos finalizados para mostrar.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {/* BOTÓN FLOTANTE CERRAR SESIÓN (Solo Dashboard - Rojo) */}
              <div className="fixed bottom-6 right-6 z-40">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="h-14 w-14 shrink-0 rounded-full bg-red-600 text-white shadow-[0_8px_30px_rgba(220,38,38,0.4)] flex items-center justify-center border border-white/20 active:scale-95 transition-all duration-200"
                  aria-label="Cerrar sesión"
                  title="Cerrar sesión"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                </button>
              </div>
            </section>
          )}

          {/* VISTA MODO DE ESPERA */}
          {view === "waiting" && (
            <section className="flex flex-1 flex-col gap-6 font-poppins w-full relative min-h-[75vh] px-1 overflow-hidden">
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-0 select-none">
                <NextImage
                  src="/assets/Logo_tMtCup.svg"
                  alt="Fondo oficial TMT CUP"
                  width={320}
                  height={320}
                  className="object-contain max-w-[80vw]"
                  style={{ height: "auto" }}
                />
              </div>

              <div className="z-10 rounded-[2.5rem] bg-white/45 backdrop-blur-md border-2 border-white/40 p-4 shadow-[0_12px_35px_rgba(16,32,76,0.12)] text-center relative overflow-hidden sm:p-6">
                <div className="flex items-center justify-between w-full mb-3 gap-2">
                  <div className="bg-[#10204c] text-white text-[11px] font-weight px-3 py-1 rounded-full shadow-xs tracking-wide whitespace-nowrap sm:text-[12px]">
                    Prog: {selectedMatch.time}
                  </div>
                  <span className="text-[11px] font-weight tracking-wider text-[#10204c]/50 bg-[#10204c]/5 px-2.5 py-1 rounded-full truncate sm:text-[12px]">
                    {selectedMatch.phase}
                  </span>
                </div>
                <div className="py-2">
                  <div className="font-secondary-modak text-6xl text-[#10204c] tracking-tight leading-none drop-shadow-[0_2px_12px_rgba(16,32,76,0.06)] min-[375px]:text-7xl min-[425px]:text-8xl">
                    {formatClock(waitingSeconds)}
                  </div>
                </div>
              </div>

              <div className="z-10 grid grid-cols-2 gap-4">
                {([
                  { key: "home", label: selectedMatch.homeTeam },
                  { key: "away", label: selectedMatch.awayTeam },
                ] as const).map((team) => (
                  <TeamPresenceCard
                    key={team.key}
                    label={team.label}
                    isPresent={presence[team.key]}
                    onToggle={() => togglePresence(team.key)}
                  />
                ))}
              </div>

              {warningText.text && (
                <ControlAlertPopup
                  text={warningText.text}
                  tone={warningText.tone}
                  isCritical={waitingSeconds === 0 && presenceCount < 2}
                  homeTeam={selectedMatch.homeTeam}
                  awayTeam={selectedMatch.awayTeam}
                  presence={presence}
                />
              )}

              <div className="mt-auto z-10 w-full flex justify-center px-1 py-4">
                <button
                  type="button"
                  onClick={advanceWaiting}
                  className={`w-fit h-[3.75rem] rounded-full px-8 text-base font-black text-white shadow-lg transition-all duration-200 active:scale-[0.98] border border-white/20 flex items-center justify-center ${waitingSeconds === 0 && presenceCount < 2
                    ? "bg-red-600 shadow-red-600/20"
                    : "bg-[#E11D48] shadow-[#E11D48]/20"
                    }`}
                >
                  {waitingActionLabel}
                </button>
              </div>
            </section>
          )}

          {/* VISTA PARTIDO EN VIVO */}
          {view === "live" && (
            <section className="flex flex-1 flex-col gap-6 font-poppins w-full relative min-h-[75vh] px-2 py-4 pb-24">
              <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-0 select-none">
                <NextImage
                  src="/assets/Logo_tMtCup.svg"
                  alt="Fondo oficial TMT CUP"
                  width={320}
                  height={320}
                  className="object-contain max-w-[80vw]"
                  style={{ height: "auto" }}
                />
              </div>

              <div className="z-10 rounded-[2.5rem] bg-white/45 backdrop-blur-md border-2 border-white/40 p-4 shadow-[0_12px_35px_rgba(16,32,76,0.15)] relative sm:p-6">
                <div className="flex items-center justify-between w-full mb-4 gap-2">
                  <div className="bg-[#10204c] text-white text-[10px] font-medium px-3 py-1 rounded-full tracking-wider truncate">
                    {selectedMatch.phase}
                  </div>
                  <span className="text-[10px] font-medium tracking-widest text-[#10204c]/50 bg-[#10204c]/5 px-3 py-1 rounded-full whitespace-nowrap">
                    Cancha {fieldNumber ?? "1"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 mb-5 sm:gap-4">
                  <div className="font-secondary-modak text-5xl text-[#10204c] tracking-tight leading-none min-[375px]:text-6xl">
                    {formatClock(liveSeconds)}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPaused(!paused)}
                    className="w-11 h-11 rounded-full bg-[#10204c] text-white flex items-center justify-center shadow-lg active:scale-[0.95] transition-transform shrink-0 sm:w-12 sm:h-12"
                  >
                    {paused ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                    )}
                  </button>
                </div>

                <div className="border-t border-[#10204c]/10 pt-5 flex justify-center items-center gap-3 sm:gap-6">
                  <div className="w-10 h-10 rounded-full bg-white/60 border border-[#10204c]/15 shadow-sm flex items-center justify-center shrink-0 sm:w-12 sm:h-12 overflow-hidden">
                    {teamFlagSrc(selectedMatch.homeTeam) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={teamFlagSrc(selectedMatch.homeTeam)!} alt={selectedMatch.homeTeam} className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <span className="text-xs text-[#10204c]/65 font-bold">{selectedMatch.homeTeam[0] ?? "L"}</span>
                    )}
                  </div>

                  <div className="font-secondary-modak text-5xl text-[#10204c] tracking-[0.05em] select-none min-w-[92px] text-center min-[375px]:text-6xl min-[375px]:min-w-[112px] sm:text-7xl sm:min-w-[140px]">
                    {score.home} - {score.away}
                  </div>

                  <div className="w-10 h-10 rounded-full bg-white/60 border border-[#10204c]/15 shadow-sm flex items-center justify-center shrink-0 sm:w-12 sm:h-12 overflow-hidden">
                    {teamFlagSrc(selectedMatch.awayTeam) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={teamFlagSrc(selectedMatch.awayTeam)!} alt={selectedMatch.awayTeam} className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <span className="text-xs text-[#10204c]/65 font-bold">{selectedMatch.awayTeam[0] ?? "V"}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="z-10 grid gap-6 md:grid-cols-2 md:items-start">
                {[{ title: selectedMatch.homeTeam, side: "home" as const, players: rosters.home },
                { title: selectedMatch.awayTeam, side: "away" as const, players: rosters.away }].map((team) => (
                  <div key={team.side} className="rounded-[1.6rem] border border-slate-200 bg-white/80 backdrop-blur-sm p-3.5 shadow-sm sm:p-5">
                    <div className="flex items-center justify-center gap-3 mb-5 w-full">
                      <div className="w-11 h-11 rounded-full bg-white border border-[#10204c]/10 flex items-center justify-center shadow-xs">
                        {teamFlagSrc(team.title) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={teamFlagSrc(team.title)!} alt="" className="w-full h-full object-cover rounded-full" />
                        ) : (
                          <span className="text-sm text-[#10204c]/50 font-black uppercase">{team.title[0]}</span>
                        )}
                      </div>
                      <h3 className="text-2xl font-light tracking-wide text-[#10204c] text-center">
                        {team.title}
                      </h3>
                    </div>

                    <div className="space-y-2.5">
                      {team.players.map((player) => {
                        const isOpen = openEventMenu?.playerId === player.id && openEventMenu.team === team.side;
                        const playerEvents = eventsByTeam[team.side][player.id] ?? [];
                        // Roja en ESTE partido → tarjeta opacada y sin poder agregar
                        const sentOff = playerEvents.some((e) => e.kind === "red");
                        const blocked = sentOff || !!player.suspended;
                        return (
                          <div key={player.id} className={`rounded-[1.25rem] border border-slate-200 bg-white px-2.5 py-3 flex flex-col gap-2 transition-all w-full overflow-hidden sm:px-3.5 ${blocked ? "opacity-50 grayscale-[0.6] bg-slate-100" : ""}`}>
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-slate-800 truncate pr-2">
                                {player.name}
                                {blocked && (
                                  <span className="ml-2 align-middle text-[9px] font-black tracking-wider text-red-600">
                                    {sentOff ? "🟥 EXPULSADO" : "⛔ SUSPENDIDO"}
                                  </span>
                                )}
                              </span>
                              <button
                                type="button"
                                disabled={!!player.suspended}
                                onClick={() => setOpenEventMenu(isOpen ? null : { team: team.side, playerId: player.id })}
                                className="h-9 w-9 rounded-full bg-[#10204c]/5 hover:bg-[#10204c]/10 text-[#10204c] flex items-center justify-center transition-all shrink-0 disabled:opacity-40 disabled:pointer-events-none"
                              >
                                <svg className={`w-4 h-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                              </button>
                            </div>

                            {/* Línea de tiempo del jugador: sus eventos con el minuto */}
                            {playerEvents.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {playerEvents.map((ev) => (
                                  <span
                                    key={ev.id}
                                    className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 select-none"
                                  >
                                    {EVENT_LABEL[ev.kind].icon} {ev.minute}&apos;
                                  </span>
                                ))}
                              </div>
                            )}

                            {isOpen && (
                              <div className="flex flex-wrap gap-1.5 mt-2 w-full justify-center items-center">
                                {[
                                  { icon: "⚽", type: "goal" },
                                  { icon: "🟨", type: "yellow" },
                                  { icon: "🟥", type: "red" }
                                ].map((act) => (
                                  <div key={act.type} className="flex items-center gap-1 px-1.5 py-1 rounded-full border border-slate-200 bg-slate-100 text-slate-700 shrink-0 sm:gap-1.5 sm:px-2">
                                    <button
                                      type="button"
                                      onClick={() => removeEvent(team.side, player.id, act.type as EventKind)}
                                      className="w-5 h-5 rounded-full bg-white hover:bg-slate-200 text-slate-800 flex items-center justify-center font-bold text-xs shadow-xs border border-slate-300/40 active:scale-90 transition-transform shrink-0 sm:w-6 sm:h-6 sm:text-sm"
                                    >
                                      <span className="leading-none mt-[-2px]">-</span>
                                    </button>
                                    <span className="text-[11px] select-none shrink-0 sm:text-xs">{act.icon}</span>
                                    <button
                                      type="button"
                                      disabled={blocked}
                                      onClick={() => registerEvent(team.side, player.id, act.type as EventKind)}
                                      className="w-5 h-5 rounded-full bg-white hover:bg-slate-200 text-slate-800 flex items-center justify-center font-bold text-xs shadow-xs border border-slate-300/40 active:scale-90 transition-transform shrink-0 sm:w-6 sm:h-6 sm:text-sm disabled:opacity-30 disabled:pointer-events-none"
                                    >
                                      <span className="leading-none mt-[-1px]">+</span>
                                    </button>
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

              {/* ÁREA DE BOTONES DE ACCIÓN INFERIORES FLOTANTES */}
              <div className="fixed bottom-6 left-6 right-6 z-40 flex items-center justify-between gap-3">
                <div className="flex-1 min-h-[56px] flex items-center">
                  {/* El botón de finalizar SOLO aparece cuando se termina el
                      tiempo del partido (cronómetro en 0). */}
                  {liveSeconds === 0 && (
                  <button
                    type="button"
                    onClick={() => setConfirmFinish(true)}
                    className="animate-slide-up w-full h-14 rounded-full bg-[#10204c] text-white font-bold text-sm shadow-[0_8px_30px_rgba(16,32,76,0.3)] flex items-center justify-center border border-white/20 active:scale-95 transition-all duration-200"
                  >
                    Finalizar encuentro
                  </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setIncidentOpen(true)}
                  className="h-14 w-14 shrink-0 rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-[0_8px_30px_rgba(248,54,54,0.4)] flex items-center justify-center border border-white/20 active:scale-95 transition-all duration-200"
                  aria-label="Reportar incidente"
                >
                  <svg
                    className="w-6 h-6 animate-pulse"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </button>
              </div>
            </section>
          )}

          {/* VISTA RESUMEN DEL PARTIDO */}
          {view === "summary" && report && (
            <section className="flex flex-1 flex-col gap-6 font-poppins w-full relative min-h-[75vh] px-1 overflow-hidden pb-10">
              {/* MARCA DE AGUA */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-0 select-none">
                <NextImage
                  src="/assets/Logo_tMtCup.svg"
                  alt="Fondo oficial TMT CUP"
                  width={320}
                  height={320}
                  className="object-contain max-w-[80vw]"
                  style={{ height: "auto" }}
                />
              </div>

              {/* CABECERA CENTRADA CON ESTILO TARJETA ESPERA */}
              <div className="z-10 rounded-[2.5rem] bg-white/45 backdrop-blur-md border-2 border-white/40 p-5 shadow-[0_12px_35px_rgba(16,32,76,0.12)] text-center relative overflow-hidden flex flex-col items-center justify-center">
                <div className="flex items-center justify-center w-full mb-3 gap-2">
                  <span className="text-[11px] font-weight tracking-wider text-[#10204c]/50 bg-[#10204c]/5 px-2.5 py-1 rounded-full truncate">
                    {report.subtitle}
                  </span>
                </div>

                <div className="py-2 flex flex-col items-center justify-center">
                  <div className="flex items-center justify-center gap-3 sm:gap-5">
                    <div className="w-10 h-10 rounded-full bg-white/60 border border-[#10204c]/15 shadow-sm flex items-center justify-center shrink-0 sm:w-12 sm:h-12 overflow-hidden">
                      {teamFlagSrc(selectedMatch.homeTeam) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={teamFlagSrc(selectedMatch.homeTeam)!} alt={selectedMatch.homeTeam} className="w-full h-full object-cover rounded-full" />
                      ) : (
                        <span className="text-xs text-[#10204c]/65 font-bold">{selectedMatch.homeTeam[0] ?? "L"}</span>
                      )}
                    </div>
                    <div className="font-secondary-modak text-6xl text-[#10204c] tracking-tight leading-none drop-shadow-[0_2px_12px_rgba(16,32,76,0.06)] min-[375px]:text-7xl">
                      {report.score}
                    </div>
                    <div className="w-10 h-10 rounded-full bg-white/60 border border-[#10204c]/15 shadow-sm flex items-center justify-center shrink-0 sm:w-12 sm:h-12 overflow-hidden">
                      {teamFlagSrc(selectedMatch.awayTeam) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={teamFlagSrc(selectedMatch.awayTeam)!} alt={selectedMatch.awayTeam} className="w-full h-full object-cover rounded-full" />
                      ) : (
                        <span className="text-xs text-[#10204c]/65 font-bold">{selectedMatch.awayTeam[0] ?? "V"}</span>
                      )}
                    </div>
                  </div>
                  <p className="mt-3 text-lg font-light tracking-wide text-[#10204c] sm:text-xl text-center">
                    {report.title}
                  </p>
                  {report.walkover && (
                    <span className="mt-3 text-xs font-black tracking-wide text-white bg-[#10204c] px-4 py-1.5 rounded-full shadow-md">
                      {report.walkover}
                    </span>
                  )}
                </div>
              </div>

              {/* LISTADOS DE SUCESOS */}
              <div className="z-10 space-y-4">
                <SummarySection title="Goles">
                  {report.goals.length === 0 ? (
                    <SummaryEmpty>No se registraron goles en el encuentro.</SummaryEmpty>
                  ) : (
                    report.goals.map((goal, index) => (
                      <SummaryRow key={`${goal.label}-${index}`} primary={goal.label} secondary={goal.team} accent="⚽ Gol" />
                    ))
                  )}
                </SummarySection>

                <SummarySection title="Sanciones / Tarjetas">
                  {report.cards.length === 0 ? (
                    <SummaryEmpty>Limpio de amonestaciones.</SummaryEmpty>
                  ) : (
                    report.cards.map((card, index) => {
                      const isRed = card.label.toLowerCase().includes("roja");
                      return (
                        <SummaryRow
                          key={`${card.label}-${index}`}
                          primary={card.label}
                          secondary={card.team}
                          accent={isRed ? "🟥 Expulsión" : "🟨 Amarilla"}
                        />
                      );
                    })
                  )}
                </SummarySection>
              </div>

              {/* ACCIÓN DE ENVÍO - BOTÓN AJUSTADO AL TEXTO */}
              <div className="mt-auto z-10 w-full flex justify-center px-1 py-4">
                <button
                  type="button"
                  onClick={handleSaveAndSend}
                  className="w-auto h-[3.75rem] rounded-full px-10 text-base font-black text-white shadow-lg transition-all duration-200 active:scale-[0.98] border border-white/20 flex items-center justify-center gap-2 bg-[#E11D48] hover:bg-[#F43F5E] shadow-[#E11D48]/20"
                >
                  Guardar y enviar a mesa
                </button>
              </div>
            </section>
          )}
        </div>

        {/* MODAL DE INCIDENTES RÁPIDOS */}
        {incidentOpen && (
          <div className="fixed inset-0 z-45 flex items-end justify-center bg-slate-950/45 px-4 py-4 backdrop-blur-sm sm:items-center">
            <div className="w-full max-w-md rounded-[1.8rem] bg-white/80 backdrop-blur-xl p-4 shadow-2xl sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-medium text-[#10204c] sm:text-xl">Reportar incidente</h3>
                <button type="button" onClick={() => setIncidentOpen(false)} className="shrink-0 text-xs font-semibold text-slate-500 hover:text-slate-800 sm:text-sm">
                  Cerrar
                </button>
              </div>
              <textarea
                value={incidentDraft}
                onChange={(event) => setIncidentDraft(event.target.value)}
                placeholder="Escribe los detalles aquí..."
                className="mt-3 h-28 w-full rounded-[1.2rem] border border-slate-200 p-3 text-sm outline-none resize-none focus:border-[#10204c] sm:mt-4 sm:h-32 sm:p-4"
              />
              <div className="mt-3 flex justify-center sm:mt-4 sm:justify-end">
                <button
                  type="button"
                  onClick={submitIncident}
                  className="h-11 rounded-full bg-red-600 px-6 text-xs font-semibold text-white shadow-md sm:h-12 sm:px-8 sm:text-sm"
                >
                  Guardar nota del incidente
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CONFIRMACIÓN PERSONALIZADA DEL PITAZO FINAL */}
        {confirmFinish && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-[2rem] bg-white/80 backdrop-blur-xl p-6 text-center shadow-2xl border border-white/50 flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-[#10204c]/10 text-[#10204c] flex items-center justify-center">
                <svg
                  className="w-7 h-7"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-[#10204c]">¿Finalizar el encuentro?</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Se cierra el partido con el marcador {score.home} - {score.away} y pasa al resumen del acta.
                </p>
              </div>
              <div className="w-full flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmFinish(false)}
                  className="flex-1 h-12 rounded-full border-2 border-[#10204c]/15 bg-white text-[#10204c] text-sm font-bold transition-all active:scale-[0.98]"
                >
                  Seguir jugando
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmFinish(false);
                    void triggerManualFinish();
                  }}
                  className="flex-1 h-12 rounded-full bg-[#10204c] text-white text-sm font-bold shadow-md transition-all active:scale-[0.98]"
                >
                  Finalizar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* POPUP DE CONFIRMACIÓN DE ENVÍO */}
        {showSuccessPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-[2rem] bg-white/80 backdrop-blur-xl p-6 text-center shadow-2xl border border-white/50 flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <svg
                  className="w-7 h-7"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-[#10204c]">¡Enviado con éxito!</h3>
                <p className="text-xs text-slate-500 mt-1">Los datos del partido han sido registrados y enviados correctamente a la mesa principal.</p>
              </div>
              <button
                type="button"
                onClick={handleReturnToDashboard}
                className="w-full h-12 rounded-full bg-[#10204c] text-white text-sm font-bold shadow-md hover:bg-[#1a2f6a] transition-all active:scale-[0.98]"
              >
                Volver al Panel Principal
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
