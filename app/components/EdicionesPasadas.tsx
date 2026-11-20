"use client";

import Image from "next/image";
import { useRef } from "react";
import { PAST_EDITIONS } from "@/lib/editions";
import { teamFlagSrc } from "@/lib/flags";

function TeamName({ name }: { name: string }) {
  const flag = teamFlagSrc(name);
  return (
    <span className="inline-flex items-center gap-2">
      {flag && <Image src={flag} width={20} height={15} alt="" className="w-5 rounded-sm" />}
      {name}
    </span>
  );
}

export default function EdicionesPasadas() {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" aria-haspopup="dialog" aria-label="Ver ediciones pasadas"
        onClick={() => dialog.current?.showModal()}
        className="fixed bottom-6 left-6 z-50 inline-flex h-12 items-center gap-2 rounded-full border border-white/40 bg-white/70 px-3 text-[#233c97] shadow-[0_10px_25px_rgba(16,32,76,0.12)] backdrop-blur-md transition hover:bg-white active:scale-95">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-6">
          <path d="M3 11a9 9 0 1 1 2.6 7M3 5v6h6M12 7v5l3 2" />
        </svg>
        <span className="hidden text-xs font-semibold min-[375px]:inline">Ediciones pasadas</span>
      </button>

      <dialog ref={dialog} aria-labelledby="history-title"
        onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}
        className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-2xl max-h-[85dvh] overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] shadow-xl backdrop:bg-[#10204c]/40 backdrop:backdrop-blur-sm">
        <div className="flex max-h-[85dvh] flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-white px-5 py-4 sm:px-6">
            <h2 id="history-title" className="text-lg font-semibold text-[var(--primary)]">Ediciones pasadas</h2>
            <button type="button" aria-label="Cerrar historial" onClick={() => dialog.current?.close()}
              className="grid size-10 place-items-center rounded-full bg-[var(--background)] text-[var(--primary)] hover:bg-white">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-5"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </header>
          <div className="space-y-6 overflow-y-auto overscroll-contain p-4 sm:p-6">
            {PAST_EDITIONS.map((edition) => (
              <article key={edition.year} className="space-y-4">
                <header>
                  <h3 className="text-xl font-semibold">tMtCup {edition.year}</h3>
                  <p className="mt-1 text-sm">{edition.fecha}</p>
                  {edition.sede && <p className="text-xs opacity-70">{edition.sede}</p>}
                </header>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["Masculino", "Femenino"] as const).map((category) => {
                    const teams = category === "Masculino" ? edition.teamsMasculino : edition.teamsFemenino;
                    const winners = edition.champions.filter((champion) => champion.category === category);
                    return (
                      <section key={category} data-theme={category.toLowerCase()}
                        className="rounded-2xl border border-[var(--border)] bg-[var(--card-strong)] p-4 text-[var(--foreground)]">
                        <h4 className="text-base font-medium tracking-wide text-[var(--primary)]">Torneo {category.toLowerCase()}</h4>
                        {winners.map(({ team }) => (
                          <div key={team} className="mt-3 rounded-xl bg-[var(--background)] px-3 py-2">
                            <p className="text-xs text-[var(--primary)]">Campeón</p>
                            <strong className="text-base"><TeamName name={team} /></strong>
                          </div>
                        ))}
                        <details className="mt-3 border-t border-[var(--border)] pt-2">
                          <summary className="cursor-pointer py-1 text-sm font-medium">Equipos participantes ({teams.length})</summary>
                          <ul className="mt-2 grid gap-2 text-sm">
                            {teams.map((team) => <li key={team}><TeamName name={team} /></li>)}
                          </ul>
                        </details>
                      </section>
                    );
                  })}
                </div>
                {edition.nota && <p className="text-xs leading-relaxed opacity-75">{edition.nota}</p>}
              </article>
            ))}
          </div>
        </div>
      </dialog>
    </>
  );
}
