/**
 * The Library ADMIN module's HTTP server — the ONE deliberate exception to the Library's otherwise
 * hard read-only rule (`../server.ts`, `../read-only.test.ts`: "issue #210's own non-negotiable...
 * already been burned by six times").
 *
 * This is a genuinely SEPARATE server (own file, own port, started alongside the read-only one by the
 * same `npm run library` command — `src/commands/run-library-viewer.ts`) — never a route bolted onto
 * `createLibraryServer`. That keeps the read-only server's own tested guarantee (every non-GET method
 * refused before any route is consulted; its SQLite connection is opened `{ readOnly: true }` so even a
 * stray write throws at the SQLite layer) completely untouched and unweakened by this module's
 * existence.
 *
 * This server writes — but ONLY to hand-authored FILES a human already edits by hand today (a Format's
 * `default_recipes` YAML field, a Baseline Prompt markdown document, a Brand Asset media file) — NEVER
 * to SQL. Its own database connection is STILL opened `{ readOnly: true }` (same defense-in-depth
 * reason: it has no legitimate SQL write to make; every read here — listing Brands — is an ordinary
 * SELECT). Explicitly authorized by the Operator (three separate, explicit confirmations: scope =
 * "recipe-tied configuration, not the Recipe registry itself"; location = "an admin module in the same
 * tool"; save behavior = "write, then auto-commit that one file" — ADR-0014's git-diffable-history
 * promise, kept even though the edit now comes from a form instead of a text editor).
 *
 * Every successful write is followed by `commitPath` (`src/git/commit-path.ts`) committing JUST the
 * one file that changed — never a blanket `git add -A`, so concurrent unrelated dirty state in the
 * working tree is never swept into an admin save.
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { Readable } from "node:stream";
import { extname } from "node:path";

import type { DatabaseSync } from "node:sqlite";

import { listBrands } from "../../brand/store.ts";
import {
  listFormatSlugs,
  loadFormat,
  saveFormatDefaultRecipes,
  formatFilePath,
} from "../../format/store.ts";
import {
  loadBaselinePrompt,
  saveBaselinePrompt,
  deleteBaselinePrompt,
  resolveBaselinePromptPath,
} from "../../format/baseline-prompt.ts";
import {
  listBrandAssets,
  getBrandAsset,
  writeBrandAssetFile,
  deleteBrandAssetFile,
} from "../../brand-asset/store.ts";
import { listRecipes, isWiredRecipe } from "../../recipe/registry.ts";
import { commitPath } from "../../git/commit-path.ts";
import { readVendorFile } from "../vendor-assets.ts";
import {
  adminPage,
  renderErrorBody,
  renderBrandIndex,
  renderBrandDetail,
  renderFormatDetail,
  renderBaselinePromptForm,
  renderAssetsList,
} from "./render.ts";

const VENDOR_PREFIX = "/vendor/";

export interface LibraryAdminServerOptions {
  /** The running READ-ONLY viewer's own base URL (e.g. `http://127.0.0.1:4173`) — rendered as an
   *  absolute back-link, since these are two different servers/ports. */
  readonly readOnlyBaseUrl: string;
  /** Override for tests — a temp directory standing in for `data/brands`. */
  readonly brandsRoot?: string;
  /** The git working directory `commitPath` runs in — defaults to `process.cwd()`. Override for tests
   *  with a disposable temp git repo, so saves genuinely commit rather than failing against this real
   *  checkout. */
  readonly repoRoot?: string;
}

const BRAND_PATH = /^\/brands\/([^/]+)$/;
const FORMAT_PATH = /^\/brands\/([^/]+)\/formats\/([^/]+)$/;
const BASELINE_PROMPT_PATH = /^\/brands\/([^/]+)\/formats\/([^/]+)\/baseline-prompts\/([^/]+)$/;
const BASELINE_PROMPT_DELETE_PATH = /^\/brands\/([^/]+)\/formats\/([^/]+)\/baseline-prompts\/([^/]+)\/delete$/;
const ASSETS_PATH = /^\/brands\/([^/]+)\/assets$/;
const ASSET_DELETE_PATH = /^\/brands\/([^/]+)\/assets\/([^/]+)\/delete$/;

function decode(value: string): string {
  return decodeURIComponent(value);
}

