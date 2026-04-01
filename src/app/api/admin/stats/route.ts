import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-server";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Ikke autoriseret" }, { status: 401 });
  }

  const { data: saesoner } = await supabaseAdmin
    .from("saesoner")
    .select("*")
    .order("aar", { ascending: false });

  const aktiv = saesoner?.find((s) => s.aktiv);
  let stats = { afventer: 0, aktive: 0, udbetalte: 0 };

  if (aktiv) {
    const { count: afventer } = await supabaseAdmin
      .from("deposita")
      .select("*", { count: "exact", head: true })
      .eq("aar", aktiv.aar)
      .eq("status", "afventer");

    const { count: aktive } = await supabaseAdmin
      .from("deposita")
      .select("*", { count: "exact", head: true })
      .eq("aar", aktiv.aar)
      .eq("status", "aktiv");

    const { count: udbetalte } = await supabaseAdmin
      .from("deposita")
      .select("*", { count: "exact", head: true })
      .eq("aar", aktiv.aar)
      .eq("status", "udbetalt");

    stats = {
      afventer: afventer ?? 0,
      aktive: aktive ?? 0,
      udbetalte: udbetalte ?? 0,
    };
  }

  return NextResponse.json({
    saesoner: saesoner ?? [],
    aktivSaeson: aktiv?.aar ?? null,
    stats,
  });
}
