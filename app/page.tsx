"use client";

import { useState, useRef, useEffect } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { teamFlagSrc } from "@/lib/flags";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { TablaGrupo } from "./components/TablaGrupo";
import { TarjetaPartido } from "./components/TarjetaPartido";
import FixtureEliminatoria from "./components/FixtureEliminatoria";
import EdicionesPasadas from "./components/EdicionesPasadas";

// ── Datos en vivo desde el backend ──────────────────────────
type StandingRow = {
  teamId: number;
  team: string;
  flag: string | null;
  pj: number;
  pg: number;
  pe: number;
  pp: number;
  gf: number;
  gc: number;
  dg: number;
  pts: number;
  amarillas: number;
  rojas: number;
};

type GroupStanding = {
  group: string;
  cancha: number;
  tabla: StandingRow[];
};

type ApiEvent = {
  id: number;
  type: string;
  minute: number | null;
  team_id: number;
  player: { id: number; name: string } | null;
};

type ApiMatch = {
  id: number;
  phase: string;
  status: string;
  field_number: number;
  scheduled_at: string;
  team_a_id: number;
  team_b_id: number;
  score_a: number | null;
  score_b: number | null;
  kickoff_at: string | null;
  walkover: string | null;
  teamA: { name: string; flag: string | null } | null;
  teamB: { name: string; flag: string | null } | null;
  events?: ApiEvent[];
};

export type BracketCard = {
  id: number;
  category: "MASCULINO" | "FEMENINO" | null;
  phase: "CUARTOS" | "SEMIFINAL" | "FINAL";
  fecha: string;
  estado: "FIN" | "VIVO" | "PROXIMO";
  equipoLocal: string | null;
  flagLocal: string | null;
  golesLocal?: number;
  penalesLocal?: number;
  equipoVisita: string | null;
  flagVisita: string | null;
  golesVisita?: number;
  penalesVisita?: number;
};

type BracketData = {
  cuartos: BracketCard[];
  semifinales: BracketCard[];
  finales: BracketCard[];
};

const phaseLabels: Record<string, string> = {
  GRUPOS: "Fase de Grupos",
  CUARTOS: "Cuartos de Final",
  SEMIFINAL: "Semifinal",
  FINAL: "Final",
};

function toTarjetaProps(m: ApiMatch) {
  const estado =
    m.status === "FINALIZADO" ? ("FINALIZADO" as const)
      : m.status === "PROGRAMADO" ? ("PROXIMO" as const)
        : ("VIVO" as const);

  const resumen = (m.events ?? [])
    .slice()
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0))
    .map((e) => ({
      minuto: `${e.minute ?? 0}'`,
      texto: e.player?.name ?? "Gol de oficio",
      tipo: (e.type === "GOL" ? "gol" : e.type === "AMARILLA" ? "amarilla" : "roja") as
        "gol" | "amarilla" | "roja",
      lado: (e.team_id === m.team_a_id ? "local" : "visitante") as "local" | "visitante",
    }));

  const minuto =
    estado === "VIVO" && m.kickoff_at
      ? `${Math.max(1, Math.floor((Date.now() - new Date(m.kickoff_at).getTime()) / 60000))}'`
      : undefined;

  return {
    liga: phaseLabels[m.phase] ?? m.phase,
    cancha: `Cancha ${m.field_number}`,
    estado,
    minuto,
    fechaHora: new Date(m.scheduled_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
    equipoLocal: m.teamA?.name ?? "Equipo A",
    logoLocal: teamFlagSrc(m.teamA?.name) ?? undefined,
    golesLocal: m.score_a ?? 0,
    equipoVisita: m.teamB?.name ?? "Equipo B",
    logoVisita: teamFlagSrc(m.teamB?.name) ?? undefined,
    golesVisita: m.score_b ?? 0,
    resumen,
  };
}

