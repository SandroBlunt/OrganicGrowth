/**
 * Save phase for idea-2026-08-14-01 News Carousel: write the produced Asset to the ledger, write
 * caption.txt, refresh post.json, and close the queue job.
 */
import { readFile, writeFile } from "node:fs/promises";
import { writeAsset } from "../../src/asset/store.ts";
import { writeCaptionText, refreshPostJson } from "../../src/asset/output-bundle.ts";
import type { Copy } from "../../src/copy/contract.ts";

const ROOT = "/Users/CaxtonTaylor/Developer/OrganicGrowth";
const LEDGER = `${ROOT}/data/brands/straw-motion/ledger.json`;
const QUEUE = `${ROOT}/data/queue.json`;
const BRAND = "straw-motion";
const IDEA = "idea-2026-08-14-01";
const RUN_DIR = `${ROOT}/data/brands/straw-motion/ideas/unhypped-daily/2026-W33/friday-14-august`;
const OUT_DIR = `${RUN_DIR}/idea-01.news-carousel.output`;
const SPEC_PATH = "data/brands/straw-motion/ideas/unhypped-daily/2026-W33/friday-14-august/idea-01.news-carousel.spec.json";
const COPY_JSON = `${ROOT}/scratch/w33/copy-idea01.json`;

const SLIDES = ["0-hook", "1-then", "2-shift", "3-proof", "4-different", "5-next", "6-cta"];

async function main(): Promise<void> {
  const copy: Copy = JSON.parse(await readFile(COPY_JSON, "utf8"));
  const asset_paths = SLIDES.map((s) => `${OUT_DIR}/${s}.png`);

  await writeAsset(
    IDEA,
    "news-carousel",
    {
      status: "produced",
      spec_path: SPEC_PATH,
      copy,
      asset_paths,
      produced_at: new Date().toISOString(),
    },
    { ledgerPath: LEDGER },
  );
  console.log("ledger: asset written (produced)");

  const capPath = await writeCaptionText(OUT_DIR, copy);
  console.log("wrote", capPath);

  const refreshed = await refreshPostJson(BRAND, IDEA, "news-carousel", { ledgerPath: LEDGER });
  console.log("refreshPostJson:", refreshed.ok ? `ok -> ${refreshed.path}` : `FAILED (${(refreshed as any).reason})`);

  // Close the queued news-carousel job for this idea.
  const q = JSON.parse(await readFile(QUEUE, "utf8"));
  let changed = 0;
  for (const job of q.jobs) {
    if (job.idea_id === IDEA && job.brand === BRAND && job.recipe === "news-carousel" && job.status === "queued") {
      job.status = "done";
      changed += 1;
    }
  }
  await writeFile(QUEUE, JSON.stringify(q, null, 2) + "\n");
  console.log(`queue: set ${changed} job(s) done`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
