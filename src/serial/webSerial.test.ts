import { describe, expect, it } from "vitest";
import { consumeSerialChunk } from "./webSerial";

describe("Web Serial line framing", () => {
  it("joins partial chunks, handles CRLF and tolerates unrelated text", () => {
    const first = consumeSerialChunk("", "LDR E:1800 D:2100 | Dif:300\r\nTAG LIDA:");
    expect(first.lines).toEqual(["LDR E:1800 D:2100 | Dif:300"]);
    expect(first.remainder).toBe("TAG LIDA:");

    const second = consumeSerialChunk(first.remainder, " FF FF FF FF -> ACESSO NEGADO\nlixo\n");
    expect(second.lines).toEqual(["TAG LIDA: FF FF FF FF -> ACESSO NEGADO", "lixo"]);
    expect(second.remainder).toBe("");
  });
});
