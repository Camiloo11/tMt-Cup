-- ════════════════════════════════════════════════════════════════════
-- QUERY 2 · FIXTURE FEMENINO (solo esto)
-- ════════════════════════════════════════════════════════════════════
-- Deja los 6 partidos de grupos femeninos EXACTAMENTE como el minuto a
-- minuto oficial (cancha 4, mismas horas por jornada). No crea partidos:
-- solo corrige los cruces (team_a_id / team_b_id) por jornada.
-- Nota: donde el Excel dice "Colombia", el equipo en la base es "España"
-- (no existe Colombia femenino). Idempotente.

with jornadas as (
  select id, row_number() over (order by scheduled_at, id) as j
  from matches
  where phase = 'GRUPOS' and category = 'FEMENINO'
),
cruces as (
  select * from (values
    (1, 'España',     'Francia'),
    (2, 'Cabo Verde', 'Portugal'),
    (3, 'Portugal',   'España'),
    (4, 'Francia',    'Cabo Verde'),
    (5, 'España',     'Cabo Verde'),
    (6, 'Portugal',   'Francia')
  ) as v(j, home, away)
)
update matches m
set team_a_id = ha.id, team_b_id = aw.id
from jornadas jn
join cruces c on c.j = jn.j
join teams ha on ha.name = c.home and ha.category = 'FEMENINO'
join teams aw on aw.name = c.away and aw.category = 'FEMENINO'
where m.id = jn.id;

-- Verificación: deben salir las 6 jornadas en este orden
select row_number() over (order by m.scheduled_at, m.id) as jornada,
       ha.name as equipo_a, aw.name as equipo_b,
       to_char(m.scheduled_at at time zone 'America/Bogota', 'HH12:MI AM') as hora
from matches m
join teams ha on ha.id = m.team_a_id
join teams aw on aw.id = m.team_b_id
where m.phase = 'GRUPOS' and m.category = 'FEMENINO'
order by m.scheduled_at, m.id;
