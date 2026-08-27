import { NextResponse } from "next/server";

type WakeEvent = {
  event: string;
  phrase: string;
  timestamp: number;
};

const clients = new Set<ReadableStreamDefaultController>();
let lastWake: WakeEvent | null = null;
let lastWakeTimestamp = 0;
const WAKE_COOLDOWN_MS = 3000;
const HEARTBEAT_INTERVAL_MS = 30000;

function broadcast(event: WakeEvent) {
  lastWake = event;
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const controller of clients) {
    try {
      controller.enqueue(new TextEncoder().encode(data));
    } catch {
      clients.delete(controller);
    }
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const now = Date.now();
    if (now - lastWakeTimestamp < WAKE_COOLDOWN_MS) {
      return NextResponse.json({ ok: true, throttled: true });
    }
    lastWakeTimestamp = now;
    const wakeEvent: WakeEvent = {
      event: body.event || "wake",
      phrase: body.phrase || "hey jarvis",
      timestamp: now,
    };
    broadcast(wakeEvent);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
}

export async function GET() {
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      clients.add(controller);
      const hello = `data: ${JSON.stringify({ event: "connected", timestamp: Date.now() })}\n\n`;
      controller.enqueue(new TextEncoder().encode(hello));
      heartbeat = setInterval(() => {
        try {
          const ping = `data: ${JSON.stringify({ event: "ping", timestamp: Date.now() })}\n\n`;
          controller.enqueue(new TextEncoder().encode(ping));
        } catch {
          if (heartbeat) clearInterval(heartbeat);
          clients.delete(controller);
        }
      }, HEARTBEAT_INTERVAL_MS);
    },
    cancel(controller) {
      if (heartbeat) clearInterval(heartbeat);
      clients.delete(controller as ReadableStreamDefaultController);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
