import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-server";

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Ikke autoriseret" }, { status: 401 });
  }

  const { depositumId } = await req.json();

  if (!depositumId || typeof depositumId !== "string") {
    return NextResponse.json({ error: "Ugyldigt ID" }, { status: 400 });
  }

  // Tjek nuværende status
  const { data: existing } = await supabaseAdmin
    .from("deposita")
    .select("status")
    .eq("id", depositumId)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Depositum ikke fundet" }, { status: 404 });
  }

  if (existing.status !== "afventer") {
    return NextResponse.json(
      { error: `Kan ikke aktivere — status er allerede '${existing.status}'` },
      { status: 409 }
    );
  }

  const { error } = await supabaseAdmin
    .from("deposita")
    .update({ status: "aktiv" })
    .eq("id", depositumId)
    .eq("status", "afventer"); // Extra guard

  if (error) {
    return NextResponse.json({ error: "Fejl ved aktivering" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
