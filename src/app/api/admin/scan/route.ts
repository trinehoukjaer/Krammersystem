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

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(depositumId)) {
    return NextResponse.json({ error: "Ugyldigt QR-kode format" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("deposita")
    .select("*")
    .eq("id", depositumId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Intet depositum fundet" }, { status: 404 });
  }

  return NextResponse.json({ depositum: data });
}
