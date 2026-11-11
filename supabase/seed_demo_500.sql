-- Ejecutar TODO junto en Supabase > SQL Editor > Run.
-- Compatible con PostgreSQL sin enums y con el esquema original de TMT Cup.
BEGIN;
SELECT pg_advisory_xact_lock(50112026);
CREATE TABLE IF NOT EXISTS public.groups (
 id serial PRIMARY KEY, name text NOT NULL, field_number integer NOT NULL
);
CREATE TABLE IF NOT EXISTS public.teams (
 id serial PRIMARY KEY, name text NOT NULL, category text NOT NULL,
 group_id integer REFERENCES public.groups(id), flag text,
 created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.players (
 id serial PRIMARY KEY, name text NOT NULL, number integer,
 team_id integer NOT NULL REFERENCES public.teams(id),
 created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.matches (
 id serial PRIMARY KEY, phase text NOT NULL, status text NOT NULL DEFAULT 'PROGRAMADO',
 field_number integer NOT NULL, scheduled_at timestamptz NOT NULL,
 team_a_id integer REFERENCES public.teams(id), team_b_id integer REFERENCES public.teams(id),
 score_a integer, score_b integer, category text, kickoff_at timestamptz,
 walkover text, penalty_a integer, penalty_b integer,
 created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.match_events (
 id serial PRIMARY KEY, type text NOT NULL, minute integer,
 match_id integer NOT NULL REFERENCES public.matches(id),
 team_id integer NOT NULL REFERENCES public.teams(id),
 player_id integer REFERENCES public.players(id), created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.incidents (
 id serial PRIMARY KEY, match_id integer REFERENCES public.matches(id),
 type text NOT NULL, note text, created_at timestamptz DEFAULT now()
);
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS flag text;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS kickoff_at timestamptz;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS walkover text;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS penalty_a integer;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS penalty_b integer;

DO $$
DECLARE
 gids integer[] := ARRAY[]::integer[];
 tids integer[] := ARRAY[]::integer[];
 pids integer[] := ARRAY[]::integer[];
 gid integer; tid integer; pid integer; mid integer;
 i integer; j integer; g integer; a integer; b integer; sa integer; sb integer; n integer;
 -- Se toma el tipo REAL de cada columna, sin depender del enum match_status.
 estado public.matches.status%TYPE;
 categoria_equipo public.teams.category%TYPE;
 categoria_partido public.matches.category%TYPE;
 nombres text[] := ARRAY['Colombia','Brasil','Argentina','Uruguay','Alemania','Italia','Francia','España','Portugal','México','Chile','Ecuador','Colombia F','Brasil F','Argentina F','España F'];
BEGIN
 SELECT count(*) INTO n FROM public.teams WHERE name LIKE 'DEMO-500 · %';
 IF n>0 THEN
  IF n=16 AND (SELECT count(*) FROM public.matches m JOIN public.teams t ON t.id=m.team_a_id WHERE t.name LIKE 'DEMO-500 · %')=500 THEN
   RAISE NOTICE 'Los 500 partidos ya existen. No se duplicaron.';
   RETURN;
  END IF;
  RAISE EXCEPTION 'Hay registros DEMO-500 parciales. No se modificó nada; revisa esos registros antes de continuar.';
 END IF;
 FOR g IN 1..4 LOOP
  INSERT INTO public.groups(name,field_number) VALUES ('DEMO-500 · '||g,g) RETURNING id INTO gid;
  gids:=array_append(gids,gid);
 END LOOP;
 FOR i IN 1..16 LOOP
  IF i>12 THEN categoria_equipo:='FEMENINO'; ELSE categoria_equipo:='MASCULINO'; END IF;
  INSERT INTO public.teams(name,category,group_id)
  VALUES ('DEMO-500 · '||nombres[i],categoria_equipo,gids[1+(i-1)/4]) RETURNING id INTO tid;
  tids:=array_append(tids,tid);
  FOR j IN 1..8 LOOP
   INSERT INTO public.players(name,number,team_id)
   VALUES ('DEMO · Jugador '||i||'-'||j,j,tid) RETURNING id INTO pid;
   IF j=1 THEN pids:=array_append(pids,pid); END IF;
  END LOOP;
 END LOOP;
 FOR i IN 1..500 LOOP
  g:=1+(i-1)%4;
  a:=1+(g-1)*4+((i-1)/4)%4;
  b:=1+(g-1)*4+((((i-1)/4)%4+1+((i-1)/16)%3)%4);
  IF i<=400 THEN estado:='FINALIZADO'; ELSIF i<=408 THEN estado:='EN_JUEGO'; ELSE estado:='PROGRAMADO'; END IF;
  IF g=4 THEN categoria_partido:='FEMENINO'; ELSE categoria_partido:='MASCULINO'; END IF;
  sa:=CASE WHEN i<=408 THEN i%5 ELSE NULL END;
  sb:=CASE WHEN i<=408 THEN (i*3+1)%5 ELSE NULL END;
  INSERT INTO public.matches(phase,status,field_number,scheduled_at,team_a_id,team_b_id,score_a,score_b,category,kickoff_at)
  VALUES ('GRUPOS',estado,g,date_trunc('day',now())+interval '12 hours'+((i-401)/4)*interval '45 minutes',tids[a],tids[b],sa,sb,categoria_partido,CASE WHEN i BETWEEN 401 AND 408 THEN now()-interval '10 minutes' ELSE NULL END)
  RETURNING id INTO mid;
  FOR j IN 1..coalesce(sa,0) LOOP
   INSERT INTO public.match_events(type,minute,match_id,team_id,player_id) VALUES ('GOL',j*5,mid,tids[a],pids[a]);
  END LOOP;
  FOR j IN 1..coalesce(sb,0) LOOP
   INSERT INTO public.match_events(type,minute,match_id,team_id,player_id) VALUES ('GOL',j*5,mid,tids[b],pids[b]);
  END LOOP;
 END LOOP;
END $$;
-- Protege el acceso directo: el backend usa service_role y no requiere políticas públicas.
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
-- En Supabase, habilita lectura para el backend existente sin exponer datos a anon.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  GRANT USAGE ON SCHEMA public TO service_role;
  GRANT SELECT ON public.groups,public.teams,public.players,public.matches,public.match_events,public.incidents TO service_role;
 END IF;
END $$;
NOTIFY pgrst, 'reload schema';
SELECT m.status,count(*) AS partidos_demo
FROM public.matches m JOIN public.teams t ON t.id=m.team_a_id
WHERE t.name LIKE 'DEMO-500 · %' GROUP BY m.status ORDER BY m.status;
COMMIT;
-- Resultado esperado: FINALIZADO=400, EN_JUEGO=8, PROGRAMADO=92.
-- Abre https://tmtcup.vercel.app/ > Partidos y recarga.
-- Los grupos DEMO son independientes: no alteran las posiciones oficiales A/B/C/F.
