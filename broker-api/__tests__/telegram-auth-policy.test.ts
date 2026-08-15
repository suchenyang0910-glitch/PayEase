import { describe, expect, it } from "vitest";
import {
  isControlledPreview,
  isUnauthenticatedControlledPreview,
  requiresTelegramAuthentication,
  requiresTelegramPhoneVerification,
} from "../src/telegram-auth-policy.js";

describe("Telegram authentication deployment policy", () => {
  it("fails closed in an ordinary production deployment", () => {
    expect(requiresTelegramAuthentication({ NODE_ENV: "production" })).toBe(
      true,
    );
  });

  it("keeps a controlled preview authenticated until its operator opts out explicitly", () => {
    expect(
      requiresTelegramAuthentication({
        NODE_ENV: "production",
        PAYEASE_DEPLOYMENT_MODE: "controlled-preview",
        REQUIRE_TELEGRAM_AUTH: "false",
      }),
    ).toBe(true);
  });

  it("permits unauthenticated UX review only with both preview markers", () => {
    const preview = {
      NODE_ENV: "production",
      PAYEASE_DEPLOYMENT_MODE: "controlled-preview",
      PAYEASE_ALLOW_UNAUTHENTICATED_PREVIEW: "true",
      REQUIRE_TELEGRAM_AUTH: "false",
    };
    expect(requiresTelegramAuthentication(preview)).toBe(false);
    expect(isUnauthenticatedControlledPreview(preview)).toBe(true);
  });

  it("marks only the explicit preview mode as controlled preview", () => {
    expect(
      isControlledPreview({ PAYEASE_DEPLOYMENT_MODE: "controlled-preview" }),
    ).toBe(true);
    expect(isControlledPreview({ PAYEASE_DEPLOYMENT_MODE: "production" })).toBe(
      false,
    );
    expect(isControlledPreview({})).toBe(false);
  });

  it("enables verification in a preview as soon as it is configured", () => {
    const authenticatedPreview = {
      NODE_ENV: "production",
      PAYEASE_DEPLOYMENT_MODE: "controlled-preview",
      PAYEASE_ALLOW_UNAUTHENTICATED_PREVIEW: "true",
      REQUIRE_TELEGRAM_AUTH: "true",
    };
    expect(requiresTelegramAuthentication(authenticatedPreview)).toBe(true);
    expect(isUnauthenticatedControlledPreview(authenticatedPreview)).toBe(
      false,
    );
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

  it("requires an explicit verified-contact rollout flag", () => {
    expect(requiresTelegramPhoneVerification({ NODE_ENV: "production" })).toBe(
      false,
    );
    expect(
      requiresTelegramPhoneVerification({
        NODE_ENV: "production",
        REQUIRE_TELEGRAM_PHONE_VERIFICATION: "true",
      }),
    ).toBe(true);
    expect(
      requiresTelegramPhoneVerification({
        NODE_ENV: "test",
        REQUIRE_TELEGRAM_AUTH: "false",
        REQUIRE_TELEGRAM_PHONE_VERIFICATION: "true",
      }),
    ).toBe(false);
  });
});
