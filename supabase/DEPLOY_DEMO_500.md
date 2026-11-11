# 500 partidos en el despliegue de Vercel

## Ver la demostración sin conectar una base

La ruta `/demo` utiliza la misma interfaz pública con una copia incluida de los
500 partidos, 16 equipos, posiciones y eventos de gol. No requiere variables
de entorno, acceso a Supabase ni ejecutar SQL. Abre
`https://tmtcup.vercel.app/demo` después de desplegar este código. Para desarrollo,
inicia `pnpm dev` y abre `http://localhost:3000/demo`.

La demostración está identificada como datos de prueba, inicia en la pestaña
Partidos y conserva la navegación de grupos y categorías en móvil y escritorio.
No sincroniza cambios ni incluye partidos eliminatorios. La página principal
sigue consultando Supabase; si la consulta falla o no devuelve partidos, muestra
un aviso con un enlace a la demostración.

El archivo `seed_demo_500.sql` crea las tablas públicas necesarias para la
consulta de partidos y carga 500 partidos sintéticos, 16 equipos, 128 jugadores
y 1.632 goles. Usa los tipos reales de las columnas, por lo que no requiere
que exista un enum llamado `match_status`.

## Cargar los datos

1. Abre el proyecto de Supabase que utiliza `tmtcup.vercel.app`.
2. En SQL Editor, crea una consulta, pega **todo** `seed_demo_500.sql` y ejecuta Run.
3. El resultado debe indicar 400 FINALIZADO, 8 EN_JUEGO y 92 PROGRAMADO.
4. Abre la web, recarga y selecciona **Partidos**. Los equipos llevan el prefijo
   `DEMO-500`.

El script no elimina registros existentes. Repetir una carga completa no duplica
los partidos. Si detecta una carga parcial, cancela la transacción y pide revisar
los registros. Los grupos DEMO son independientes de A/B/C/F para no modificar
las posiciones oficiales; no aparecen en la pestaña Grupos. Los partidos en
juego son simulados y sus marcadores no cambian por sí solos.

## Configuración de Vercel

En Settings → Environment Variables, configura para **Production**:

- `SUPABASE_URL`: URL del mismo proyecto donde ejecutaste el SQL.
- `SUPABASE_SERVICE_ROLE_KEY`: clave service_role de ese proyecto, solo servidor.

No subas claves al repositorio ni uses `NEXT_PUBLIC_` para service_role.
Después de cambiar variables, ejecuta Redeploy desde Deployments.
Si solo cambias los datos en Supabase, basta con recargar la página.

Un push a la rama de producción puede activar un despliegue si la integración
Git de Vercel está conectada. **Vercel no ejecuta este SQL automáticamente**:
publicar el archivo en GitHub no carga los datos ni cambia las variables.

## Diagnóstico

Abre `/api/matches` en el dominio desplegado. Una lista de partidos con los
nombres DEMO confirma que el backend está leyendo los datos. `[]` indica que
la consulta no devuelve registros: comprueba el proyecto seleccionado y su
configuración. Un error 500 requiere revisar el cuerpo de la respuesta y los
logs de funciones de Vercel; la interfaz actual oculta esos errores como listas
vacías. Un proyecto Supabase pausado debe reanudarse en su panel.

## Validación del script

Probado en PostgreSQL 17 con tablas nuevas de columnas de texto, con el esquema
original del repositorio que usa enums y mediante una segunda ejecución sin
duplicados. Esta validación local no confirma que se haya ejecutado en el
Supabase de producción ni que Vercel haya terminado un despliegue.
