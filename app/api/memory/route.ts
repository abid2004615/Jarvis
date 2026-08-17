/**
 * JARVIS Memory API Endpoint
 * Read-only inspection of persistent memory (GET) and, guarded by an explicit
 * confirmation flag, full clear (DELETE). The browser can never write arbitrary
 * memory objects — mutation happens exclusively through the AI tool pipeline.
 */

import { NextRequest, NextResponse } from "next/server";

import { getMemoryManager } from "@/lib/memory";

export interface MemoryApiItem {
  id: string;
  category: string;
  key: string;
  value: string;
  updatedAt: number;
}

export interface MemoryApiResponse {
  count: number;
  memories: MemoryApiItem[];
}

/**
 * List saved memories (server-side read; values are sanitized at write time,
 * so no credentials can exist here).
 */
export async function GET(): Promise<NextResponse<MemoryApiResponse>> {
  const manager = getMemoryManager();
  const entries = manager.list();
  const memories: MemoryApiItem[] = entries.map((entry) => ({
    id: entry.id,
    category: entry.category,
    key: entry.key,
    value: entry.value,
    updatedAt: entry.updatedAt,
  }));
  return NextResponse.json({ count: memories.length, memories });
}

/**
 * Clear ALL memories. Requires an explicit `{ confirm: true }` body so an
 * accidental or naive client cannot wipe the user's memory.
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "confirm must be true", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const confirm = (body as { confirm?: unknown } | null)?.confirm;
    if (confirm !== true) {
      return NextResponse.json(
        { error: "confirm must be true", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const result = getMemoryManager().clear();
    return NextResponse.json({
      success: result.success,
      deleted: result.data,
      count: getMemoryManager().count(),
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
