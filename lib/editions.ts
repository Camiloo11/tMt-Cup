// Archivo HISTÓRICO de ediciones pasadas de la TMT CUP.
//
// ⚠️ Estos datos son ESTÁTICOS a propósito: viven en el código, no en la
// base de datos. Así, cuando el año entrante se reinicie Supabase para la
// edición 2027, el registro de 2026 sigue disponible en "Ediciones pasadas".
//
// Para archivar una edición nueva: cuando termine el torneo del año,
// agrega un objeto más a este arreglo con sus campeones y equipos.

export type EditionChampion = { category: "Masculino" | "Femenino"; team: string };

export type PastEdition = {
  year: number;
  fecha: string;
  sede?: string;
  champions: EditionChampion[];
  teamsMasculino: string[];
  teamsFemenino: string[];
  nota?: string;
};

export const PAST_EDITIONS: PastEdition[] = [
  {
    year: 2026,
    fecha: "18 de julio de 2026",
    sede: "Casa Sobre la Roca · Usaquén, Bogotá",
    champions: [
      { category: "Masculino", team: "Noruega" },
      { category: "Femenino", team: "Portugal" },
    ],
    teamsMasculino: [
      "Argentina", "Brasil", "Italia", "Alemania", "Francia", "Colombia",
      "España", "Noruega", "Cabo Verde", "Congo", "Inglaterra", "Portugal",
    ],
    teamsFemenino: ["España", "Francia", "Cabo Verde", "Portugal"],
    nota: "La fase final (semifinales y final) no quedó registrada en el sistema; los campeones se definieron en cancha.",
  },
];
