import { describe, expect, it } from "vitest";
import { requestTelegramPhoneContact } from "../src/telegram-phone-contact.ts";

describe("Telegram phone-contact request", () => {
  it("delegates to Telegram's native consent prompt without inventing verification", () => {
    const outcomes: string[] = [];
    requestTelegramPhoneContact(
      {
        Telegram: {
          WebApp: {
            requestContact(callback) {
              callback(true);
            },
          },
        },
      },
      (result) => outcomes.push(result),
    );
    expect(outcomes).toEqual(["sent"]);
  });

  it("keeps unsupported containers and cancelled prompts distinct", () => {
    const outcomes: string[] = [];
    requestTelegramPhoneContact({}, (result) => outcomes.push(result));
    requestTelegramPhoneContact(
      {
        Telegram: {
          WebApp: { requestContact: (callback) => callback(false) },
        },
      },
      (result) => outcomes.push(result),
    );
    expect(outcomes).toEqual(["unsupported", "cancelled"]);
  });
});
