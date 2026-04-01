"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";

type Depositum = {
  id: string;
  device_id: string;
  status: string;
  aar: number;
  oprettet_at: string;
};

type Saeson = {
  aar: number;
  aktiv: boolean;
};

export default function AdminPage() {
  const [loggetInd, setLoggetInd] = useState<boolean | null>(null);
  const [kode, setKode] = useState("");
  const [loginFejl, setLoginFejl] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<Depositum | null>(null);
  const [scanFejl, setScanFejl] = useState<string | null>(null);
  const [handling, setHandling] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

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

  // QR Scanner
  async function startScanner() {
    setScanResult(null);
    setScanFejl(null);
    setScanning(true);

    await new Promise((r) => setTimeout(r, 100));

    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          await scanner.stop();
          scannerRef.current = null;
          setScanning(false);
          await slaOp(decodedText);
        },
        () => {}
      );
    } catch {
      setScanFejl("Kunne ikke starte kameraet. Tjek tilladelser.");
      setScanning(false);
    }
  }

  async function stopScanner() {
    if (scannerRef.current) {
      await scannerRef.current.stop();
      scannerRef.current = null;
    }
    setScanning(false);
  }

  async function slaOp(depositumId: string) {
    const res = await fetch("/api/admin/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ depositumId }),
    });

    if (!res.ok) {
      const err = await res.json();
      setScanFejl(err.error || "Ukendt fejl");
      return;
    }

    const { depositum } = await res.json();
    setScanResult(depositum);
  }

  async function aktiverKraemmer() {
    if (!scanResult) return;
    setHandling(true);

    const res = await fetch("/api/admin/aktiver", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ depositumId: scanResult.id }),
    });

    if (!res.ok) {
      const err = await res.json();
      setScanFejl(err.error || "Fejl ved aktivering");
      setHandling(false);
      return;
    }

    setScanResult({ ...scanResult, status: "aktiv" });
    setHandling(false);
    hentData();
  }

  async function udbetalKraemmer() {
    if (!scanResult) return;
    setHandling(true);

    const res = await fetch("/api/admin/udbetal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ depositumId: scanResult.id }),
    });

    if (!res.ok) {
      const err = await res.json();
      setScanFejl(err.error || "Fejl ved udbetaling");
      setHandling(false);
      return;
    }

    setScanResult({ ...scanResult, status: "udbetalt" });
    setHandling(false);
    hentData();
  }

  function nulstil() {
    setScanResult(null);
    setScanFejl(null);
  }

  // Sæsonstyring
  async function lukSaeson() {
    if (!confirm(`Luk sæson ${aktivSaeson}?`)) return;
    await fetch("/api/admin/saeson", { method: "DELETE" });
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

  return (
    <div className="max-w-lg mx-auto p-6 pt-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Admin</h1>
        <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-700">
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

        {!scanning && !scanResult && !scanFejl && (
          <button
            onClick={startScanner}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition"
          >
            Start scanner
          </button>
        )}

        {scanning && (
          <div>
            <div id="qr-reader" className="rounded-lg overflow-hidden mb-3" />
            <button
              onClick={stopScanner}
              className="w-full bg-gray-200 text-gray-700 py-2 rounded-lg text-sm"
            >
              Stop scanner
            </button>
          </div>
        )}

        {/* Status: Afventer → kan aktiveres */}
        {scanResult && scanResult.status === "afventer" && (
          <div className="text-center">
            <div className="inline-block px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium mb-3">
              Afventer aktivering
            </div>
            <p className="text-gray-600 text-sm mb-4">
              Kræmmeren har ikke betalt depositum endnu.
            </p>
            <button
              onClick={aktiverKraemmer}
              disabled={handling}
              className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition text-lg"
            >
              {handling ? "Aktiverer..." : "Aktivér — depositum betalt"}
            </button>
            <button onClick={nulstil} className="w-full mt-2 text-gray-500 text-sm py-2">
              Annuller
            </button>
          </div>
        )}

        {/* Status: Aktiv → kan udbetales */}
        {scanResult && scanResult.status === "aktiv" && (
          <div className="text-center">
            <div className="inline-block px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium mb-3">
              Aktiv
            </div>
            <p className="text-gray-600 text-sm mb-4">
              Kræmmeren har betalt depositum. Tjek at pladsen er pæn.
            </p>
            <button
              onClick={udbetalKraemmer}
              disabled={handling}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition text-lg"
            >
              {handling ? "Udbetaler..." : "Udbetal depositum"}
            </button>
            <button onClick={nulstil} className="w-full mt-2 text-gray-500 text-sm py-2">
              Annuller
            </button>
          </div>
        )}

        {/* Status: Udbetalt → ADVARSEL */}
        {scanResult && scanResult.status === "udbetalt" && (
          <div className="text-center">
            <div className="bg-red-100 border-2 border-red-400 rounded-xl p-6 mb-4">
              <p className="text-red-700 font-bold text-xl mb-1">
                ALLEREDE UDBETALT
              </p>
              <p className="text-red-600 text-sm">
                Dette depositum er allerede udbetalt. Muligt forsøg på snyd!
              </p>
            </div>
            <button onClick={nulstil} className="text-gray-500 text-sm py-2">
              Scan ny
            </button>
          </div>
        )}

        {/* Lige aktiveret — bekræftelse */}
        {scanResult && scanResult.status === "aktiv" && !handling && scanResult.status === "aktiv" && (
          <></>
        )}

        {scanFejl && !scanResult && (
          <div className="text-center">
            <p className="text-red-500 mb-3">{scanFejl}</p>
            <button onClick={nulstil} className="text-blue-600 text-sm">
              Prøv igen
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
                <span className={s.aktiv ? "text-green-600" : "text-gray-400"}>
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
