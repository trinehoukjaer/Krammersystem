import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-server";

// Kombineret scan + auto-handling i ét kald
// Returnerer: { resultat: "aktiveret" | "udbetalt" | "allerede_udbetalt" | "ukendt" }
export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Ikke autoriseret" }, { status: 401 });
  }

  const { depositumId } = await req.json();

  if (!depositumId || typeof depositumId !== "string") {
    return NextResponse.json({ error: "Ugyldigt ID" }, { status: 400 });
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(depositumId)) {
    return NextResponse.json({ error: "Ugyldigt QR-kode format" }, { status: 400 });
  }

  // Hent nuværende status
  const { data, error: fetchError } = await supabaseAdmin
    .from("deposita")
    .select("id, status, device_id, aar, oprettet_at")
    .eq("id", depositumId)
    .single();

  if (fetchError || !data) {
    return NextResponse.json({ error: "Intet depositum fundet" }, { status: 404 });
  }

  // Afventer → aktiv
  if (data.status === "afventer") {
    const { error } = await supabaseAdmin
      .from("deposita")
      .update({ status: "aktiv" })
      .eq("id", depositumId)
      .eq("status", "afventer");

    if (error) {
      return NextResponse.json({ error: "Fejl ved aktivering" }, { status: 500 });
    }

    return NextResponse.json({ resultat: "aktiveret" });
  }

  // Aktiv → udbetalt
  if (data.status === "aktiv") {
    const { error } = await supabaseAdmin
      .from("deposita")
      .update({ status: "udbetalt" })
      .eq("id", depositumId)
      .eq("status", "aktiv");

    if (error) {
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
