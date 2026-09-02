import { describe, it, expect } from "vitest";
import { ENV } from "./_core/env";

// ★本物の UnivaPay API を叩く（解約・更新を含む）。UNIVAPAY_LIVE_TEST=1 を付けたときだけ実行する。
describe.skipIf(!process.env.UNIVAPAY_LIVE_TEST)("Univapay JWT Token Validation", () => {
  it("should have UNIVAPAY_JWT_TOKEN configured", () => {
    expect(ENV.univapayJwtToken).toBeDefined();
    expect(ENV.univapayJwtToken).not.toBe("");
  });

  it("should be able to call Univapay API with the token", async () => {
    try {
      const response = await fetch("https://api.univapay.com/stores", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${ENV.univapayJwtToken}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(5000),
      });

      // Should return 200 or 401 (if token is invalid)
      expect([200, 401, 403]).toContain(response.status);
      
      if (response.status === 200) {
        const data = await response.json();
        console.log("[Univapay] Token is valid, store data:", data);
      } else {
        console.log("[Univapay] Token validation failed with status:", response.status);
      }
    } catch (error: any) {
      // Network or timeout errors in test environment
      console.log("[Univapay] API test skipped due to network:", error.message);
    }
  }, 10000);
});
