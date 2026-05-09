/**
 * One-off device-code login against an Entra app to mint a refresh token.
 * Persists the token under ~/.paperclip/secrets/m365.json (mode 0600).
 *
 * Run: pnpm tsx jolmes/scripts/m365/bootstrap.ts
 *
 * Env (required):
 *   M365_TENANT_ID   - Entra tenant id (or "common" for multi-tenant)
 *   M365_CLIENT_ID   - Entra application (public client) id
 * Env (optional):
 *   M365_SCOPE       - override scopes (default: Tasks.ReadWrite Mail.Read offline_access User.Read)
 */
import { writeM365Secret } from "./lib/secrets.js";
import { DEFAULT_SCOPE } from "./lib/graph.js";

type DeviceCodeResponse = {
  user_code: string;
  device_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message: string;
};

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
};

type TokenError = { error: string; error_description?: string };

function decodeIdTokenAccount(idToken?: string): string | undefined {
  if (!idToken) return undefined;
  const parts = idToken.split(".");
  if (parts.length < 2) return undefined;
  try {
    const json = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return json.preferred_username ?? json.upn ?? json.email;
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const tenantId = process.env.M365_TENANT_ID;
  const clientId = process.env.M365_CLIENT_ID;
  const scope = process.env.M365_SCOPE ?? DEFAULT_SCOPE;
  if (!tenantId || !clientId) {
    console.error("Missing M365_TENANT_ID or M365_CLIENT_ID. See jolmes/docs/M365-TODO-SYNC.md.");
    process.exit(1);
  }

  const codeRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, scope }),
    },
  );
  if (!codeRes.ok) {
    console.error("Device-code request failed:", codeRes.status, await codeRes.text());
    process.exit(1);
  }
  const code = (await codeRes.json()) as DeviceCodeResponse;
  console.log("\n=====================================================");
  console.log(code.message);
  console.log("=====================================================\n");

  const interval = Math.max(code.interval, 5) * 1000;
  const deadline = Date.now() + code.expires_in * 1000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));
    const tokRes = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          client_id: clientId,
          device_code: code.device_code,
        }),
      },
    );
    if (tokRes.ok) {
      const tok = (await tokRes.json()) as TokenResponse;
      const account = decodeIdTokenAccount(tok.id_token);
      await writeM365Secret({
        tenantId,
        clientId,
        refreshToken: tok.refresh_token,
        scope: tok.scope ?? scope,
        account,
        obtainedAt: new Date().toISOString(),
      });
      console.log(`OK. Refresh token stored (${account ?? "unknown account"}).`);
      return;
    }
    const err = (await tokRes.json().catch(() => ({}))) as TokenError;
    if (err.error === "authorization_pending") continue;
    if (err.error === "slow_down") {
      await new Promise((r) => setTimeout(r, interval));
      continue;
    }
    console.error("Token poll failed:", err);
    process.exit(1);
  }
  console.error("Device-code flow timed out.");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
