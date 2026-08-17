
# Import reconciliation — 2026-08-17T14:02:45.025Z

Ideas doubles as CONTEXT.md's "Brief" count — a Brief is the `idea.brief` column, not a separate table.

| Brand | Ideas (Briefs) in | out | Assets in | out | Jobs in | out | Posts in | out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mundotip | 10 | 10 (OK) | 0 | 0 (OK) | 0 | 0 (OK) | 0 | 0 (OK) |
| straw-motion | 51 | 51 (OK) | 54 | 54 (OK) | 66 | 66 (OK) | 7 | 7 (OK) |
| **Totals** | **61** | **61** (OK) | **54** | **54** (OK) | **66** | **66** (OK) | **7** | **7** (OK) |

## What this reconciliation covers, and what it does not (issue #240)

Counted and cross-checked above, per Brand and in total: **Ideas** (doubling as Briefs), **Assets**, **Jobs**, and **Posts** (every Asset carrying a ledger `post_url` becomes one `post` row, keyed to its Asset and its resolved Channel, ADR-0028).

**NOT independently counted here** — created as a necessary part of this import, but their own counts are never cross-checked the way the four above are: `brand`, `channel`, `format`, `run`, `trend`, `idea_recipe`, `asset_media`, `gate_request`, `copy_variant`, `metric_snapshot`, `performance_score`, `channel_baseline`, `brand_asset`, `baseline_prompt`. A category never named on this report cannot be proven complete by it alone — the real lesson of issue #240: this same table read 61/61, 54/54, 66/66 (all matching) on the run that silently dropped all 7 real Posts, because Posts were not a category this report named at all before this change.

## Dead media paths (8) — reported for an Operator decision, never silently nulled

- straw-motion / idea-2026-08-14-01 / news-short-script [0]: `data/brands/straw-motion/ideas/unhypped-daily/2026-W33/friday-14-august/idea-01.news-short-script.output/script.txt`
- straw-motion / idea-2026-08-14-01 / news-short-script [1]: `data/brands/straw-motion/ideas/unhypped-daily/2026-W33/friday-14-august/idea-01.news-short-script.output/shot-list.txt`
- straw-motion / idea-2026-08-14-03 / news-short-script [0]: `data/brands/straw-motion/ideas/unhypped-daily/2026-W33/friday-14-august/idea-03.news-short-script.output/script.txt`
- straw-motion / idea-2026-08-14-03 / news-short-script [1]: `data/brands/straw-motion/ideas/unhypped-daily/2026-W33/friday-14-august/idea-03.news-short-script.output/shot-list.txt`
- straw-motion / idea-2026-08-14-05 / news-short-script [0]: `data/brands/straw-motion/ideas/unhypped-daily/2026-W33/friday-14-august/idea-05.news-short-script.output/script.txt`
- straw-motion / idea-2026-08-14-05 / news-short-script [1]: `data/brands/straw-motion/ideas/unhypped-daily/2026-W33/friday-14-august/idea-05.news-short-script.output/shot-list.txt`
- straw-motion / idea-2026-08-14-12 / news-short-script [0]: `data/brands/straw-motion/ideas/unhypped-daily/2026-W33/friday-14-august/idea-12.news-short-script.output/script.txt`
- straw-motion / idea-2026-08-14-12 / news-short-script [1]: `data/brands/straw-motion/ideas/unhypped-daily/2026-W33/friday-14-august/idea-12.news-short-script.output/shot-list.txt`

## Duplicate job identity keys (12) — reported for an Operator decision, not resolved

- straw-motion / idea-02 / news-carousel (2 jobs):
  - gate=null status=done enqueued_at=2026-07-18T07:33:16.549Z
  - gate=null status=done enqueued_at=2026-07-22T06:55:46.213Z
- straw-motion / idea-03 / news-carousel (2 jobs):
  - gate=null status=done enqueued_at=2026-07-18T07:33:16.550Z
  - gate=null status=done enqueued_at=2026-07-22T06:55:46.215Z
- straw-motion / idea-2026-W30-01 / character-explainer-with-cast (2 jobs):
  - gate=cast status=done enqueued_at=2026-07-22T14:53:55.468Z
  - gate=null status=done enqueued_at=2026-07-24T13:57:49.141Z pick=8vBvOh2IrU
- straw-motion / idea-2026-W30-02 / character-explainer-with-cast (2 jobs):
  - gate=cast status=done enqueued_at=2026-07-22T14:53:55.470Z
  - gate=null status=done enqueued_at=2026-07-24T13:58:00.590Z pick=mCICANEhJQ
- straw-motion / idea-2026-W30-03 / character-explainer-with-cast (2 jobs):
  - gate=cast status=done enqueued_at=2026-07-22T14:53:55.471Z
  - gate=null status=done enqueued_at=2026-07-24T13:58:02.357Z pick=PiOiKTf42C
- straw-motion / idea-2026-W30-04 / character-explainer-with-cast (2 jobs):
  - gate=cast status=done enqueued_at=2026-07-22T14:53:55.472Z
  - gate=null status=done enqueued_at=2026-07-24T13:58:04.184Z pick=xg1gCJOjfW
- straw-motion / idea-2026-W30-05 / character-explainer-with-cast (2 jobs):
  - gate=cast status=done enqueued_at=2026-07-22T14:53:55.473Z
  - gate=null status=done enqueued_at=2026-07-24T13:58:05.916Z pick=swjwqOUl8e
- straw-motion / idea-2026-W30-06 / character-explainer-with-cast (2 jobs):
  - gate=cast status=done enqueued_at=2026-07-22T14:53:55.474Z
  - gate=null status=done enqueued_at=2026-07-24T13:58:07.698Z pick=5xqxEOOKxe
- straw-motion / idea-2026-W30-07 / character-explainer-with-cast (2 jobs):
  - gate=cast status=done enqueued_at=2026-07-22T14:53:55.475Z
  - gate=null status=done enqueued_at=2026-07-24T13:58:09.512Z pick=kL5LqYZ16B
- straw-motion / idea-08 / character-explainer-with-cast (2 jobs):
  - gate=cast status=done enqueued_at=2026-07-22T14:53:55.476Z
  - gate=null status=done enqueued_at=2026-07-24T13:58:11.265Z pick=Xtetdw1Bfo
- straw-motion / idea-09 / character-explainer-with-cast (2 jobs):
  - gate=cast status=done enqueued_at=2026-07-22T14:53:55.477Z
  - gate=null status=done enqueued_at=2026-07-24T13:58:13.432Z pick=e8DIo80dqL
- straw-motion / idea-10 / character-explainer-with-cast (2 jobs):
  - gate=cast status=done enqueued_at=2026-07-22T14:53:55.478Z
  - gate=null status=done enqueued_at=2026-07-24T13:58:15.222Z pick=LUxw7HBswO
