-- ════════════════════════════════════════════════════════════════════
-- FIXTURE · SEMIFINALES + FINAL (por definir)
-- ════════════════════════════════════════════════════════════════════
-- Garantiza que existan los partidos de fase final de cada categoría como
-- placeholders "por definir" (equipos null). Se llenan solos cuando
-- terminan los grupos / las semis, o el admin los asigna desde su vista.
-- Idempotente: solo crea los que falten (no duplica).
--   MASCULINO: 2 semifinales (cancha 1) + final (cancha 5)
--   FEMENINO:  2 semifinales (cancha 4) + final (cancha 4)

do $$
declare
  v_day date;
  n int;
begin
  select coalesce((min(scheduled_at) at time zone 'America/Bogota')::date, date '2026-07-18')
    into v_day from matches;

  -- ── MASCULINO · semifinales (cancha 1, 5:00 y 5:30 PM) ──
  select count(*) into n from matches where phase = 'SEMIFINAL' and category = 'MASCULINO';
  while n < 2 loop
    insert into matches (phase, status, field_number, scheduled_at, category, team_a_id, team_b_id)
    values ('SEMIFINAL', 'PROGRAMADO', 1,
      (v_day + (case when n = 0 then time '17:00' else time '17:30' end)) at time zone 'America/Bogota',
      'MASCULINO', null, null);
    n := n + 1;
  end loop;

  -- ── MASCULINO · final (cancha 5, 6:05 PM) ──
  if not exists (select 1 from matches where phase = 'FINAL' and category = 'MASCULINO') then
    insert into matches (phase, status, field_number, scheduled_at, category, team_a_id, team_b_id)
    values ('FINAL', 'PROGRAMADO', 5, (v_day + time '18:05') at time zone 'America/Bogota', 'MASCULINO', null, null);
  end if;

  -- ── FEMENINO · semifinales (cancha 4, 5:00 y 5:30 PM) ──
  select count(*) into n from matches where phase = 'SEMIFINAL' and category = 'FEMENINO';
  while n < 2 loop
    insert into matches (phase, status, field_number, scheduled_at, category, team_a_id, team_b_id)
    values ('SEMIFINAL', 'PROGRAMADO', 4,
      (v_day + (case when n = 0 then time '17:00' else time '17:30' end)) at time zone 'America/Bogota',
      'FEMENINO', null, null);
    n := n + 1;
  end loop;

  -- ── FEMENINO · final (cancha 4, 6:05 PM) ──
  if not exists (select 1 from matches where phase = 'FINAL' and category = 'FEMENINO') then
    insert into matches (phase, status, field_number, scheduled_at, category, team_a_id, team_b_id)
    values ('FINAL', 'PROGRAMADO', 4, (v_day + time '18:05') at time zone 'America/Bogota', 'FEMENINO', null, null);
  end if;
end $$;

-- Verificación: deben salir 2 semis + 1 final por categoría
select category, phase, count(*) as partidos,
       to_char(min(scheduled_at) at time zone 'America/Bogota', 'HH12:MI AM') as hora
from matches
where phase in ('SEMIFINAL', 'FINAL')
group by category, phase
order by category, phase;