// ── Componente para los Subtítulos/Cuadritos Categorizados ──
function SubtituloPartidos({
  titulo,
  tipo,
  genero,
}: {
  titulo: string;
  tipo: "VIVO" | "PROXIMO" | "FINALIZADO";
  genero: "masculino" | "femenino";
}) {
  const isMasculino = genero === "masculino";

  const badgeConfig = {
    VIVO: {
      border: "border-red-500/30",
      bg: "bg-red-500/10",
      text: "text-red-600 dark:text-red-400",
      icon: null,
      dot: "bg-red-500 animate-ping",
    },
    PROXIMO: {
      border: isMasculino ? "border-[#233c97]/25" : "border-[#7c3aed]/25",
      bg: isMasculino ? "bg-[#233c97]/5" : "bg-[#7c3aed]/5",
      text: isMasculino ? "text-[#233c97]" : "text-[#7c3aed]",
      icon: "schedule",
      dot: null,
    },
    FINALIZADO: {
      border: isMasculino ? "border-[#10204c]/25" : "border-[#7c3aed]/25",
      bg: isMasculino ? "bg-[#10204c]/5" : "bg-[#7c3aed]/5",
      text: isMasculino ? "text-[#10204c]" : "text-[#7c3aed]",
      icon: "sports_soccer",
      dot: null,
    },
  }[tipo];

  return (
    <div className="w-full flex justify-center pt-3 pb-1">
      <div
        className={`px-5 py-1.5 rounded-full border shadow-sm flex items-center gap-2.5 backdrop-blur-md transition-all ${badgeConfig.border} ${badgeConfig.bg}`}
      >
        {badgeConfig.dot && (
          <span className="relative flex h-2.5 w-2.5">
            <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${badgeConfig.dot}`}></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"></span>
          </span>
        )}

        {badgeConfig.icon && (
          <span className={`material-symbols-outlined !text-[20px] ${badgeConfig.text}`}>
            {badgeConfig.icon}
          </span>
        )}

        <span className={`text-sm md:text-base font-medium tracking-normal font-poppins ${badgeConfig.text}`}>
          {titulo}
        </span>
      </div>
    </div>
  );
}

// ── RENDERIZADOR DE PARTIDOS ORGANIZADOS POR SECCIÓN ──
function ListaPartidosSeccionados({
  partidos,
  genero,
}: {
  partidos: ApiMatch[];
  genero: "masculino" | "femenino";
}) {
  const partidosVivo = partidos.filter((m) => m.status !== "FINALIZADO" && m.status !== "PROGRAMADO");
  const partidosProximos = partidos.filter((m) => m.status === "PROGRAMADO");
  const partidosFinalizados = partidos.filter((m) => m.status === "FINALIZADO");

  if (partidos.length === 0) {
    return (
      <div className="w-full text-center py-8 text-slate-400 text-sm">
        No hay partidos programados para este torneo.
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* 1. SECCIÓN EN VIVO */}
      {partidosVivo.length > 0 && (
        <div className="space-y-3">
          <SubtituloPartidos titulo="Partidos en Vivo" tipo="VIVO" genero={genero} />
          {partidosVivo.map((m) => (
            <TarjetaPartido key={m.id} {...toTarjetaProps(m)} genero={genero} />
          ))}
        </div>
      )}

      {/* 2. SECCIÓN PRÓXIMOS */}
      {partidosProximos.length > 0 && (
        <div className="space-y-3">
          <SubtituloPartidos titulo="Próximos Partidos" tipo="PROXIMO" genero={genero} />
          {partidosProximos.map((m) => (
            <TarjetaPartido key={m.id} {...toTarjetaProps(m)} genero={genero} />
          ))}
        </div>
      )}

      {/* 3. SECCIÓN FINALIZADOS */}
      {partidosFinalizados.length > 0 && (
        <div className="space-y-3">
          <SubtituloPartidos titulo="Partidos Finalizados" tipo="FINALIZADO" genero={genero} />
          {partidosFinalizados.map((m) => (
            <TarjetaPartido key={m.id} {...toTarjetaProps(m)} genero={genero} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PublicLivePage() {
  const [standings, setStandings] = useState<GroupStanding[]>([]);
  const [liveMatches, setLiveMatches] = useState<ApiMatch[]>([]);
  const [bracket, setBracket] = useState<BracketData | null>(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const [generoMovil, setGeneroMovil] = useState<"masculino" | "femenino">("masculino");
  const carruselRef = useRef<HTMLDivElement>(null);

  // ── Funciones de carga de datos ──
  // Guardas Array.isArray: si un API responde {error}, la vista degrada con
  // listas vacías en vez de reventar entera (".filter of non-array").
  const fetchMatches = () => {
    fetch("/api/matches")
      .then((r) => r.json())
      .then((d) => setLiveMatches(Array.isArray(d) ? d : []))
      .catch(console.error);
  };

  const fetchStandings = () => {
    fetch("/api/standings")
      .then((r) => r.json())
      .then((d) => setStandings(Array.isArray(d) ? d : []))
      .catch(console.error);
  };

  const fetchBrackets = () => {
    fetch("/api/brackets")
      .then((r) => r.json())
      .then((d) => setBracket(d && typeof d === "object" && !("error" in d) ? d : null))
      .catch(console.error);
  };

  // ── Suscripción en Tiempo Real vía WebSockets (con respaldo de sondeo) ──
  // El evento de Realtime es solo un "timbre": los datos SIEMPRE se recargan
  // por los APIs del servidor. Si el websocket no está disponible (faltan las
  // variables públicas, Realtime caído, red del colegio bloqueando WS...),
  // la vista sigue viva sondeando cada 15 segundos.
  useEffect(() => {
    // 1. Carga inicial
    fetchMatches();
    fetchStandings();
    fetchBrackets();

    let disposed = false;
    let poller: number | null = null;
    const startPolling = () => {
      if (disposed || poller != null) return;
      poller = window.setInterval(() => {
        fetchMatches();
        fetchStandings();
        fetchBrackets();
      }, 15000);
    };
    const stopPolling = () => {
      if (poller != null) {
        window.clearInterval(poller);
        poller = null;
      }
    };

    // 2. Conexión Realtime con la llave PÚBLICA (anon) del navegador.
    //    (El cliente de servidor con service_role jamás debe llegar aquí.)
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      startPolling();
      return () => {
        disposed = true;
        stopPolling();
      };
    }

    const channel = supabase
      .channel("public-live-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        () => {
          fetchMatches();
          fetchStandings();
          fetchBrackets();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_events" },
        () => {
          fetchMatches();
          fetchStandings();
        }
      )
      .subscribe((status) => {
        if (disposed) return;
        // Conectado: los websockets mandan; sin sondeo duplicado
        if (status === "SUBSCRIBED") stopPolling();
        // Canal caído: el sondeo mantiene la vista al día igual
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") startPolling();
      });

    return () => {
      disposed = true;
      stopPolling();
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- suscripción única al montar
  }, []);

  const irAVista = (index: number) => {
    setActiveIndex(index);
    if (carruselRef.current) {
      const anchoSli = carruselRef.current.offsetWidth;
      carruselRef.current.scrollTo({
        left: index * anchoSli,
        behavior: "smooth",
      });
    }
  };

  const manejarScrollCarrusel = () => {
    if (carruselRef.current) {
      const { scrollLeft, offsetWidth } = carruselRef.current;
      const indexProximo = Math.round(scrollLeft / offsetWidth);
      if (indexProximo !== activeIndex) {
        setActiveIndex(indexProximo);
      }
    }
  };

  const adaptarEquipos = (filas: StandingRow[]) =>
    filas.map((f) => {
      return {
      nombre: f.team,
      bandera: teamFlagSrc(f.team) ?? undefined,
      pj: f.pj,
      pg: f.pg,
      pe: f.pe,
      pp: f.pp,
      gf: f.gf,
      gc: f.gc,
      gd: f.dg,
      amarillas: f.amarillas,
      rojas: f.rojas,
      pts: f.pts,
      };
    });

  const gruposMasculinos = standings.filter((s) => ["A", "B", "C"].includes(s.group));
  const gruposFemeninos = standings.filter((s) => s.group === "F");

  const partidosMasculinos = liveMatches.filter((m) => m.phase !== "FINAL" && m.field_number !== 4);
  const partidosFemeninos = liveMatches.filter((m) => m.field_number === 4);

  // Fase final por categoría (para el árbol de FixtureEliminatoria)
  const bracketPorCategoria = (cat: "MASCULINO" | "FEMENINO") => ({
    semifinales: (bracket?.semifinales ?? []).filter((c) => c.category === cat),
    final: (bracket?.finales ?? []).find((c) => c.category === cat) ?? null,
  });
  const bracketMasculino = bracketPorCategoria("MASCULINO");
  const bracketFemenino = bracketPorCategoria("FEMENINO");

  return (
    <div
      className="flex min-h-screen flex-col font-poppins overflow-x-hidden relative transition-colors bg-[var(--background)] md:bg-[linear-gradient(to_right,var(--background)_50%,color-mix(in_srgb,var(--primary-feminino,#7c3aed)_4%,var(--background))_50%)]"
      style={{ color: "var(--foreground)" }}
    >
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,1,0"
      />

      <Header activeIndex={activeIndex} onTabChange={irAVista} />

      <main className="flex-1 w-full flex flex-col justify-start pt-20 min-[375px]:pt-24 sm:pt-28 md:pt-36 lg:pt-40 pb-28 md:pb-12">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-8 py-2 md:py-6">

          {/* ========================================== */}
          {/* 1. MÓVIL: CARRUSEL CON BARRA DE CONTROL */}
          {/* ========================================== */}
          <div className="block md:hidden w-full max-w-md mx-auto" data-theme={generoMovil}>
            <div
              ref={carruselRef}
              onScroll={manejarScrollCarrusel}
              className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none scroll-smooth h-full"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {/* VISTA 0: GRUPOS */}
              <div className="w-full flex-shrink-0 snap-start snap-always px-2 py-2 space-y-4">
                {(generoMovil === "masculino" ? gruposMasculinos : gruposFemeninos).map((g) => (
                  <TablaGrupo
                    key={g.group}
                    nombreGrupo={`Grupo ${g.group}`}
                    equipos={adaptarEquipos(g.tabla)}
                    genero={generoMovil}
                  />
                ))}
              </div>

              {/* VISTA 1: PARTIDOS */}
              <div className="w-full flex-shrink-0 snap-start snap-always px-2 py-2 space-y-4">
                <ListaPartidosSeccionados
                  partidos={generoMovil === "masculino" ? partidosMasculinos : partidosFemeninos}
                  genero={generoMovil}
                />
              </div>

              {/* VISTA 2: FASE FINAL */}
              <div className="w-full flex-shrink-0 snap-start snap-always px-2 py-2 space-y-4">
                <FixtureEliminatoria
                  genero={generoMovil}
                  bracket={generoMovil === "masculino" ? bracketMasculino : bracketFemenino}
                />
              </div>
            </div>

            {/* BARRA FLOTANTE INTERACTIVA DE GÉNERO */}
            <div className="fixed bottom-6 right-6 z-50 p-1 rounded-full bg-white/70 backdrop-blur-md border border-white/40 shadow-[0_10px_25px_rgba(16,32,76,0.12)] flex items-center gap-1">
              <button
                type="button"
                onClick={() => setGeneroMovil("masculino")}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 select-none outline-none ${generoMovil === "masculino"
                  ? "bg-[#233c97] text-white shadow-md scale-[1.05]"
                  : "text-[#10204c]/50 hover:text-[#10204c]"
                  }`}
                aria-label="Ver torneo masculino"
              >
                <span className="material-symbols-outlined !text-[24px]">man</span>
              </button>

              <button
                type="button"
                onClick={() => setGeneroMovil("femenino")}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 select-none outline-none ${generoMovil === "femenino"
                  ? "bg-[#7c3aed] text-white shadow-md scale-[1.05]"
                  : "text-[#10204c]/50 hover:text-[#10204c]"
                  }`}
                aria-label="Ver torneo femenino"
              >
                <span className="material-symbols-outlined !text-[24px]">woman</span>
              </button>
            </div>
          </div>

          {/* ========================================== */}
          {/* 2. ESCRITORIO: PARALELO (MASCULINO | FEMENINO) */}
          {/* ========================================== */}
          <div className="hidden md:grid grid-cols-2 gap-16 items-start w-full">

            {/* COLUMNA IZQUIERDA: MASCULINO */}
            <div className="space-y-6 flex flex-col items-center w-full" data-theme="masculino">
              <div className="w-full flex justify-center mb-2">
                <div className="px-7 py-3 rounded-full bg-[#233c97]/5 border border-[#233c97]/15 shadow-sm flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#233c97] !text-[44px]">man</span>
                  <span className="text-2xl font-semibold tracking-normal text-[#233c97] font-poppins">
                    Torneo Masculino
                  </span>
                </div>
              </div>

              {activeIndex === 0 && (
                <div className="w-full space-y-4">
                  {gruposMasculinos.map((g) => (
                    <TablaGrupo
                      key={g.group}
                      nombreGrupo={`Grupo ${g.group}`}
                      equipos={adaptarEquipos(g.tabla)}
                      genero="masculino"
                    />
                  ))}
                </div>
              )}

              {activeIndex === 1 && (
                <ListaPartidosSeccionados partidos={partidosMasculinos} genero="masculino" />
              )}

              {activeIndex === 2 && (
                <div className="w-full">
                  <FixtureEliminatoria genero="masculino" bracket={bracketMasculino} />
                </div>
              )}
            </div>

            {/* COLUMNA DERECHA: FEMENINO */}
            <div className="space-y-6 flex flex-col items-center w-full" data-theme="femenino">
              <div className="w-full flex justify-center mb-2">
                <div className="px-7 py-3 rounded-full bg-[#f8f5ff] border border-[#7c3aed]/15 shadow-sm flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#7c3aed] !text-[44px]">woman</span>
                  <span className="text-2xl font-semibold tracking-normal text-[#7c3aed] font-poppins">
                    Torneo Femenino
                  </span>
                </div>
              </div>

              {activeIndex === 0 && (
                <div className="w-full space-y-4">
                  {gruposFemeninos.map((g) => (
                    <TablaGrupo
                      key={g.group}
                      nombreGrupo={`Grupo ${g.group}`}
                      equipos={adaptarEquipos(g.tabla)}
                      genero="femenino"
                    />
                  ))}
                </div>
              )}

              {activeIndex === 1 && (
                <ListaPartidosSeccionados partidos={partidosFemeninos} genero="femenino" />
              )}

              {activeIndex === 2 && (
                <div className="w-full">
                  <FixtureEliminatoria genero="femenino" bracket={bracketFemenino} />
                </div>
              )}
            </div>

          </div>
        </div>
      </main>

      {/* Botón flotante + modal de ediciones pasadas (palmarés histórico) */}
      <EdicionesPasadas />

      <Footer />
    </div>
  );
}