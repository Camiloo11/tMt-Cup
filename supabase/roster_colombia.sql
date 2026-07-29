-- ════════════════════════════════════════════════════════════════════
-- QUERY 3 · NÓMINA COLOMBIA MASCULINO (solo esto)
-- ════════════════════════════════════════════════════════════════════
-- Deja el roster de Colombia MASCULINO exactamente con estos 8 jugadores
-- (cédulas sin puntos), sin repetidos:
--   1. Los que ya existen con el mismo nombre se CONSERVAN y se les
--      actualiza la cédula (no se duplican).
--   2. Se insertan solo los que falten.
--   3. Se eliminan del equipo los que sobren, SOLO si no tienen eventos
--      registrados (goles/tarjetas); si tienen, se conservan y se avisa
--      en la verificación final.
-- Idempotente.

-- 1) Actualizar cédula de los que ya están (match por nombre)
update players p
set document = v.document
from (values
  ('Alejandro Lopez',      '1016717862'),
  ('Cesar Ávila',          '1010128064'),
  ('David Hoyos',          '1029287944'),
  ('Santiago González',    '1031801275'),
  ('Jacobo Solano',        '1013141833'),
  ('Cristhian Cifuentes',  '1097504339'),
  ('Andrés Molina',        '1000254527'),
  ('Santiago Chaves',      '1000729006')
) as v(name, document),
teams t
where t.name = 'Colombia' and t.category = 'MASCULINO'
  and p.team_id = t.id
  and lower(p.name) = lower(v.name);

-- 2) Insertar los que falten (sin duplicar por nombre ni por cédula)
insert into players (name, document, team_id)
select v.name, v.document, t.id
from (values
  ('Alejandro Lopez',      '1016717862'),
  ('Cesar Ávila',          '1010128064'),
  ('David Hoyos',          '1029287944'),
  ('Santiago González',    '1031801275'),
  ('Jacobo Solano',        '1013141833'),
  ('Cristhian Cifuentes',  '1097504339'),
  ('Andrés Molina',        '1000254527'),
  ('Santiago Chaves',      '1000729006')
) as v(name, document)
join teams t on t.name = 'Colombia' and t.category = 'MASCULINO'
where not exists (
  select 1 from players p
  where p.team_id = t.id
    and (lower(p.name) = lower(v.name) or p.document = v.document)
);

-- 3) Eliminar del equipo los que NO están en la lista (solo sin eventos)
delete from players p
using teams t
where p.team_id = t.id
  and t.name = 'Colombia' and t.category = 'MASCULINO'
  and lower(p.name) not in (
    'alejandro lopez', 'cesar ávila', 'david hoyos', 'santiago gonzález',
    'jacobo solano', 'cristhian cifuentes', 'andrés molina', 'santiago chaves'
  )
  and not exists (select 1 from match_events e where e.player_id = p.id);

-- Verificación: deben salir exactamente 8 filas
select p.name, p.document
from players p
join teams t on t.id = p.team_id
where t.name = 'Colombia' and t.category = 'MASCULINO'
order by p.name;
