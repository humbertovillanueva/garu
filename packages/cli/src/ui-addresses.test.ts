import { describe, expect, it } from "vitest";
import { SeenHosts, parseServeStatus } from "./ui-addresses.js";

describe("tailscale serve status", () => {
  it("reads the json form", () => {
    const out = JSON.stringify({ TCP: { "443": { HTTPS: true } }, Web: { "your-mac.tail1234.ts.net:443": { Handlers: { "/": { Proxy: "http://127.0.0.1:4000" } } } } });
    expect(parseServeStatus(out, 4000)).toEqual(["https://your-mac.tail1234.ts.net/"]);
    expect(parseServeStatus(out, 5000)).toEqual([]);
  });
  it("reads the text form", () => {
    const out = `https://your-mac.tail1234.ts.net (tailnet only)\n|-- / proxy http://127.0.0.1:4000\n\nhttps://your-mac.tail1234.ts.net:8443 (tailnet only)\n|-- / proxy http://127.0.0.1:3000\n`;
    expect(parseServeStatus(out, 4000)).toEqual(["https://your-mac.tail1234.ts.net/"]);
  });
  it("handles nothing served", () => {
    expect(parseServeStatus("No serve config\n", 4000)).toEqual([]);
    expect(parseServeStatus("{}", 4000)).toEqual([]);
  });
});

describe("seen hosts", () => {
  it("remembers proxied addresses and ignores localhost", () => {
    const s = new SeenHosts();
    s.note({ "x-forwarded-host": "your-mac.tail1234.ts.net", "x-forwarded-proto": "https" });
    s.note({ "x-forwarded-host": "your-mac.tail1234.ts.net", "x-forwarded-proto": "https" });
    s.note({ "x-forwarded-host": "localhost:4000", "x-forwarded-proto": "http" });
    s.note({ host: "localhost:4000" });
    expect(s.list()).toEqual(["https://your-mac.tail1234.ts.net/"]);
  });
});
