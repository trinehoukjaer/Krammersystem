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

  // Check current status first to prevent race conditions
  const { data: existing } = await supabaseAdmin
    .from("deposita")
    .select("status")
    .eq("id", depositumId)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Depositum ikke fundet" }, { status: 404 });
  }

  if (existing.status === "udbetalt") {
    return NextResponse.json({ error: "Allerede udbetalt" }, { status: 409 });
  }

  const { error } = await supabaseAdmin
    .from("deposita")
    .update({ status: "udbetalt" })
    .eq("id", depositumId)
    .eq("status", "aktiv"); // Extra guard

  if (error) {
    return NextResponse.json({ error: "Fejl ved udbetaling" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
