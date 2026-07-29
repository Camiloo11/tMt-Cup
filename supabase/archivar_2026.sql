-- ════════════════════════════════════════════════════════════════════
-- ARCHIVAR EDICIÓN 2026 (snapshot permanente)
-- ════════════════════════════════════════════════════════════════════
-- Copia el estado actual del torneo (equipos, partidos y goles/tarjetas)
-- a una tabla `editions` que NO se toca al reiniciar la base para el año
-- entrante. Así "Ediciones pasadas" muestra el informe completo de 2026
-- (tablas de posiciones, partidos y goles) para siempre.
--
-- Correr ESTE primero. Es no destructivo (no borra nada). Idempotente:
-- vuelve a tomar el snapshot cada vez que se corre.

-- Garantiza que exista la columna `flag` (por si se corre sobre una base
-- limpia); ya la crean correcciones_18jul.sql / setup_completo.sql.
alter table teams add column if not exists flag text;

create table if not exists editions (
  year       int primary key,
  data       jsonb not null,
  created_at timestamptz not null default now()
);
alter table editions enable row level security;
grant select on editions to anon, authenticated;
drop policy if exists "lectura publica editions" on editions;
create policy "lectura publica editions" on editions for select to anon, authenticated using (true);

insert into editions (year, data)
select 2026, jsonb_build_object(
  -- Equipos con su grupo y bandera
  'teams', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'category', t.category,
      'group', g.name, 'flag', t.flag
    ) order by t.category, g.name, t.name), '[]'::jsonb)
    from teams t left join groups g on g.id = t.group_id
  ),
  -- Partidos con nombres de equipos y marcador
  'matches', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'phase', m.phase, 'category', m.category,
      'field', m.field_number, 'scheduledAt', m.scheduled_at,
      'status', m.status,
      'teamA', ta.name, 'teamAId', m.team_a_id,
      'teamB', tb.name, 'teamBId', m.team_b_id,
      'scoreA', m.score_a, 'scoreB', m.score_b
    ) order by m.scheduled_at, m.id), '[]'::jsonb)
    from matches m
    left join teams ta on ta.id = m.team_a_id
    left join teams tb on tb.id = m.team_b_id
  ),
  -- Goles y tarjetas (con jugador y equipo)
  'events', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'matchId', e.match_id, 'teamId', e.team_id, 'type', e.type,
      'minute', e.minute, 'player', p.name
    ) order by e.match_id, e.minute), '[]'::jsonb)
    from match_events e left join players p on p.id = e.player_id
  )
)
on conflict (year) do update set data = excluded.data, created_at = now();

-- Verificación: cuántos equipos, partidos y eventos quedaron archivados
select year,
       jsonb_array_length(data->'teams')   as equipos,
       jsonb_array_length(data->'matches') as partidos,
       jsonb_array_length(data->'events')  as goles_tarjetas
from editions where year = 2026;
