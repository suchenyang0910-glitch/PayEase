export {
  createOutgoingDomainEvent,
  domainEventEnvelopeSchema,
  domainEventHeadersSchema,
  DOMAIN_EVENT_TYPES,
  isDomainEventTimestampWithinWindow,
  sha256Hex,
  signDomainEventRequest,
  stableJson,
  type DomainEventEnvelope,
  verifyDomainEventSignature as verifySharedDomainEventSignature,
} from "@payease/shared-security";

import {
  verifyDomainEventSignature as verifySharedDomainEventSignature,
  type DomainEventHeaders,
  type DomainEventSourceDomain,
  type DomainEventAlgorithm,
} from "@payease/shared-security";

export function configuredDomainEventSharedSecrets(): Readonly<
  Record<
    string,
    Readonly<{
      algorithm: DomainEventAlgorithm;
      sourceDomain: DomainEventSourceDomain;
      secret: string;
    }>
  >
> {
  return {
    "broker-hmac-v1": {
      algorithm: "HMAC-SHA256",
      sourceDomain: "BROKER",
      secret:
        process.env.PAYEASE_BROKER_EVENT_SHARED_SECRET ??
        `broker_test_only_${"*".repeat(40)}`,
    },
    "lender-hmac-v1": {
      algorithm: "HMAC-SHA256",
      sourceDomain: "LENDER",
      secret:
        process.env.PAYEASE_LENDER_EVENT_SHARED_SECRET ??
        `lender_test_only_${"*".repeat(40)}`,
    },
  };
}

export function verifyDomainEventSignature(args: {
  method: string;
  path: string;
  headers: DomainEventHeaders;
  bodySha256: string;
  sourceDomain: DomainEventSourceDomain;
  secrets?: ReturnType<typeof configuredDomainEventSharedSecrets>;
}): boolean {
  return verifySharedDomainEventSignature({
    ...args,
    configuredSecrets: args.secrets ?? configuredDomainEventSharedSecrets(),
  });
}
