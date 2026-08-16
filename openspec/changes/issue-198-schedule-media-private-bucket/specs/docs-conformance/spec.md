## MODIFIED Requirements

### Requirement: CONTEXT.md defines Schedule Batch and Zoho Social Brand; the one-time S3 setup is documented, not code

`CONTEXT.md` SHALL define **Schedule Batch** and **Zoho Social Brand** as glossary terms, each with an
`_Avoid_` line. The **Schedule Batch** entry SHALL state the approval that precedes it is conversational
only and never written to the ledger, that `scheduled_at` is the field it stamps while `status` stays
`produced`, and that hosting/writing files is not publishing — the Publish gate (ADR-0002) is a second,
distinct human step. The **Zoho Social Brand** entry SHALL state it is distinct from an OrganicGrowth
Brand. The one-time S3 infrastructure setup SHALL be documented at `docs/schedule-batch-s3-setup.md` as
infrastructure setup, not code, stating it is already live for straw-motion.

Since issue #198, that setup doc SHALL describe a PRIVATE bucket (Block Public Access ON, NO bucket
policy — no public-principal grant of any kind) rather than a public-`GetObject`-only bucket policy. It
SHALL name the real mechanism by which media becomes readable — `presignViaAwsCli`
(`src/media-host/live/s3.ts`), `computeMediaExpiry` (`src/schedule-batch/media-expiry.ts`), and
`randomMediaKeyToken` (`src/media-host/token.ts`) — and SHALL document the exact IAM permissions the
running AWS CLI credentials need (`s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, never
`s3:ListBucket` or a wildcard). It SHALL document AWS's own SigV4 presign ceiling
(`MAX_PRESIGN_SECONDS`, 604,800 seconds / 7 days) and state plainly what happens when a link expires
before Zoho fetches the media (the fetch fails). It SHALL document the concrete, one-time migration
steps for an already-public bucket (`aws s3api delete-bucket-policy`, confirming
`get-public-access-block` is still fully ON, confirming `get-bucket-policy` now returns
`NoSuchBucketPolicy`, and granting the three needed IAM actions).

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

#### Scenario: The one-time S3 setup is documented as infrastructure, never as code, and describes a PRIVATE bucket

- **GIVEN** `docs/schedule-batch-s3-setup.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it states the setup is one-time infrastructure, not code
- **AND** it documents the live straw-motion bucket (`strawmotion-schedule-media`) and a 30-day expiry
  lifecycle rule
- **AND** it states the bucket is PRIVATE (Block Public Access stays ON, bucket policy is NONE) — never
  a public-`GetObject`-only bucket policy
- **AND** it does NOT contain a `"Principal": "*"` grant anywhere

#### Scenario: The setup doc names the real signed-link mechanism and the exact IAM permissions needed

- **GIVEN** `docs/schedule-batch-s3-setup.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it names `presignViaAwsCli`, `computeMediaExpiry`, and `randomMediaKeyToken` by their real
  module paths
- **AND** it documents `"s3:GetObject"`, `"s3:PutObject"`, and `"s3:DeleteObject"` as the credentials'
  needed permissions
- **AND** it does NOT document `"s3:ListBucket"` or a wildcard `"s3:*"` action anywhere

#### Scenario: The setup doc states AWS's own presign ceiling and what happens when a link expires before Zoho fetches

- **GIVEN** `docs/schedule-batch-s3-setup.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it names `MAX_PRESIGN_SECONDS`, states the ceiling is 604,800 seconds / 7 days, and names
  `cappedByAwsLimit`
- **AND** it states plainly that the fetch fails when a link has expired before Zoho fetches it

#### Scenario: The setup doc documents the concrete migration steps for an already-public bucket

- **GIVEN** `docs/schedule-batch-s3-setup.md` as shipped in this repository
- **WHEN** it is read
- **THEN** it names `aws s3api delete-bucket-policy`, `aws s3api get-public-access-block`, and the
  expected `NoSuchBucketPolicy` outcome of confirming no policy remains
