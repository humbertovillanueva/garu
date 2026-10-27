import { describe, expect, it } from "vitest";
import { appPairLink, parsePairing } from "./pairlink";

const tok = "abcdefghijklmnopqrstuvwxyz0123456789ABCD";

describe("parsePairing", () => {
  it("reads the sign-in link", () => {
    expect(parsePairing(`https://my-mac.tail1234.ts.net/?token=${tok}`)).toEqual({ base: "https://my-mac.tail1234.ts.net", token: tok });
    expect(parsePairing(`  https://my-mac.tail1234.ts.net/?lang=es&token=${tok}#/home `)).toEqual({ base: "https://my-mac.tail1234.ts.net", token: tok });
  });
  it("reads the app link, encoded or not", () => {
    expect(parsePairing(`garu://pair?base=https%3A%2F%2Fmy-mac.tail1234.ts.net&token=${tok}`)).toEqual({ base: "https://my-mac.tail1234.ts.net", token: tok });
    expect(parsePairing(`garu://pair?base=https://my-mac.tail1234.ts.net/&token=${tok}`)).toEqual({ base: "https://my-mac.tail1234.ts.net", token: tok });
    expect(parsePairing(`GARU://pair?token=${tok}&base=http://192.168.1.4:4000`)).toEqual({ base: "http://192.168.1.4:4000", token: tok });
  });
  it("reads an address and a token in either order", () => {
    expect(parsePairing(`my-mac.tail1234.ts.net ${tok}`)).toEqual({ base: "https://my-mac.tail1234.ts.net", token: tok });
    expect(parsePairing(`${tok} https://my-mac.tail1234.ts.net`)).toEqual({ base: "https://my-mac.tail1234.ts.net", token: tok });
  });
  it("refuses what isn't a pairing link", () => {
    expect(parsePairing("https://my-mac.tail1234.ts.net/")).toBeNull();
    expect(parsePairing(`garu://pair?token=${tok}`)).toBeNull();
    expect(parsePairing(`garu://pair?base=ftp://x&token=${tok}`)).toBeNull();
    expect(parsePairing("garu://pair?base=https://x&token=short")).toBeNull();
    expect(parsePairing("garu://settings")).toBeNull();
    expect(parsePairing("")).toBeNull();
  });
  it("round-trips the app link it builds", () => {
    const link = appPairLink("https://my-mac.tail1234.ts.net/", tok);
    expect(link).toBe(`garu://pair?base=https%3A%2F%2Fmy-mac.tail1234.ts.net&token=${tok}`);
    expect(parsePairing(link)).toEqual({ base: "https://my-mac.tail1234.ts.net", token: tok });
  });
});
