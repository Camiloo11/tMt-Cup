-- ════════════════════════════════════════════════════════════════════
-- QUERY 1 · LIMPIEZA DE PRUEBAS (deja los partidos en 0-0)
-- ════════════════════════════════════════════════════════════════════
-- Borra todo lo generado en las pruebas de ayer y deja cada partido en
-- PROGRAMADO con marcador 0-0. NO toca jugadores, equipos, fechas ni
-- asignaciones de cancha. Idempotente.

-- Blindaje por si alguna columna/tabla aún no existe en esta base
alter table matches add column if not exists penalty_a          integer;
alter table matches add column if not exists penalty_b          integer;
alter table matches add column if not exists walkover           text;
alter table matches add column if not exists extra_time_min     integer not null default 0;
alter table matches add column if not exists waiting_started_at timestamptz;
alter table matches add column if not exists team_a_present_at  timestamptz;
alter table matches add column if not exists team_b_present_at  timestamptz;
alter table matches add column if not exists kickoff_at         timestamptz;
alter table matches add column if not exists finished_at        timestamptz;
alter table matches add column if not exists published_at       timestamptz;

-- Rastros de las pruebas
delete from match_events;
delete from sanctions;
delete from incidents;
do $$ begin
  if to_regclass('public.audit_logs') is not null then
    delete from audit_logs;
  end if;
end $$;

-- Partidos: PROGRAMADO y 0-0 (marcador en cero, NO en null)
update matches set
  status             = 'PROGRAMADO',
  score_a            = 0,
  score_b            = 0,
  penalty_a          = null,
  penalty_b          = null,
  walkover           = null,
  extra_time_min     = 0,
  waiting_started_at = null,
  team_a_present_at  = null,
  team_b_present_at  = null,
  kickoff_at         = null,
  finished_at        = null,
  published_at       = null;

-- Fase final: equipos vuelven a "por definir"
update matches set team_a_id = null, team_b_id = null
where phase in ('CUARTOS', 'SEMIFINAL', 'FINAL');

-- Verificación: todo PROGRAMADO y 0-0
select status, count(*) as partidos, min(score_a) as min_a, max(score_b) as max_b
from matches group by status;
