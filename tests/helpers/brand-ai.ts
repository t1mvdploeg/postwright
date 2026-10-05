// A valid answer of the model, and a fake client that gives scripted answers: no request leaves the computer.
import { readFileSync } from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";
import type { BrandClient } from "../../src/server/ai/brand.js";

const builtIn = JSON.parse(readFileSync("src/web/brand/brand.json", "utf8"));

export const AI_PROPOSAL = {
  name: "Acme",
  url: "https://acme.example",
  colors: builtIn.colors.slice(0, 6) as { name: string; hex: string; usage: string }[],
  css: builtIn.css,
  grounds: builtIn.grounds,
  fontFamily: "Acme Sans",
  tone: "Warm, direct and plain.",
  bannedWords: ["cheap"],
  hashtags: "#acme",
};

type Params = Parameters<BrandClient["stream"]>[0];
type Message = Anthropic.Beta.Messages.BetaMessage;

/** A message of the model as the SDK would return it. `usage` overrides use the API's snake_case names. */
export function message(
  o: { text?: string; stop?: string; model?: string; usage?: Record<string, number>; blocks?: unknown[] } = {},
): Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: o.model ?? "claude-opus-5-5",
    content: [...(o.blocks ?? []), ...(o.text !== undefined ? [{ type: "text", text: o.text }] : [])],
    stop_reason: o.stop ?? "end_turn",
    stop_sequence: null,
    // 100,000 in and 10,000 out at $4 and $20 per million: $0.60.
    usage: {
      input_tokens: 100_000,
      output_tokens: 10_000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      ...o.usage,
    },
  } as unknown as Message;
}

export const fetchedPage = {
  type: "web_fetch_tool_result",
  tool_use_id: "t1",
  content: { type: "web_fetch_result", url: "https://acme.example" },
};
export const fetchFailed = {
  type: "web_fetch_tool_result",
  tool_use_id: "t1",
  content: { type: "web_fetch_tool_result_error", error_code: "url_not_accessible" },
};

/** A client that gives the replies in order (an Error is thrown) and remembers every request. */
export function fakeClient(replies: Array<Message | Error>) {
  const calls: Params[] = [];
  const client: BrandClient = {
    stream: (params) => {
      calls.push(params);
      const reply = replies[calls.length - 1];
      return {
        finalMessage: async () => {
          if (!reply) throw new Error("no reply left");
          if (reply instanceof Error) throw reply;
          return reply;
        },
      };
    },
  };
  return { client, calls };
}

export const answer = (proposal: unknown = AI_PROPOSAL) => message({ text: JSON.stringify(proposal) });