async function readUrlEncodedBody(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

/** Parses a real `multipart/form-data` POST body using Node's built-in Web `Request`/`FormData` — no
 *  hand-rolled parser, no new dependency (this repo's own convention: standard library over deps). */
async function readMultipartBody(req: IncomingMessage): Promise<FormData> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  const webStream = Readable.toWeb(req) as ReadableStream<Uint8Array>;
  const request = new Request(`http://internal${req.url ?? "/"}`, {
    method: "POST",
    headers,
    body: webStream,
    duplex: "half",
  } as RequestInit & { duplex: string });
  return request.formData();
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function sendRedirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { location });
  res.end();
}

async function handleRequest(
  db: DatabaseSync,
  opts: LibraryAdminServerOptions,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://internal");
  const path = url.pathname;
  const method = req.method ?? "GET";
  const wired = listRecipes().filter((r) => isWiredRecipe(r.slug));

  const page = (title: string, body: string): string => adminPage(title, body, opts.readOnlyBaseUrl, path);
  const errorPage = (message: string): string => adminPage("Error", renderErrorBody(message), opts.readOnlyBaseUrl);

  try {
    // Serves the SAME real @material/web component modules the read-only viewer does — straight out of
    // node_modules, no bundler — so the admin module's forms use genuine MD3 components too, not a
    // second, styling-only imitation of them.
    if (method === "GET" && path.startsWith(VENDOR_PREFIX)) {
      const bytes = await readVendorFile(path);
      if (bytes === null) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "content-length": bytes.length });
      res.end(bytes);
      return;
    }

    if (method === "GET" && path === "/") {
      const brands = listBrands(db);
      sendHtml(res, 200, page("Brands", renderBrandIndex(brands)));
      return;
    }

    const brandMatch = BRAND_PATH.exec(path);
    if (method === "GET" && brandMatch !== null) {
      const brand = decode(brandMatch[1]!);
      const formats = await listFormatSlugs(brand, opts.brandsRoot);
      sendHtml(res, 200, page(brand, renderBrandDetail(brand, formats)));
      return;
    }

    const assetsMatch = ASSETS_PATH.exec(path);
    if (assetsMatch !== null) {
      const brand = decode(assetsMatch[1]!);
      if (method === "GET") {
        const assets = await listBrandAssets(brand, opts.brandsRoot);
        sendHtml(res, 200, page(`${brand} — Assets`, renderAssetsList(brand, assets)));
        return;
      }
      if (method === "POST") {
        const form = await readMultipartBody(req);
        const key = form.get("key");
        const file = form.get("file");
        if (typeof key !== "string" || key.length === 0 || !(file instanceof File)) {
          sendHtml(res, 400, errorPage("A Brand Asset upload needs both a key and a file."));
          return;
        }
        const ext = extname(file.name).slice(1);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const written = await writeBrandAssetFile(brand, key, ext, bytes, opts.brandsRoot);
        await commitPath(written.path, `Admin: save Brand Asset "${key}" for ${brand}`, opts.repoRoot);
        sendRedirect(res, `/brands/${encodeURIComponent(brand)}/assets`);
        return;
      }
    }

    const assetDeleteMatch = ASSET_DELETE_PATH.exec(path);
    if (method === "POST" && assetDeleteMatch !== null) {
      const brand = decode(assetDeleteMatch[1]!);
      const key = decode(assetDeleteMatch[2]!);
      const existing = await getBrandAsset(brand, key, opts.brandsRoot);
      await deleteBrandAssetFile(brand, key, opts.brandsRoot);
      if (existing.found) {
        await commitPath(existing.asset.path, `Admin: delete Brand Asset "${key}" for ${brand}`, opts.repoRoot);
      }
      sendRedirect(res, `/brands/${encodeURIComponent(brand)}/assets`);
      return;
    }

    const formatMatch = FORMAT_PATH.exec(path);
    if (formatMatch !== null) {
      const brand = decode(formatMatch[1]!);
      const formatSlug = decode(formatMatch[2]!);
      if (method === "GET") {
        const format = await loadFormat(brand, formatSlug, opts.brandsRoot);
        sendHtml(res, 200, page(formatSlug, renderFormatDetail(brand, formatSlug, format, wired)));
        return;
      }
      if (method === "POST") {
        const body = await readUrlEncodedBody(req);
        const chosen = body.getAll("recipe").filter((slug) => isWiredRecipe(slug)); // server-side re-validation — never trust the client-rendered checkboxes alone
        await saveFormatDefaultRecipes(brand, formatSlug, chosen, opts.brandsRoot);
        const path2 = formatFilePath(brand, formatSlug, opts.brandsRoot);
        await commitPath(path2, `Admin: set default Recipes for ${brand}/${formatSlug}`, opts.repoRoot);
        sendRedirect(res, `/brands/${encodeURIComponent(brand)}/formats/${encodeURIComponent(formatSlug)}`);
        return;
      }
    }

    const baselineDeleteMatch = BASELINE_PROMPT_DELETE_PATH.exec(path);
    if (method === "POST" && baselineDeleteMatch !== null) {
      const brand = decode(baselineDeleteMatch[1]!);
      const formatSlug = decode(baselineDeleteMatch[2]!);
      const recipeSlug = decode(baselineDeleteMatch[3]!);

      const format = await loadFormat(brand, formatSlug, opts.brandsRoot);
      const pointer = format.baselinePrompts[recipeSlug];
      const resolvedDocPath =
        pointer !== undefined ? resolveBaselinePromptPath(brand, formatSlug, pointer, opts.brandsRoot) : null;

      await deleteBaselinePrompt(brand, formatSlug, recipeSlug, opts.brandsRoot);

      if (resolvedDocPath !== null && resolvedDocPath.ok) {
        await commitPath(resolvedDocPath.path, `Admin: delete Baseline Prompt ${recipeSlug} for ${brand}/${formatSlug}`, opts.repoRoot);
      }
      await commitPath(
        formatFilePath(brand, formatSlug, opts.brandsRoot),
        `Admin: remove Baseline Prompt pointer ${recipeSlug} for ${brand}/${formatSlug}`,
        opts.repoRoot,
      );
      sendRedirect(res, `/brands/${encodeURIComponent(brand)}/formats/${encodeURIComponent(formatSlug)}`);
      return;
    }

    const baselineMatch = BASELINE_PROMPT_PATH.exec(path);
    if (baselineMatch !== null) {
      const brand = decode(baselineMatch[1]!);
      const formatSlug = decode(baselineMatch[2]!);
      const recipeSlug = decode(baselineMatch[3]!);

      if (!isWiredRecipe(recipeSlug)) {
        sendHtml(res, 400, errorPage(`"${recipeSlug}" is not a wired Recipe — Baseline Prompts are only editable for wired Recipes.`));
        return;
      }

      if (method === "GET") {
        const format = await loadFormat(brand, formatSlug, opts.brandsRoot);
        const looked = await loadBaselinePrompt(brand, format, recipeSlug, opts.brandsRoot);
        const content = looked.found ? looked.content : null;
        sendHtml(res, 200, page(`Baseline Prompt — ${recipeSlug}`, renderBaselinePromptForm(brand, formatSlug, recipeSlug, content)));
        return;
      }
      if (method === "POST") {
        const body = await readUrlEncodedBody(req);
        const content = body.get("content") ?? "";
        const saved = await saveBaselinePrompt(brand, formatSlug, recipeSlug, content, opts.brandsRoot);
        await commitPath(saved.path, `Admin: save Baseline Prompt ${recipeSlug} for ${brand}/${formatSlug}`, opts.repoRoot);
        await commitPath(
          formatFilePath(brand, formatSlug, opts.brandsRoot),
          `Admin: declare Baseline Prompt pointer ${recipeSlug} for ${brand}/${formatSlug}`,
          opts.repoRoot,
        );
        sendRedirect(
          res,
          `/brands/${encodeURIComponent(brand)}/formats/${encodeURIComponent(formatSlug)}/baseline-prompts/${encodeURIComponent(recipeSlug)}`,
        );
        return;
      }
    }

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    sendHtml(res, 400, errorPage(message));
  }
}

export function createLibraryAdminServer(db: DatabaseSync, opts: LibraryAdminServerOptions): Server {
  return createServer((req, res) => {
    handleRequest(db, opts, req, res).catch((err: unknown) => {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      }
      res.end(`Internal error: ${String(err)}`);
    });
  });
}
