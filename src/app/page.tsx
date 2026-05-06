"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabase";

type Status = "ny" | "afventer" | "aktiv" | "udbetalt";

// QR-payload genereres pr. minut og opdateres hvert 30. sekund.
// Format: "v1:{deviceId}:{minutterSidenEpoch}"
// Admin validerer at tidsstemplet er max 2 minutter gammelt.
const QR_REFRESH_MS = 30_000;

function buildQrPayload(deviceId: string): string {
  const minute = Math.floor(Date.now() / 60_000);
  return `v1:${deviceId}:${minute}`;
}

export default function KraemmerPage() {
  const [deviceId, setDeviceId] = useState("");
  const [depositId, setDepositId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("ny");
  const [loading, setLoading] = useState(true);
  const [qrPayload, setQrPayload] = useState("");

  // Generer eller hent device ID
  useEffect(() => {
    let id = localStorage.getItem("kraemmer_device_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("kraemmer_device_id", id);
    }
    setDeviceId(id);
  }, []);

  // Hent eller opret depositum
  useEffect(() => {
    if (!deviceId) return;

    async function init() {
      const { data: saeson } = await supabase
        .from("saesoner")
        .select("aar")
        .eq("aktiv", true)
        .single();

      if (!saeson) {
        setLoading(false);
        return;
      }

      // Tjek om der allerede findes en record
      const { data: existing } = await supabase
        .from("deposita")
        .select("id, status")
        .eq("device_id", deviceId)
        .eq("aar", saeson.aar)
        .single();

      if (existing) {
        setDepositId(existing.id);
        setStatus(existing.status as Status);
      } else {
        // Opret automatisk med status 'afventer'
        const { data: ny, error } = await supabase
          .from("deposita")
          .insert({ device_id: deviceId, aar: saeson.aar })
          .select("id")
          .single();

        if (ny && !error) {
          setDepositId(ny.id);
          setStatus("afventer");
        }
      }

      setLoading(false);
    }

    init();
  }, [deviceId]);

  // Roter QR-payload hvert 30. sekund (kun mens kræmmeren venter på scanning)
  useEffect(() => {
    if (!deviceId || status === "udbetalt" || status === "ny") return;

    setQrPayload(buildQrPayload(deviceId));
    const interval = setInterval(() => {
      setQrPayload(buildQrPayload(deviceId));
    }, QR_REFRESH_MS);

    return () => clearInterval(interval);
  }, [deviceId, status]);

  // Poll for statusopdatering hvert 3. sekund
  useEffect(() => {
    if (!depositId || status === "udbetalt") return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("deposita")
        .select("status")
        .eq("id", depositId)
        .single();

      if (data && data.status !== status) {
        setStatus(data.status as Status);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [depositId, status]);

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
        Vis din QR-kode til arrangøren
      </p>

      {/* Afventer — vis QR til første scanning */}
      {status === "afventer" && depositId && qrPayload && (
        <div className="bg-white rounded-xl shadow p-6 text-center">
          <div className="inline-block px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium mb-4">
            Afventer aktivering
          </div>
          <p className="text-gray-600 mb-4">
            Vis denne QR-kode til arrangøren ved ankomst for at betale dit
            depositum.
          </p>
          <div className="flex justify-center mb-4 p-4 bg-white rounded-lg border-2 border-gray-100">
            <QRCodeSVG value={qrPayload} size={220} level="H" />
          </div>
          <p className="text-xs text-gray-400">
            Koden fornyes automatisk. Siden opdaterer når du er aktiveret.
          </p>
        </div>
      )}

      {/* Aktiv — vis QR til anden scanning */}
      {status === "aktiv" && depositId && qrPayload && (
        <div className="bg-white rounded-xl shadow p-6 text-center">
          <div className="inline-block px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium mb-4">
            Aktiv
          </div>
          <p className="text-gray-600 mb-4">
            Dit depositum er registreret. Vis denne QR-kode til arrangøren
            når markedet er slut for at få dit depositum udbetalt.
          </p>
          <div className="flex justify-center mb-4 p-4 bg-white rounded-lg border-2 border-gray-100">
            <QRCodeSVG value={qrPayload} size={220} level="H" />
          </div>
          <p className="text-xs text-gray-400">
            Husk: Vis din pæne plads først! Koden fornyes automatisk.
          </p>
        </div>
      )}

      {/* Udbetalt */}
      {status === "udbetalt" && (
        <div className="bg-white rounded-xl shadow p-6 text-center">
          <div className="inline-block px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-medium mb-4">
            Udbetalt
          </div>
          <div className="text-5xl mb-4">&#10003;</div>
          <h2 className="text-lg font-semibold mb-2">Depositum udbetalt</h2>
          <p className="text-gray-600">
            Dit depositum er blevet udbetalt. Tak for din deltagelse!
          </p>
        </div>
      )}

      {/* Ingen sæson */}
      {status === "ny" && !loading && (
        <div className="bg-white rounded-xl shadow p-6 text-center">
          <p className="text-gray-500">
            Der er ingen aktiv sæson lige nu. Kom tilbage senere.
          </p>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center mt-8">
        Enheds-ID: {deviceId.slice(0, 8)}...
      </p>
    </div>
  );
}
