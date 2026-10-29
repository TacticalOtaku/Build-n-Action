/// <reference types="node" />
import { crc32, inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createZip } from "./zip";

interface Read {
  data: string;
  crcMatches: boolean;
}

/** Read an archive back through its central directory, as unzip tools do. */
function readZip(zip: Uint8Array): Map<string, Read> {
  const buffer = Buffer.from(zip);
  const end = buffer.length - 22;
  expect(buffer.readUInt32LE(end)).toBe(0x06054B50);
  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  const files = new Map<string, Read>();
  for (let index = 0; index < count; index++) {
    expect(buffer.readUInt32LE(at)).toBe(0x02014B50);
    expect(buffer.readUInt16LE(at + 10)).toBe(8);
    const crc = buffer.readUInt32LE(at + 16);
    const size = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const offset = buffer.readUInt32LE(at + 42);
    const name = buffer.toString("utf8", at + 46, at + 46 + nameLength);
    expect(buffer.readUInt32LE(offset)).toBe(0x04034B50);
    const start = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28);
    const data = inflateRawSync(buffer.subarray(start, start + size));
    files.set(name, { data: data.toString("utf8"), crcMatches: crc32(data) === crc });
    at += 46 + nameLength + buffer.readUInt16LE(at + 30) + buffer.readUInt16LE(at + 32);
  }
  return files;
}

const text = (value: string) => new TextEncoder().encode(value);

describe("createZip", () => {
  it("stores every entry under its path, deflated, with its checksum", () => {
    const zip = createZip([
      { path: "module.json", data: text("{\"id\":\"build-n-action\"}") },
      { path: "lang/ru.json", data: text("{\"BNA\":\"Проверка\"}") },
      { path: "chunks/empty.mjs", data: new Uint8Array() }
    ]);
    const files = readZip(zip);
    expect([...files.keys()]).toEqual(["module.json", "lang/ru.json", "chunks/empty.mjs"]);
    expect(files.get("lang/ru.json")).toEqual({ data: "{\"BNA\":\"Проверка\"}", crcMatches: true });
    expect(files.get("chunks/empty.mjs")).toEqual({ data: "", crcMatches: true });
  });

  it("is reproducible for the same entries and date", () => {
    const entries = [{ path: "a.txt", data: text("a".repeat(1000)) }];
    const date = new Date(2026, 8, 24, 12, 0, 0);
    expect(createZip(entries, date)).toEqual(createZip(entries, date));
    expect(createZip(entries, date).length).toBeLessThan(1000);
  });
});
