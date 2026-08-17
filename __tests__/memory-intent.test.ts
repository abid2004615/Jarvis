/**
 * JARVIS Persistent Memory — Intent Detection Tests
 * Only EXPLICIT memory intent gates persistence. Ordinary statements must not
 * be classified as "remember".
 */

import { detectMemoryIntent } from "@/lib/memory/intent";

describe("Memory intent detection", () => {
  test("detects explicit remember intent", () => {
    expect(detectMemoryIntent("remember that I prefer concise answers")).toBe("remember");
    expect(detectMemoryIntent("please remember my usual stack is Python")).toBe("remember");
    expect(detectMemoryIntent("Remember to use metric units")).toBe("remember");
    expect(detectMemoryIntent("save this preference: use dark mode")).toBe("remember");
    expect(detectMemoryIntent("keep in mind that I work in GMT")).toBe("remember");
    expect(detectMemoryIntent("note that I like short answers")).toBe("remember");
    expect(detectMemoryIntent("remember it for me: I drink decaf")).toBe("remember");
  });

  test("ordinary statements are NOT remember intent", () => {
    expect(detectMemoryIntent("I prefer dark mode")).toBe("none");
    expect(detectMemoryIntent("I usually use Python")).toBe("none");
    expect(detectMemoryIntent("My name is John")).toBe("none");
    expect(detectMemoryIntent("I like tea")).toBe("none");
    expect(detectMemoryIntent("remember how we fixed that bug last week")).toBe("none");
    expect(detectMemoryIntent("I remember the good old days")).toBe("none");
  });

  test("detects forget intent", () => {
    expect(detectMemoryIntent("forget my preference for concise answers")).toBe("forget");
    expect(detectMemoryIntent("forget that I use dark mode")).toBe("forget");
    expect(detectMemoryIntent("remove that preference")).toBe("forget");
    expect(detectMemoryIntent("stop remembering my volume preference")).toBe("forget");
  });

  test("clear intent takes priority over forget", () => {
    expect(detectMemoryIntent("forget everything")).toBe("clear");
    expect(detectMemoryIntent("clear my memory")).toBe("clear");
    expect(detectMemoryIntent("erase all your memories")).toBe("clear");
    expect(detectMemoryIntent("delete all the memories")).toBe("clear");
    expect(detectMemoryIntent("wipe your memory")).toBe("clear");
  });

  test("detects recall intent", () => {
    expect(detectMemoryIntent("what do you remember about me?")).toBe("recall");
    expect(detectMemoryIntent("do you remember my response style?")).toBe("recall");
    expect(detectMemoryIntent("what theme do I prefer?")).toBe("recall");
    expect(detectMemoryIntent("what do you know about me")).toBe("recall");
  });

  test("returns none for unrelated or empty input", () => {
    expect(detectMemoryIntent("")).toBe("none");
    expect(detectMemoryIntent("hello JARVIS")).toBe("none");
    expect(detectMemoryIntent("open safari")).toBe("none");
    expect(detectMemoryIntent("what is the weather")).toBe("none");
  });
});
