## ADDED Requirements

### Requirement: listAllPosts returns every Post in the database, across every Asset/Channel

`src/post/store.ts`'s `listAllPosts(db)` SHALL return every `post` row in the database, oldest first,
regardless of which Asset or Channel it belongs to — `[]` for an empty database. This is the whole-table
read the local read-only Library needs to prove and display the real corpus's Post count without
iterating every Asset first.

#### Scenario: An empty database returns an empty list

- **GIVEN** a freshly migrated database with no `post` row
- **WHEN** `listAllPosts(db)` is called
- **THEN** it returns `[]`

#### Scenario: Every Post is returned, including more than one Channel for the same Asset

- **GIVEN** one Asset published to two different Channels (two `post` rows, CONTEXT.md "Post": "at most
  one Post per Channel it is actually published to")
- **WHEN** `listAllPosts(db)` is called
- **THEN** it returns both Posts
