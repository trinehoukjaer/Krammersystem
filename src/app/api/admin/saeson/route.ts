import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-server";

// Luk aktiv sæson
export async function DELETE() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Ikke autoriseret" }, { status: 401 });
  }

  const { data: aktiv } = await supabaseAdmin
    .from("saesoner")
    .select("aar")
    .eq("aktiv", true)
    .single();

  if (!aktiv) {
    return NextResponse.json({ error: "Ingen aktiv sæson" }, { status: 404 });
  }

  await supabaseAdmin
    .from("saesoner")
    .update({ aktiv: false })
    .eq("aar", aktiv.aar);

  return NextResponse.json({ ok: true });
}

// Start ny sæson
export async function POST() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Ikke autoriseret" }, { status: 401 });
  }

  // Find højeste årstal
  const { data: seneste } = await supabaseAdmin
    .from("saesoner")
    .select("aar")
    .order("aar", { ascending: false })
    .limit(1)
    .single();

  const nytAar = seneste ? seneste.aar + 1 : new Date().getFullYear();

  // Luk eventuelle aktive sæsoner først
  await supabaseAdmin
    .from("saesoner")
    .update({ aktiv: false })
    .eq("aktiv", true);

  const { error } = await supabaseAdmin
    .from("saesoner")
    .insert({ aar: nytAar, aktiv: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ aar: nytAar });
}
