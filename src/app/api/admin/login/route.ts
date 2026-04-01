import { NextResponse } from "next/server";
import { createAdminToken, setAdminCookie } from "@/lib/admin-auth";

export async function POST(req: Request) {
  const { password } = await req.json();

  if (password !== process.env.ADMIN_PASSWORD) {
    // Small delay to slow down brute force
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({ error: "Forkert adgangskode" }, { status: 401 });
  }

  const token = await createAdminToken();
  await setAdminCookie(token);

  return NextResponse.json({ ok: true });
}
