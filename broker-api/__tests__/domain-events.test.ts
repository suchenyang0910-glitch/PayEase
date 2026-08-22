import { describe, expect, it } from "vitest";
import {
  createOutgoingDomainEvent,
  domainEventEnvelopeSchema,
  domainEventHeadersSchema,
  isDomainEventTimestampWithinWindow,
  sha256Hex,
  signDomainEventRequest,
  stableJson,
  verifyDomainEventSignature,
} from "../src/domain-events.js";

describe("domain event helpers", () => {
  it("creates an outgoing event with a payload hash derived from stable JSON", () => {
    const event = createOutgoingDomainEvent({
      eventId: "evt_day3_outbox_001",
      eventType: "APPLICATION_PACKAGE_SUBMITTED",
      sourceDomain: "BROKER",
      occurredAt: "2026-08-22T00:00:00.000Z",
      idempotencyKey: "idem-day3-outbox-001",
      externalApplicationRef: "APP-EXT-001",
      payload: {
        contractVersion: "CONTRACT-V2-001",
        fields: ["employmentStatus", "salaryRange"],
      },
    });
    expect(event.payloadSha256).toBe(
      sha256Hex(
        stableJson({
          contractVersion: "CONTRACT-V2-001",
          fields: ["employmentStatus", "salaryRange"],
        }),
      ),
    );
    expect(domainEventEnvelopeSchema.parse(event)).toEqual(event);
  });

  it("verifies a valid HMAC-signed incoming event", () => {
    const body = createOutgoingDomainEvent({
      eventId: "evt_day3_inbox_001",
      eventType: "DISBURSEMENT_CONFIRMED",
      sourceDomain: "LENDER",
      occurredAt: "2026-08-22T00:00:00.000Z",
      idempotencyKey: "idem-day3-inbox-001",
      externalApplicationRef: "APP-EXT-002",
      payload: { disbursedAt: "2026-08-22T09:30:00.000Z" },
    });
    const bodyJson = stableJson(body);
    const headers = domainEventHeadersSchema.parse({
      algorithm: "HMAC-SHA256",
      keyId: "lender-hmac-v1",
      nonce: "nonce-day3-inbox-0001",
      timestampMillis: "1787356800000",
      signature: signDomainEventRequest({
        method: "POST",
        path: "/v1/local/domain-events/inbox/receive",
        timestampMillis: "1787356800000",
        nonce: "nonce-day3-inbox-0001",
        keyId: "lender-hmac-v1",
        bodySha256: sha256Hex(bodyJson),
        secret: `lender_test_only_${"*".repeat(40)}`,
      }),
    });
    expect(
      verifyDomainEventSignature({
        method: "POST",
        path: "/v1/local/domain-events/inbox/receive",
        headers,
        bodySha256: sha256Hex(bodyJson),
        sourceDomain: body.sourceDomain,
      }),
    ).toBe(true);
  });

  it("rejects a tampered signature or stale timestamp", () => {
    const body = createOutgoingDomainEvent({
      eventId: "evt_day3_inbox_002",
      eventType: "COLLECTION_EXCEPTION",
      sourceDomain: "LENDER",
      occurredAt: "2026-08-22T00:00:00.000Z",
      idempotencyKey: "idem-day3-inbox-002",
      externalApplicationRef: "APP-EXT-003",
      payload: { reasonCode: "PAYROLL_PARTIAL_COLLECTION" },
    });
    const bodySha256 = sha256Hex(stableJson(body));
    const headers = domainEventHeadersSchema.parse({
      algorithm: "HMAC-SHA256",
      keyId: "lender-hmac-v1",
      nonce: "nonce-day3-inbox-0002",
      timestampMillis: String(Date.now() - 301_000),
      signature: "a".repeat(64),
    });
    expect(
      verifyDomainEventSignature({
        method: "POST",
        path: "/v1/local/domain-events/inbox/receive",
        headers,
        bodySha256,
        sourceDomain: body.sourceDomain,
      }),
    ).toBe(false);
    expect(
      isDomainEventTimestampWithinWindow({
        timestampMillis: headers.timestampMillis,
        now: Date.now(),
      }),
    ).toBe(false);
  });
});
