import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileOAuthProvider } from "./oauth.js";
import { HttpServerSpec } from "./garufile.js";
import { expandSpec, missingEnv } from "./bus.js";

const root = () => mkdtempSync(join(tmpdir(), "oauth-"));
const google = {
  clientId: "${GOOGLE_CLIENT_ID}",
  clientSecret: "${GOOGLE_CLIENT_SECRET}",
  scopes: ["https://www.googleapis.com/auth/calendar.events.readonly"],
  authorizationParams: { access_type: "offline", prompt: "consent" },
};

describe("your own OAuth client", () => {
  it("is accepted on a remote server with auth: oauth, and refused without it", () => {
    expect(HttpServerSpec.safeParse({ name: "calendar", url: "https://calendarmcp.googleapis.com/mcp/v1", auth: "oauth", oauth: google }).success).toBe(true);
    const r = HttpServerSpec.safeParse({ name: "calendar", url: "https://calendarmcp.googleapis.com/mcp/v1", oauth: google });
    expect(r.success).toBe(false);
  });

  it("takes its id and secret from .env, and says which are missing", () => {
    const spec = HttpServerSpec.parse({ name: "calendar", url: "https://calendarmcp.googleapis.com/mcp/v1", auth: "oauth", oauth: google });
    expect(missingEnv([spec], {})).toEqual(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);
    const expanded = expandSpec(spec, { GOOGLE_CLIENT_ID: "id-123", GOOGLE_CLIENT_SECRET: "s3cret" });
    expect("oauth" in expanded && expanded.oauth).toMatchObject({ clientId: "id-123", clientSecret: "s3cret" });
    expect(() => expandSpec(spec, { GOOGLE_CLIENT_ID: "id-123" })).toThrow(/GOOGLE_CLIENT_SECRET/);
  });

  it("signs in with that client, those scopes and the extra parameters", async () => {
    let opened: URL | undefined;
    const p = new FileOAuthProvider({
      root: root(), server: "calendar", url: "https://calendarmcp.googleapis.com/mcp/v1",
      client: { clientId: "id-123", clientSecret: "s3cret", scopes: google.scopes, authorizationParams: google.authorizationParams },
      onAuthorize: (u) => { opened = u; },
    });
    expect(p.clientInformation()).toEqual({ client_id: "id-123", client_secret: "s3cret" });
    expect(p.clientMetadata.token_endpoint_auth_method).toBe("client_secret_post");
    expect(p.clientMetadata.scope).toBe(google.scopes[0]);
    await p.redirectToAuthorization(new URL("https://accounts.google.com/o/oauth2/v2/auth?client_id=id-123&scope=everything"));
    expect(opened!.searchParams.get("scope")).toBe(google.scopes[0]);
    expect(opened!.searchParams.get("access_type")).toBe("offline");
    expect(opened!.searchParams.get("prompt")).toBe("consent");
  });

  it("leaves servers that register their own client exactly as before", () => {
    const p = new FileOAuthProvider({ root: root(), server: "linear", url: "https://mcp.linear.app/mcp" });
    expect(p.clientInformation()).toBeUndefined();
    expect(p.clientMetadata.token_endpoint_auth_method).toBe("none");
    expect(p.clientMetadata.scope).toBeUndefined();
  });
});
