"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";

type Saeson = {
  aar: number;
  aktiv: boolean;
};

type Feedback = {
  type: "aktiveret" | "udbetalt" | "advarsel" | "fejl" | "udløbet";
  besked: string;
};

// Software-debounce: efter en succesfuld scan låses onScan i denne periode,
// så admin ikke ved et uheld scanner samme telefon to gange og rykker
// statussen videre (fx aktiv → udbetalt) ufrivilligt.
const SCAN_LOCK_MS = 4000;

// Generer en kort bip-lyd via Web Audio API
function bip(frekvens: number, varighed: number) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frekvens;
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + varighed / 1000);
  } catch {
    // Ignorer hvis AudioContext ikke er tilgængelig
  }
}

function vibrér(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Ignorer
  }
}

export default function AdminPage() {
  const [loggetInd, setLoggetInd] = useState<boolean | null>(null);
  const [kode, setKode] = useState("");
  const [loginFejl, setLoginFejl] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [behandler, setBehandler] = useState(false);
  const [laasNedtaelling, setLaasNedtaelling] = useState(0);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  // Lås der blokerer onScan i SCAN_LOCK_MS efter en succesfuld scan
  const laasIndtilRef = useRef<number>(0);
  const nedtaellingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [saesoner, setSaesoner] = useState<Saeson[]>([]);
  const [aktivSaeson, setAktivSaeson] = useState<number | null>(null);
  const [stats, setStats] = useState({ afventer: 0, aktive: 0, udbetalte: 0 });

  // Tjek session
  useEffect(() => {
    fetch("/api/admin/verify")
      .then((res) => setLoggetInd(res.ok))
      .catch(() => setLoggetInd(false));
  }, []);

  async function login() {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: kode }),
    });
    if (res.ok) {
      setLoggetInd(true);
    } else {
      setLoginFejl(true);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setLoggetInd(false);
  }

  const hentData = useCallback(async () => {
    const res = await fetch("/api/admin/stats");
    if (!res.ok) return;
    const data = await res.json();
    setSaesoner(data.saesoner);
    setAktivSaeson(data.aktivSaeson);
    setStats(data.stats);
  }, []);

  useEffect(() => {
    if (loggetInd) hentData();
  }, [loggetInd, hentData]);

  // Ryd nedtælling-timer ved unmount så vi ikke lækker setInterval
  useEffect(() => {
    return () => {
      if (nedtaellingTimerRef.current) {
        clearInterval(nedtaellingTimerRef.current);
      }
    };
  }, []);

  function startLaasNedtaelling() {
    laasIndtilRef.current = Date.now() + SCAN_LOCK_MS;
    setLaasNedtaelling(Math.ceil(SCAN_LOCK_MS / 1000));

    if (nedtaellingTimerRef.current) {
      clearInterval(nedtaellingTimerRef.current);
    }
    nedtaellingTimerRef.current = setInterval(() => {
      const tilbage = Math.max(0, laasIndtilRef.current - Date.now());
      const sek = Math.ceil(tilbage / 1000);
      setLaasNedtaelling(sek);
      if (tilbage <= 0 && nedtaellingTimerRef.current) {
        clearInterval(nedtaellingTimerRef.current);
        nedtaellingTimerRef.current = null;
      }
    }, 200);
  }

  // Auto-håndtering ved scan
  async function haandterScan(depositumId: string) {
    // Software-debounce: lås onScan i SCAN_LOCK_MS efter sidste behandling
    if (Date.now() < laasIndtilRef.current) return;
    if (behandler) return;

    setBehandler(true);
    setFeedback(null);

    let res: Response;
    try {
      res = await fetch("/api/admin/haandter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositumId }),
      });
    } catch {
      setBehandler(false);
      bip(200, 300);
      vibrér(300);
      setFeedback({ type: "fejl", besked: "Netværksfejl - prøv igen" });
      autoNulstil(3000);
      return;
    }

    setBehandler(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      // 410 Gone = udløbet QR-kode
      if (res.status === 410) {
        bip(200, 300);
        vibrér(300);
        setFeedback({
          type: "udløbet",
          besked: err.error || "Udløbet kode - bed kræmmeren opdatere siden",
        });
        startLaasNedtaelling();
        autoNulstil(SCAN_LOCK_MS);
        return;
      }
      bip(200, 300);
      vibrér(300);
      setFeedback({ type: "fejl", besked: err.error || "Ukendt fejl" });
      startLaasNedtaelling();
      autoNulstil(SCAN_LOCK_MS);
      return;
    }

    const { resultat } = await res.json();

    if (resultat === "aktiveret") {
      bip(880, 150);
      vibrér(100);
      setFeedback({ type: "aktiveret", besked: "Kræmmer aktiveret!" });
      hentData();
      startLaasNedtaelling();
      autoNulstil(SCAN_LOCK_MS);
    } else if (resultat === "udbetalt") {
      bip(660, 150);
      setTimeout(() => bip(880, 150), 200);
      vibrér(100);
      setFeedback({ type: "udbetalt", besked: "Depositum udbetalt!" });
      hentData();
      startLaasNedtaelling();
      autoNulstil(SCAN_LOCK_MS);
    } else if (resultat === "allerede_udbetalt") {
      bip(200, 500);
      vibrér(500);
      setFeedback({
        type: "advarsel",
        besked: "ADVARSEL: Allerede udbetalt!",
      });
      startLaasNedtaelling();
      autoNulstil(SCAN_LOCK_MS);
    }
  }

  function autoNulstil(ms: number) {
    setTimeout(() => {
      setFeedback(null);
    }, ms);
  }

  // QR Scanner — kører kontinuerligt, stopper ikke ved scan
  async function startScanner() {
    setFeedback(null);
    setScanning(true);

    await new Promise((r) => setTimeout(r, 100));

    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          // Scanner kører videre — debounce håndterer dubletter
          await haandterScan(decodedText);
        },
        () => {}
      );
    } catch {
      setFeedback({
        type: "fejl",
        besked: "Kunne ikke starte kameraet. Tjek tilladelser.",
      });
      setScanning(false);
    }
  }

  async function stopScanner() {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {
        // Ignorer
      }
      scannerRef.current = null;
    }
    setScanning(false);
    setFeedback(null);
  }

  // Sæsonstyring med masterkode
  async function lukSaeson() {
    const masterkode = prompt(
      `Indtast masterkode for at lukke sæson ${aktivSaeson}:`
    );
    if (!masterkode) return;

    const res = await fetch("/api/admin/saeson", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ masterkode }),
    });

    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Fejl ved lukning af sæson");
      return;
    }

    hentData();
  }

  async function startNySaeson() {
    const res = await fetch("/api/admin/saeson", { method: "POST" });
    if (!res.ok) {
      const err = await res.json();
      alert("Fejl: " + (err.error || "Ukendt fejl"));
      return;
    }
    hentData();
  }

  // Loading
  if (loggetInd === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Indlæser...</p>
      </div>
    );
  }

  // Login
  if (!loggetInd) {
    return (
      <div className="max-w-sm mx-auto p-6 pt-20">
        <h1 className="text-2xl font-bold text-center mb-6">Admin-adgang</h1>
        <div className="bg-white rounded-xl shadow p-6">
          <input
            type="password"
            placeholder="Adgangskode"
            value={kode}
            onChange={(e) => {
              setKode(e.target.value);
              setLoginFejl(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && login()}
            className="w-full border rounded-lg px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {loginFejl && (
            <p className="text-red-500 text-sm mb-3">Forkert adgangskode</p>
          )}
          <button
            onClick={login}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition"
          >
            Log ind
          </button>
        </div>
      </div>
    );
  }

  // Feedback-styling
  const feedbackStyles: Record<string, string> = {
    aktiveret: "bg-green-100 border-green-400 text-green-700",
    udbetalt: "bg-blue-100 border-blue-400 text-blue-700",
    advarsel: "bg-red-100 border-red-400 text-red-700",
    fejl: "bg-red-100 border-red-400 text-red-700",
    udløbet: "bg-orange-100 border-orange-400 text-orange-700",
  };

  return (
    <div className="max-w-lg mx-auto p-6 pt-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Admin</h1>
        <button
          onClick={logout}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Log ud
        </button>
      </div>

      {/* Statistik */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl shadow p-4 text-center">
          <p className="text-2xl font-bold text-yellow-600">{stats.afventer}</p>
          <p className="text-xs text-gray-500">Afventer</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{stats.aktive}</p>
          <p className="text-xs text-gray-500">Aktive</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{stats.udbetalte}</p>
          <p className="text-xs text-gray-500">Udbetalte</p>
        </div>
      </div>

      {/* QR Scanner */}
      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <h2 className="font-semibold mb-4">Scan kræmmer</h2>

        {!scanning && (
          <button
            onClick={startScanner}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition"
          >
            Start scanner
          </button>
        )}

        {scanning && (
          <div>
            <div
              id="qr-reader"
              className="rounded-lg overflow-hidden mb-3"
            />

            {/* Feedback-overlay */}
            {feedback && (
              <div
                className={`border-2 rounded-xl p-5 mb-3 text-center ${
                  feedbackStyles[feedback.type]
                }`}
              >
                <p
                  className={`font-bold ${
                    feedback.type === "advarsel" ? "text-2xl" : "text-lg"
                  }`}
                >
                  {feedback.besked}
                </p>
                {feedback.type === "advarsel" && (
                  <p className="text-sm mt-1">
                    Muligt forsøg på snyd!
                  </p>
                )}
              </div>
            )}

            {behandler && (
              <div className="text-center py-2">
                <p className="text-gray-500 text-sm">Behandler...</p>
              </div>
            )}

            {!behandler && laasNedtaelling > 0 && (
              <div className="text-center py-2 bg-gray-50 rounded-lg mb-2">
                <p className="text-gray-600 text-sm font-medium">
                  Klar til næste scan om {laasNedtaelling}s
                </p>
              </div>
            )}

            <button
              onClick={stopScanner}
              className="w-full bg-gray-200 text-gray-700 py-2 rounded-lg text-sm"
            >
              Stop scanner
            </button>
          </div>
        )}
      </div>

      {/* Sæsonstyring */}
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="font-semibold mb-4">Sæsonstyring</h2>

        {aktivSaeson ? (
          <div className="flex items-center justify-between mb-4">
            <span>
              Aktiv sæson: <strong>{aktivSaeson}</strong>
            </span>
            <button
              onClick={lukSaeson}
              className="bg-red-100 text-red-700 px-3 py-1 rounded-lg text-sm hover:bg-red-200 transition"
            >
              Luk sæson
            </button>
          </div>
        ) : (
          <p className="text-gray-500 mb-4">Ingen aktiv sæson</p>
        )}

        <button
          onClick={startNySaeson}
          className="w-full bg-gray-100 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-200 transition"
        >
          + Start ny sæson
        </button>

        {saesoner.length > 0 && (
          <div className="mt-4 border-t pt-4">
            <p className="text-xs text-gray-400 mb-2">Historik</p>
            {saesoner.map((s) => (
              <div key={s.aar} className="flex justify-between text-sm py-1">
                <span>{s.aar}</span>
                <span
                  className={s.aktiv ? "text-green-600" : "text-gray-400"}
                >
                  {s.aktiv ? "Aktiv" : "Lukket"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
