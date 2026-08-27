import { NextResponse } from "next/server";
import { checkScreenRecordingPermission } from "@/lib/vision";

export async function POST() {
  const permission = checkScreenRecordingPermission();
  return NextResponse.json({ permission });
}
