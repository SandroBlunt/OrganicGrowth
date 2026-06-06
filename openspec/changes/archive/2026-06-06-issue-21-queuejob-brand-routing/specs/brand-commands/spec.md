## ADDED Requirements

### Requirement: The /queue command labels each job with its Brand and can filter to one Brand

The `/queue` command renders the global Production Queue. Each job line SHALL include the job's
`brand` so the Operator can see which Brand each job belongs to. When called with a `<brand>`
argument, `/queue` SHALL filter the output to show only jobs for that Brand. When called without
a Brand filter (or with `--all`), it SHALL show all jobs across all Brands. An empty result after
filtering SHALL report that no jobs match the filter.

#### Scenario: /queue labels each job with its brand

- **GIVEN** a queue with jobs for Brand `"alpha"` and Brand `"beta"`
- **WHEN** `/queue` is run without a brand filter
- **THEN** each job line includes its brand name and both Brands' jobs are shown

#### Scenario: /queue filtered to one Brand shows only that Brand's jobs

- **GIVEN** a queue with jobs for Brand `"alpha"` and Brand `"beta"`
- **WHEN** `/queue` is run with Brand filter `"alpha"`
- **THEN** only Brand `"alpha"`'s jobs appear in the output
- **AND** Brand `"beta"`'s jobs do not appear

#### Scenario: /queue filtered to a Brand with no jobs reports an empty result

- **GIVEN** a queue with jobs for Brand `"alpha"` only
- **WHEN** `/queue` is run with Brand filter `"beta"`
- **THEN** the output reports no jobs for that Brand (not the generic empty-queue message)
