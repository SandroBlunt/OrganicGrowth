/** Save phase for idea-01 News Carousel V2: overwrite ledger copy, caption.txt, post.json. */
import { readFile } from "node:fs/promises";
import { writeAsset } from "../../src/asset/store.ts";
import { writeCaptionText, refreshPostJson } from "../../src/asset/output-bundle.ts";
import type { Copy } from "../../src/copy/contract.ts";

const ROOT = "/Users/CaxtonTaylor/Developer/OrganicGrowth";
const LEDGER = `${ROOT}/data/brands/straw-motion/ledger.json`;
const BRAND = "straw-motion";
const IDEA = "idea-2026-08-14-01";
const OUT_DIR = `${ROOT}/data/brands/straw-motion/ideas/unhypped-daily/2026-W33/friday-14-august/idea-01.news-carousel.output`;
const SPEC_PATH = "data/brands/straw-motion/ideas/unhypped-daily/2026-W33/friday-14-august/idea-01.news-carousel.spec.json";
const COPY_JSON = `${ROOT}/scratch/w33/copy-idea01-v2.json`;
const SLIDES = ["0-hook", "1-then", "2-shift", "3-proof", "4-different", "5-next", "6-cta"];

async function main(): Promise<void> {
  const copy: Copy = JSON.parse(await readFile(COPY_JSON, "utf8"));
  const asset_paths = SLIDES.map((s) => `${OUT_DIR}/${s}.png`);
  await writeAsset(IDEA, "news-carousel", {
    status: "produced", spec_path: SPEC_PATH, copy, asset_paths, produced_at: new Date().toISOString(),
  }, { ledgerPath: LEDGER });
  console.log("ledger: v2 asset written (produced)");
  console.log("wrote", await writeCaptionText(OUT_DIR, copy));
  const r = await refreshPostJson(BRAND, IDEA, "news-carousel", { ledgerPath: LEDGER });
  console.log("refreshPostJson:", r.ok ? `ok -> ${r.path}` : `FAILED (${(r as any).reason})`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
