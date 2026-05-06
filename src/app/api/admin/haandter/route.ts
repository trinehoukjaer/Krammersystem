import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-server";

// Kombineret scan + auto-handling i ét kald
// Returnerer: { resultat: "aktiveret" | "udbetalt" | "allerede_udbetalt" | "ukendt" }
//
// QR-payload: "v1:{deviceId}:{minutterSidenEpoch}"
//  - deviceId : kræmmerens lokale enheds-ID (UUID)
//  - minute   : Math.floor(Date.now() / 60_000) på det tidspunkt QR'en blev tegnet
//
// Tidsvalidering: koden afvises hvis den er > 2 minutter gammel.
const MAX_CODE_AGE_MINUTES = 2;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ParsedQr =
  | { ok: true; deviceId: string; minute: number }
  | { ok: false; error: string; status: number };

function parseQrPayload(raw: string): ParsedQr {
  const parts = raw.split(":");
  if (parts.length !== 3 || parts[0] !== "v1") {
    return { ok: false, error: "Ugyldigt QR-kode format", status: 400 };
  }
  const [, deviceId, minuteStr] = parts;
  if (!UUID_RE.test(deviceId)) {
    return { ok: false, error: "Ugyldigt QR-kode format", status: 400 };
  }
  const minute = Number.parseInt(minuteStr, 10);
  if (!Number.isFinite(minute) || minute <= 0) {
    return { ok: false, error: "Ugyldigt QR-kode format", status: 400 };
  }
  return { ok: true, deviceId, minute };
}

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Ikke autoriseret" }, { status: 401 });
  }

  const { depositumId } = await req.json();

  if (!depositumId || typeof depositumId !== "string") {
    return NextResponse.json({ error: "Ugyldigt ID" }, { status: 400 });
  }

  const parsed = parseQrPayload(depositumId);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  // Tidsvalidering: max 2 minutter gammel
  const currentMinute = Math.floor(Date.now() / 60_000);
  const ageMinutes = currentMinute - parsed.minute;
  if (ageMinutes > MAX_CODE_AGE_MINUTES || ageMinutes < -1) {
    return NextResponse.json(
      { error: "Udløbet kode - bed kræmmeren opdatere siden" },
      { status: 410 }
    );
  }

  // Find aktiv sæson
  const { data: saeson, error: saesonError } = await supabaseAdmin
    .from("saesoner")
    .select("aar")
    .eq("aktiv", true)
    .single();

  if (saesonError || !saeson) {
    return NextResponse.json({ error: "Ingen aktiv sæson" }, { status: 404 });
  }

  // Hent depositum via deviceId + sæson
  const { data, error: fetchError } = await supabaseAdmin
    .from("deposita")
    .select("id, status")
    .eq("device_id", parsed.deviceId)
    .eq("aar", saeson.aar)
    .single();

  if (fetchError || !data) {
    return NextResponse.json({ error: "Intet depositum fundet" }, { status: 404 });
  }

  // Afventer → aktiv (DB-guard sikrer at status faktisk var 'afventer')
  if (data.status === "afventer") {
    const { data: updated, error } = await supabaseAdmin
      .from("deposita")
      .update({ status: "aktiv" })
      .eq("id", data.id)
      .eq("status", "afventer")
      .select("id")
      .single();

    if (error || !updated) {
      return NextResponse.json({ error: "Fejl ved aktivering" }, { status: 500 });
    }

    return NextResponse.json({ resultat: "aktiveret" });
  }

  // Aktiv → udbetalt (DB-guard sikrer at status faktisk var 'aktiv')
  if (data.status === "aktiv") {
    const { data: updated, error } = await supabaseAdmin
      .from("deposita")
      .update({ status: "udbetalt" })
      .eq("id", data.id)
      .eq("status", "aktiv")
      .select("id")
      .single();

    if (error || !updated) {
      return NextResponse.json({ error: "Fejl ved udbetaling" }, { status: 500 });
    }

    return NextResponse.json({ resultat: "udbetalt" });
  }

  // Allerede udbetalt
  if (data.status === "udbetalt") {
    return NextResponse.json({ resultat: "allerede_udbetalt" });
  }

  return NextResponse.json({ error: "Ukendt status" }, { status: 500 });
}
