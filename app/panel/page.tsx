"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import HeaderSupervisor from "@/app/components/HeaderStaff";
import Footer from "@/app/components/Footer";
import { fetchSessionUser, REMEMBERED_EMAIL_KEY } from "@/lib/session-client";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Cargar email recordado y validar sesión activa si existe
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBERED_EMAIL_KEY);
      if (saved) setEmail(saved);
    } catch {
      // Almacenamiento no disponible
    }

    fetchSessionUser().then((user) => {
      if (!user) return;
      router.replace(user.role === "ADMIN" ? "/panel/admin" : "/panel/supervisor");
    });
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setBusy(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, remember }),
      });

      const data = await res.json();

      if (res.ok) {
        try {
          if (remember) {
            localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
          } else {
            localStorage.removeItem(REMEMBERED_EMAIL_KEY);
          }
        } catch {
          // Almacenamiento no disponible
        }

        // Redirección según rol
        const userRole = data.role || data.user?.role;
        if (userRole === "ADMIN") {
          router.push("/panel/admin");
        } else {
          router.push("/panel/supervisor");
        }
      } else {
        setError("Correo o contraseña incorrectos");
      }
    } catch {
      setError("Ocurrió un error al intentar iniciar sesión");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[color:var(--background)]">
      <HeaderSupervisor />

      {/* Cambiado: Se quitan clases de centrado rígido de main y se añade un PT adecuado al tamaño real del header con el logo */}
      <main className="flex-1 flex flex-col p-4 sm:p-6 pt-[100px] min-[425px]:pt-[110px] md:pt-[140px] lg:pt-[200px]">
        
        {/* Contenedor Card Principal Estético - mt-auto mb-auto centra verticalmente de forma dinámica en el espacio restante */}
        <div className="flex flex-col-reverse md:flex-row bg-white rounded-3xl w-full max-w-4xl border border-[color:var(--border)] shadow-[0_20px_50px_rgba(35,60,151,0.08)] overflow-hidden my-6 mt-auto mb-auto mx-auto">
          
          {/* Lado del Formulario (Izquierda) */}
          <div className="p-8 sm:p-12 md:p-16 w-full md:w-1/2 flex flex-col justify-center">
            
            {/* Título */}
            <div className="mb-8">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[color:var(--primary)]">
                ¡Hola, staff!
              </h2>
            </div>

            <form onSubmit={handleLogin} className="flex flex-col space-y-5">
              
              {/* Campo Correo Electrónico */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-600">
                  Correo electrónico
                </label>
                <div className="relative flex items-center rounded-2xl border border-[#cbd5e1] bg-[#f8fafc] px-4 transition-all duration-200 focus-within:border-[color:var(--primary)] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(35,60,151,0.08)]">
                  <svg className="h-5 w-5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                  </svg>
                  <input
                    type="email"
                    placeholder="ejemplo@tmtcup.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-14 w-full bg-transparent pl-3 text-sm font-medium text-[color:var(--foreground)] placeholder:text-slate-400 outline-none"
                  />
                </div>
              </div>

              {/* Campo Contraseña con Ojito Redondeado */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-600">
                  Contraseña
                </label>
                <div className="relative flex items-center rounded-2xl border border-[#cbd5e1] bg-[#f8fafc] px-4 transition-all duration-200 focus-within:border-[color:var(--primary)] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(35,60,151,0.08)]">
                  <svg className="h-5 w-5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-14 w-full bg-transparent pl-3 pr-2 text-sm font-medium text-[color:var(--foreground)] placeholder:text-slate-400 outline-none"
                  />
                  
                  {/* Botón para Mostrar / Ocultar (Íconos redondeados) */}
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1.5 rounded-full text-slate-400 hover:text-[color:var(--primary)] hover:bg-slate-100/80 focus:outline-none transition-colors shrink-0 flex items-center justify-center"
                    tabIndex={-1}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPassword ? (
                      /* Ojo Oculto - Curvas redondeadas limpias */
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      /* Ojo Normal - Curvas simétricas */
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.573 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Recordarme */}
              <div className="flex items-center pt-1 text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-slate-500 font-medium select-none">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[color:var(--primary)] focus:ring-[color:var(--primary)] transition-colors cursor-pointer"
                  />
                  Recordarme
                </label>
              </div>

              {/* Mensaje de Error */}
              {error && (
                <div className="rounded-xl bg-red-50 p-3 text-center text-xs font-medium text-[color:var(--danger)] border border-red-100 animate-fade-in">
                  {error}
                </div>
              )}

              {/* Botón de Ingresar */}
              <button
                type="submit"
                disabled={busy}
                className="mt-2 inline-flex h-12 w-auto self-start items-center justify-center rounded-full bg-[#f83636] hover:bg-[#d62b2b] text-white text-base font-bold px-8 shadow-md hover:shadow-lg transition-all duration-200 active:scale-95 disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none"
              >
                {busy ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-5 w-5 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Validando...
                  </span>
                ) : (
                  "Ingresar"
                )}
              </button>
            </form>
          </div>

          <div className="w-full md:w-1/2 min-h-[300px] min-[425px]:min-h-[340px] md:min-h-full relative overflow-hidden bg-slate-100">
            <Image
              src="/assets/ImageLogin.png"
              alt="TMT CUP — Trofeo en el estadio"
              fill
              className="object-cover object-[center_bottom]"
              sizes="(max-width: 768px) 100vw, 50vw"
              loading="eager"
              unoptimized
            />
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}