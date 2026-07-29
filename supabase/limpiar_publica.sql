-- ════════════════════════════════════════════════════════════════════
-- LIMPIAR LA VISTA PÚBLICA (después de archivar 2026)
-- ════════════════════════════════════════════════════════════════════
-- Deja las tablas de posiciones (masculino y femenino), los partidos y la
-- fase final SIN registro, para que el informe de 2026 quede ÚNICAMENTE en
-- "Ediciones pasadas". No borra equipos ni jugadores.
--
-- ⚠️ Correr SOLO DESPUÉS de haber ejecutado archivar_2026.sql y de haber
--    verificado en la web que "Ediciones pasadas" ya muestra el informe.
--    Esto sí es destructivo para los datos EN VIVO (ya archivados).

delete from match_events;
delete from sanctions;
delete from incidents;

update matches set
  status             = 'PROGRAMADO',
  score_a            = null,
  score_b            = null,
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

-- Fase final vuelve a "por definir"
update matches set team_a_id = null, team_b_id = null
where phase in ('CUARTOS', 'SEMIFINAL', 'FINAL');

-- Verificación: todo sin marcador
select status, count(*) from matches group by status;
