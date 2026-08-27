/**
 * Tool Filter — Intent-based tool selection for providers with token limits.
 *
 * Groq's free-tier TPM limit (8000) cannot accommodate all 65+ tool schemas
 * (~15K tokens). This module classifies the user's intent and returns only
 * the relevant tool subset, keeping the request under the limit.
 *
 * Always includes a small "core" set (time, status, system snapshot) so the
 * model always has basic context.
 */

import type { AITool } from "@/lib/ai/types";

interface ToolCategory {
  name: string;
  keywords: RegExp;
  tools: string[];
}

const CATEGORIES: ToolCategory[] = [
  {
    name: "system_stats",
    keywords: /\b(cpu|memory|ram|disk|battery|network|uptime|process|telemetry|system\s*(stats|status|snapshot|health|report|summary|overview))\b/i,
    tools: [
      "get_cpu_usage",
      "get_memory_usage",
      "get_disk_usage",
      "get_battery_status",
      "get_network_status",
      "get_system_uptime",
      "get_process_summary",
      "get_system_snapshot",
      "get_system_status",
      "get_system_summary",
      "get_app_status",
    ],
  },
  {
    name: "app_control",
    keywords: /\b(launch|open|start|run|quit|close|exit|focus|switch|minimize|window|app(?:lication)?|frontmost|running)\b/i,
    tools: [
      "launch_application",
      "quit_application",
      "focus_application",
      "get_frontmost_application",
      "get_running_applications",
      "list_windows",
      "get_active_window",
      "close_window",
      "minimize_window",
    ],
  },
  {
    name: "safari",
    keywords: /\b(safari|browser|tab|url|website|web\s*page|browse)\b/i,
    tools: [
      "get_safari_state",
      "open_url_in_safari",
      "new_safari_tab",
      "close_safari_tab",
      "close_safari",
    ],
  },
  {
    name: "music",
    keywords: /\b(music|song|track|play|pause|skip|next|previous|artist|album|spotify|apple\s*music|playlist)\b/i,
    tools: [
      "get_music_state",
      "control_music",
      "play_track",
    ],
  },
  {
    name: "calendar",
    keywords: /\b(calendar|event|meeting|appointment|schedule|today|tomorrow|upcoming|reminder)\b/i,
    tools: [
      "get_today_events",
      "get_upcoming_events",
      "create_calendar_event",
    ],
  },
  {
    name: "memory",
    keywords: /\b(remember|recall|memory|memories|forget|clear\s*memory|what\s*do\s*you\s*know|preference|save)\b/i,
    tools: [
      "remember_user_preference",
      "recall_user_memory",
      "list_user_memories",
      "forget_user_memory",
      "clear_user_memory",
    ],
  },
  {
    name: "automation",
    keywords: /\b(automat|schedule|routine|cron|recurring|daily|weekly|hourly|trigger|condition)\b/i,
    tools: [
      "notify_user",
    ],
  },
  {
    name: "files",
    keywords: /\b(file|folder|directory|find|search|list\s*files?|open\s*file|reveal|finder|document)\b/i,
    tools: [
      "list_files",
      "search_files",
      "open_file",
      "open_folder",
      "reveal_file",
    ],
  },
  {
    name: "screen",
    keywords: /\b(screen|screenshot|capture|ocr|read\s*screen|analyze\s*screen|what\s*(am\s*I|do\s*you)\s*see|look\s*at|vision)\b/i,
    tools: [
      "get_screen_context",
      "capture_screen",
      "read_screen_text",
      "analyze_screen",
      "take_screenshot",
    ],
  },
  {
    name: "computer_use",
    keywords: /\b(click|type|scroll|press|keyboard|mouse|cursor|keypress|tap)\b/i,
    tools: [
      "computer_click",
      "computer_type",
      "computer_scroll",
      "computer_keypress",
      "computer_use_status",
    ],
  },
  {
    name: "clipboard",
    keywords: /\b(clipboard|copy|paste|cut)\b/i,
    tools: [
      "get_clipboard",
      "set_clipboard",
      "clear_clipboard",
    ],
  },
  {
    name: "volume_brightness",
    keywords: /\b(volume|brightness|screen\s*bright|display\s*bright|sound|audio|mute)\b/i,
    tools: [
      "get_volume_status",
      "set_volume",
      "get_brightness_status",
      "set_brightness",
    ],
  },
];

const CORE_TOOLS = [
  "get_current_time",
  "get_system_snapshot",
  "list_available_tools",
];

/**
 * Filter tools based on the user's message intent.
 * Always includes core tools. Adds category-matched tools.
 * Caps at `maxTools` to stay under the provider's token limit.
 */
export function filterToolsByIntent(
  allTools: AITool[],
  userMessage: string,
  maxTools: number = 20,
): AITool[] {
  const toolMap = new Map(allTools.map((t) => [t.name, t]));
  const selected = new Set<string>();

  for (const name of CORE_TOOLS) {
    if (toolMap.has(name)) selected.add(name);
  }

  for (const category of CATEGORIES) {
    if (category.keywords.test(userMessage)) {
      for (const name of category.tools) {
        if (toolMap.has(name) && !selected.has(name)) {
          selected.add(name);
        }
      }
    }
  }

  if (selected.size < maxTools) {
    for (const tool of allTools) {
      if (!selected.has(tool.name)) {
        selected.add(tool.name);
        if (selected.size >= maxTools) break;
      }
    }
  }

  return Array.from(selected)
    .map((name) => toolMap.get(name)!)
    .filter(Boolean)
    .slice(0, maxTools);
}
