import { getSupabase } from "@/lib/supabase";

// GET /api/editions → ediciones archivadas (snapshot permanente por año).
// Público (lo consume el modal "Ediciones pasadas"). Si la tabla aún no
// existe (no se corrió archivar_2026.sql), devuelve [] sin romper.
export async function GET() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("editions")
    .select("year, data")
    .order("year", { ascending: false });

  if (error) return Response.json([], { status: 200 });
  return Response.json(data ?? []);
}
