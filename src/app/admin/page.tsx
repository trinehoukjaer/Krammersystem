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

  // Scanner
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<Depositum | null>(null);
  const [scanFejl, setScanFejl] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = "qr-reader";

  // Sæsoner
  const [saesoner, setSaesoner] = useState<Saeson[]>([]);
  const [aktivSaeson, setAktivSaeson] = useState<number | null>(null);
  const [stats, setStats] = useState({ aktive: 0, udbetalte: 0 });

  // Tjek session via server
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

    const scanner = new Html5Qrcode(scannerContainerId);
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

  async function udbetal() {
    if (!scanResult) return;

    const res = await fetch("/api/admin/udbetal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ depositumId: scanResult.id }),
    });

    if (!res.ok) {
      const err = await res.json();
      setScanFejl(err.error || "Fejl ved udbetaling");
      return;
    }

    setScanResult({ ...scanResult, status: "udbetalt" });
    hentData();
  }

  async function lukSaeson() {
    if (!confirm(`Er du sikker på, at du vil lukke sæson ${aktivSaeson}?`))
      return;

    const res = await fetch("/api/admin/saeson", { method: "DELETE" });
    if (!res.ok) {
      alert("Fejl ved lukning af sæson");
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

  // Indlæser
  if (loggetInd === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Indlæser...</p>
      </div>
    );
  }

  // Login-skærm
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
        <button
          onClick={logout}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Log ud
        </button>
      </div>

      {/* Statistik */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow p-4 text-center">
          <p className="text-3xl font-bold text-green-600">{stats.aktive}</p>
          <p className="text-sm text-gray-500">Aktive</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 text-center">
          <p className="text-3xl font-bold text-blue-600">{stats.udbetalte}</p>
          <p className="text-sm text-gray-500">Udbetalte</p>
        </div>
      </div>

      {/* QR Scanner */}
      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <h2 className="font-semibold mb-4">Scan kræmmer-QR</h2>

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
            <div
              id={scannerContainerId}
              className="rounded-lg overflow-hidden mb-3"
            />
            <button
              onClick={stopScanner}
              className="w-full bg-gray-200 text-gray-700 py-2 rounded-lg text-sm"
            >
              Stop scanner
            </button>
          </div>
        )}

        {scanResult && scanResult.status === "aktiv" && (
          <div className="text-center">
            <div className="inline-block px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium mb-3">
              Aktiv
            </div>
            <p className="text-gray-600 text-sm mb-1">
              Oprettet:{" "}
              {new Date(scanResult.oprettet_at).toLocaleDateString("da-DK")}
            </p>
            <p className="text-gray-400 text-xs mb-4">
              ID: {scanResult.id.slice(0, 8)}...
            </p>
            <button
              onClick={udbetal}
              className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition text-lg"
            >
              Udbetal depositum
            </button>
            <button
              onClick={() => {
                setScanResult(null);
                setScanFejl(null);
              }}
              className="w-full mt-2 text-gray-500 text-sm py-2"
            >
              Annuller
            </button>
          </div>
        )}

        {scanResult && scanResult.status === "udbetalt" && (
          <div className="text-center">
            <div className="bg-red-100 border-2 border-red-400 rounded-xl p-6 mb-4">
              <p className="text-red-700 font-bold text-lg">
                ALLEREDE UDBETALT
              </p>
              <p className="text-red-600 text-sm mt-1">
                Dette depositum er allerede blevet udbetalt. Udbetal IKKE igen.
              </p>
            </div>
            <button
              onClick={() => {
                setScanResult(null);
                setScanFejl(null);
              }}
              className="text-gray-500 text-sm py-2"
            >
              Scan ny
            </button>
          </div>
        )}

        {scanFejl && (
          <div className="text-center">
            <p className="text-red-500 mb-3">{scanFejl}</p>
            <button
              onClick={() => {
                setScanResult(null);
                setScanFejl(null);
              }}
              className="text-blue-600 text-sm"
            >
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
