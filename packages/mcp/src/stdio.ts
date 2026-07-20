import { canonicalJson, redactMessage } from "mergora";

import type { MergoraMcpLineTransportOptions } from "./contracts.js";
import { createMergoraMcpServer, MERGORA_MCP_MAX_INPUT_BYTES } from "./server.js";

const encoder = new TextEncoder();

function inputBytes(value: string): number {
  return encoder.encode(value).byteLength;
}

function transportFailure(code: string, message: string): string {
  return `${canonicalJson({
    id: null,
    ok: false,
    error: { code, message: redactMessage(message).slice(0, 1024) },
  })}\n`;
}

/**
 * Runs a newline-delimited, adapter-neutral request loop. Node stdin/stdout can
 * be supplied by a tiny host adapter without giving this package process-level
 * side effects or coupling the core to one MCP SDK release.
 */
export async function runMergoraMcpLineTransport(
  options: MergoraMcpLineTransportOptions,
): Promise<void> {
  const server = options.server ?? createMergoraMcpServer();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffered = "";
  const processLines = async (): Promise<void> => {
    for (;;) {
      const newline = buffered.indexOf("\n");
      if (newline < 0) return;
      const line = buffered.slice(0, newline).replace(/\r$/u, "");
      buffered = buffered.slice(newline + 1);
      if (line.trim() === "") continue;
      await options.write(await server.handleLine(line));
    }
  };
  try {
    for await (const chunk of options.input) {
      buffered += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
      if (inputBytes(buffered) > MERGORA_MCP_MAX_INPUT_BYTES && !buffered.includes("\n")) {
        await options.write(
          transportFailure("MCP_REQUEST_TOO_LARGE", "MCP request exceeds 64 KiB."),
        );
        buffered = "";
        continue;
      }
      await processLines();
    }
    buffered += decoder.decode();
    await processLines();
    if (buffered.trim() !== "") {
      await options.write(await server.handleLine(buffered.replace(/\r$/u, "")));
    }
  } catch (error) {
    await options.write(
      transportFailure(
        "MCP_TRANSPORT_ENCODING_INVALID",
        error instanceof Error ? error.message : "MCP transport received invalid UTF-8.",
      ),
    );
  }
}
