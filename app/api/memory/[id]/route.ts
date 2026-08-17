/**
 * JARVIS Memory API — Single-entry deletion
 * Deletes one saved memory by its server-assigned id.
 */

import { NextResponse } from "next/server";

import { getMemoryManager } from "@/lib/memory";

/**
 * Delete a single memory by id.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!id || id.length > 100) {
    return NextResponse.json(
      { error: "Invalid memory id", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  const result = getMemoryManager().forget(id);
  if (!result.success) {
    return NextResponse.json(
      { error: "Memory not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, count: getMemoryManager().count() });
}
