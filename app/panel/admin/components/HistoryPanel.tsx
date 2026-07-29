import React, { useEffect, useRef, useState } from "react";

interface HistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const ANIMATION_MS = 600;

export function HistoryPanel({ isOpen, onClose, children }: HistoryPanelProps) {
  // Controla si el componente sigue montado (para poder animar la salida antes de desmontar)
  const [mounted, setMounted] = useState(isOpen);
  // Controla el estado visual "visible" que dispara las transiciones de entrada/salida
  const [visible, setVisible] = useState(false);

  const [startY, setStartY] = useState<number | null>(null);
  const [currentTranslateY, setCurrentTranslateY] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const panelRef = useRef<HTMLDivElement | null>(null);

  // ── Ciclo de montaje/animación ──
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      // DOBLE rAF: garantiza que el navegador pinte primero el estado
      // inicial (fuera de pantalla) y LUEGO pase a visible — con uno solo,
      // React 19 podía aplicar ambos en el mismo frame y la entrada no se
      // animaba (el panel aparecía de golpe).
      let raf2 = 0;
      const raf = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(raf);
        cancelAnimationFrame(raf2);
      };
    }

    setVisible(false);
    const timeout = setTimeout(() => setMounted(false), ANIMATION_MS);
    return () => clearTimeout(timeout);
  }, [isOpen]);

  // ── Bloquear scroll del fondo mientras el panel está abierto ──
  useEffect(() => {
    if (!mounted) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [mounted]);

  // ── Cerrar con Escape (accesibilidad) ──
  useEffect(() => {
    if (!mounted) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mounted, onClose]);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    setStartY(e.touches[0].clientY);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (startY === null) return;
    const currentY = e.touches[0].clientY;
    const diffY = currentY - startY;
    setCurrentTranslateY(diffY > 0 ? diffY : 0);
  };

  const closeByDrag = () => {
    const panelHeight = panelRef.current?.offsetHeight ?? 0;
    const distanceThreshold = 140;
    const ratioThreshold = panelHeight * 0.3;
    const shouldClose = currentTranslateY > distanceThreshold || currentTranslateY > ratioThreshold;

    setIsDragging(false);
    setStartY(null);

    if (shouldClose) {
      // Deja que el gesto termine su recorrido visual y luego dispara el cierre real
      setVisible(false);
      setCurrentTranslateY(0);
      onClose();
    } else {
      setCurrentTranslateY(0);
    }
  };

  const handleTouchEnd = () => closeByDrag();
  const handleTouchCancel = () => {
    setIsDragging(false);
    setStartY(null);
    setCurrentTranslateY(0);
  };

  if (!mounted) return null;

  return (
    <>
      {/* OVERLAY: por encima del header (z superior) para que también quede borroso.
          Anima opacidad y blur a la vez ("transition-all" cubre backdrop-filter). */}
      <div
        className={`fixed inset-0 z-[110] bg-[#10204c]/30 transition-all duration-[600ms] ease-out ${
          visible ? "opacity-100 backdrop-blur-md" : "opacity-0 backdrop-blur-none pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Historial de auditoría"
        className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4 pointer-events-none"
      >
        <div
          ref={panelRef}
          className={`pointer-events-auto flex flex-col w-full bg-white shadow-2xl
            max-h-[88dvh] rounded-t-3xl
            sm:max-h-[75dvh] sm:max-w-md md:max-w-lg lg:max-w-xl sm:rounded-3xl
            ease-[cubic-bezier(0.32,0.72,0,1)]
            ${!isDragging ? "transition-all duration-[600ms]" : ""}
            ${
              visible
                ? "opacity-100 translate-y-0 sm:scale-100"
                : "opacity-0 translate-y-full sm:translate-y-4 sm:scale-95"
            }`}
          style={
            isDragging
              ? { transform: `translateY(${currentTranslateY}px)` }
              : undefined
          }
        >
          {/* CABECERA: handle de arrastre en móvil + título centrado + X solo en la vista flotante */}
          <div
            className="w-full pt-3 sm:pt-4 pb-2 flex flex-col items-center justify-center cursor-row-resize sm:cursor-default select-none touch-none shrink-0"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
          >
            <div className="w-12 h-1.5 bg-gray-200 rounded-full sm:hidden" />

            <div className="w-full grid grid-cols-[1fr_auto_1fr] items-center gap-3 mt-3 px-4 sm:px-5">
              <span aria-hidden="true" />

              <h2 className="text-center leading-tight text-[#233c97] truncate text-base font-medium min-[375px]:text-lg sm:text-xl sm:font-semibold md:text-2xl md:font-medium">
                Historial de auditoría
              </h2>

              {/* En el sheet móvil (sin popup flotante) el drag handle ya cierra el panel,
                  así que la X solo aparece a partir de "sm" (vista flotante centrada). */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar historial"
                className="hidden sm:flex justify-self-end shrink-0 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-500 transition-all duration-150 items-center justify-center"
              >
                <span className="material-symbols-outlined !text-[18px]">close</span>
              </button>
            </div>
          </div>

          {/* CONTENIDO */}
          <div
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 pb-6 space-y-4 no-scrollbar"
            style={{
              scrollbarWidth: "none",
              paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))"
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </>
  );
}