# Employee Identity Match Boundary

## Current V1 rule

Each factory is an isolated employer tenant. An applicant selects one factory
when submitting the application. The employee matching key is the submitted
national ID or passport number.

The raw document number is encrypted at rest. A separate 32-byte HMAC key
creates its normalized lookup value. The lookup key must never be reused as a
PII encryption key and must never be placed in a browser, source repository,
log, audit payload, or notification.

## HR verification boundary

The HR portal receives only:

- application number;
- requested amount and tenor;
- document type (`NATIONAL_ID` or `PASSPORT`); and
- identity-match state (`PENDING`, `MATCHED`, or `NOT_MATCHED`).

It never receives the document number, its HMAC lookup value, applicant phone,
or applicant profile. HR checks the identifier against the factory's own
personnel record outside the portal, then records only `MATCHED` or
`NOT_MATCHED` with a reason code.

An HR approval is blocked until a documented application is `MATCHED`. Once
recorded, a match outcome is immutable. A correction requires the formal
return/reapplication workflow; no operator may overwrite the audit fact.

## Tenant isolation

Only an active employer account explicitly assigned to the selected factory
tenant may read its verification queue or record a match. Other factory HR
accounts receive `403 EMPLOYER_TENANT_ACCESS_DENIED`. Platform administrators
may grant, list, and revoke factory-account membership, but membership views
contain only back-office login names and roles.

This document is the implemented V1 boundary. If an older planning table
permits an HR portal to render a full national ID or passport number, that
planned allowance is superseded by this rule unless legal, DPO, CISO, and
product owners approve a new versioned exception.
