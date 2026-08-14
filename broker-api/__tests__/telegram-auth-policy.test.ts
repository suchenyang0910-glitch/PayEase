import { describe, expect, it } from "vitest";
import { requiresTelegramAuthentication } from "../src/telegram-auth-policy.js";

describe("Telegram authentication deployment policy", () => {
  it("fails closed in an ordinary production deployment", () => {
    expect(requiresTelegramAuthentication({ NODE_ENV: "production" })).toBe(
      true,
    );
  });

  it("permits unauthenticated UX review only in an explicitly labelled preview", () => {
    expect(
      requiresTelegramAuthentication({
        NODE_ENV: "production",
        PAYEASE_DEPLOYMENT_MODE: "controlled-preview",
        REQUIRE_TELEGRAM_AUTH: "false",
      }),
    ).toBe(false);
  });

  it("enables verification in a preview as soon as it is configured", () => {
    expect(
      requiresTelegramAuthentication({
        NODE_ENV: "production",
        PAYEASE_DEPLOYMENT_MODE: "controlled-preview",
        REQUIRE_TELEGRAM_AUTH: "true",
      }),
    ).toBe(true);
  });

  it("keeps tests explicit so disposable fixtures can test both modes", () => {
    expect(
      requiresTelegramAuthentication({
        NODE_ENV: "test",
        REQUIRE_TELEGRAM_AUTH: "false",
      }),
    ).toBe(false);
    expect(
      requiresTelegramAuthentication({
        NODE_ENV: "test",
        REQUIRE_TELEGRAM_AUTH: "true",
      }),
    ).toBe(true);
  });
});
