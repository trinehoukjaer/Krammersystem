"use client";

import { useEffect, useState, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabase";

type Status = "ingen" | "aktiv" | "udbetalt";

export default function KraemmerPage() {
  const [deviceId, setDeviceId] = useState<string>("");
  const [depositId, setDepositId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("ingen");
  const [loading, setLoading] = useState(true);
  const [registrering, setRegistrering] = useState(false);
  const [billedeUrl, setBilledeUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Generer eller hent device ID
  useEffect(() => {
    let id = localStorage.getItem("kraemmer_device_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("kraemmer_device_id", id);
    }
    setDeviceId(id);
  }, []);

  // Hent eksisterende depositum
  useEffect(() => {
    if (!deviceId) return;

    async function hentStatus() {
      // Find aktiv sæson
      const { data: saeson } = await supabase
        .from("saesoner")
        .select("aar")
        .eq("aktiv", true)
        .single();

      if (!saeson) {
        setStatus("ingen");
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("deposita")
        .select("id, status")
        .eq("device_id", deviceId)
        .eq("aar", saeson.aar)
        .single();

      if (data) {
        setDepositId(data.id);
        setStatus(data.status as Status);
      } else {
        setStatus("ingen");
      }
      setLoading(false);
    }

    hentStatus();
  }, [deviceId]);

  async function registrer() {
    setRegistrering(true);

    const { data: saeson } = await supabase
      .from("saesoner")
      .select("aar")
      .eq("aktiv", true)
      .single();

    if (!saeson) {
      alert("Ingen aktiv sæson fundet. Kontakt arrangøren.");
      setRegistrering(false);
      return;
    }

    const { data, error } = await supabase
      .from("deposita")
      .insert({ device_id: deviceId, aar: saeson.aar })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        alert("Denne enhed er allerede registreret for denne sæson.");
      } else {
        alert("Fejl ved registrering: " + error.message);
      }
      setRegistrering(false);
      return;
    }

    setDepositId(data.id);
    setStatus("aktiv");
    setRegistrering(false);
  }

  function haandterBillede(e: React.ChangeEvent<HTMLInputElement>) {
    const fil = e.target.files?.[0];
    if (fil) {
      const url = URL.createObjectURL(fil);
      setBilledeUrl(url);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500 text-lg">Indlæser...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6 pt-10">
      <h1 className="text-2xl font-bold text-center mb-2">
        Kræmmer Depositum
      </h1>
      <p className="text-gray-500 text-center text-sm mb-8">
        Registrér dit depositum og vis din QR-kode til udbetaling
      </p>

      {/* Ingen registrering endnu */}
      {status === "ingen" && (
        <div className="bg-white rounded-xl shadow p-6 text-center">
          <div className="text-5xl mb-4">🏪</div>
          <h2 className="text-lg font-semibold mb-2">Velkommen, kræmmer!</h2>
          <p className="text-gray-600 mb-6">
            Tryk på knappen herunder for at registrere dit depositum.
          </p>
          <button
            onClick={registrer}
            disabled={registrering}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {registrering ? "Registrerer..." : "Registrér depositum"}
          </button>
        </div>
      )}

      {/* Aktiv - vis QR-kode */}
      {status === "aktiv" && depositId && (
        <div className="bg-white rounded-xl shadow p-6 text-center">
          <div className="inline-block px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium mb-4">
            ● Aktiv
          </div>
          <p className="text-gray-600 mb-4">
            Vis denne QR-kode til arrangøren for at få dit depositum udbetalt.
          </p>
          <div className="flex justify-center mb-6 p-4 bg-white rounded-lg border-2 border-gray-100">
            <QRCodeSVG value={depositId} size={200} level="H" />
          </div>

          {/* Billede-upload (kun lokal visning) */}
          <div className="border-t pt-4">
            <p className="text-sm text-gray-500 mb-3">
              Tag et billede af din pæne plads (valgfrit)
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={haandterBillede}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-200 transition"
            >
              📷 {billedeUrl ? "Skift billede" : "Tag billede"}
            </button>
            {billedeUrl && (
              <img
                src={billedeUrl}
                alt="Plads-billede"
                className="mt-4 rounded-lg w-full object-cover max-h-64"
              />
            )}
          </div>
        </div>
      )}

      {/* Udbetalt */}
      {status === "udbetalt" && (
        <div className="bg-white rounded-xl shadow p-6 text-center">
          <div className="inline-block px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-medium mb-4">
            ✓ Udbetalt
          </div>
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-lg font-semibold mb-2">Depositum udbetalt</h2>
          <p className="text-gray-600">
            Dit depositum er blevet udbetalt. Tak for din deltagelse, og vi ses
            næste år!
          </p>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center mt-8">
        Enheds-ID: {deviceId.slice(0, 8)}...
      </p>
    </div>
  );
}
