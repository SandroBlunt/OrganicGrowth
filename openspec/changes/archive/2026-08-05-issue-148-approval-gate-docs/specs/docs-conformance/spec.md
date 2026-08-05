## ADDED Requirements

### Requirement: CONTEXT.md defines Schedule Batch and Zoho Social Brand; the one-time S3 setup is documented, not code

`CONTEXT.md` SHALL define **Schedule Batch** and **Zoho Social Brand** as glossary terms, each with an
`_Avoid_` line. The **Schedule Batch** entry SHALL state the approval that precedes it is conversational
only and never written to the ledger, that `scheduled_at` is the field it stamps while `status` stays
`produced`, and that hosting/writing files is not publishing — the Publish gate (ADR-0002) is a second,
distinct human step. The **Zoho Social Brand** entry SHALL state it is distinct from an OrganicGrowth
Brand. The one-time S3 infrastructure setup (bucket, a public-`GetObject`-only bucket policy, and a
30-day expiry lifecycle rule) SHALL be documented at `docs/schedule-batch-s3-setup.md` as infrastructure
setup, not code, stating it is already live for straw-motion.

#### Scenario: CONTEXT.md defines Schedule Batch, cross-referencing the conversational approval and ADR-0002

- **GIVEN** `CONTEXT.md` as shipped in this repository
- **WHEN** its **Schedule Batch** glossary entry is read
- **THEN** it states the preceding approval is conversational only and never written to the ledger
- **AND** it states `scheduled_at` is stamped while `status` stays `produced`
- **AND** it states hosting/writing files is not publishing and cites ADR-0002

#### Scenario: CONTEXT.md defines Zoho Social Brand as distinct from an OrganicGrowth Brand

- **GIVEN** `CONTEXT.md` as shipped in this repository
- **WHEN** its **Zoho Social Brand** glossary entry is read
- **THEN** it states a Zoho Social Brand is not an OrganicGrowth Brand
- **AND** it names an exact Zoho channel label (e.g. `LinkedInProfile`) as an example of what it owns

#### Scenario: The one-time S3 setup is documented as infrastructure, never as code

- **GIVEN** `docs/schedule-batch-s3-setup.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it states the setup is one-time infrastructure, not code
- **AND** it documents the live straw-motion bucket (`strawmotion-schedule-media`), a public
  `GetObject`-only bucket policy, and a 30-day expiry lifecycle rule
- **AND** its example bucket policy grants ONLY `s3:GetObject` — never a wildcard or a write/delete/list
  action for the public principal
