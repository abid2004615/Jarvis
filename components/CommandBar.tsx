"use client";

import { useCallback, useState } from "react";

interface CommandBarProps {
  disabled?: boolean;
  placeholder?: string;
  onSubmit: (text: string) => void;
}

export function CommandBar({
  disabled,
  placeholder = "Type a command...",
  onSubmit,
}: CommandBarProps) {
  const [value, setValue] = useState("");

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = value.trim();
      if (!trimmed || disabled) return;
      onSubmit(trimmed);
      setValue("");
    },
    [value, disabled, onSubmit],
  );

  return (
    <form className="command-bar" onSubmit={handleSubmit} role="search">
      <span className="command-bar-prompt" aria-hidden="true">&gt;</span>
      <input
        type="text"
        className="command-bar-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus
        aria-label="Type a command to JARVIS"
      />
      <button
        type="submit"
        className="command-bar-send"
        disabled={disabled || !value.trim()}
        aria-label="Send command"
      >
        SEND
      </button>
    </form>
  );
}
