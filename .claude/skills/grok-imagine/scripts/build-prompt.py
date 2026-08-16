#!/usr/bin/env python3
"""Assemble and validate a Grok Imagine image prompt for front-end use.

This is a prompt-assembly helper: it builds the natural-language prompt
string a user pastes into a Grok Imagine surface (grok.com, X, or the
Grok Imagine app) to generate a still image. It does NOT call any API.
On-screen settings (aspect ratio, resolution) are recorded for the
operator's reference and printed in a trailing settings block; they are
not part of the prompt the model reads.

Modes:
  - T2I  : text-to-image, from a text prompt only.
  - edit : image editing / image-to-image on one uploaded image, using
           the "change + keep" structure.

Grok Imagine prompt rules enforced here:
  - subject-first natural-language prose. The subject leads the prompt;
    Grok weights what comes first most heavily.
  - lighting is the highest-leverage element and is REQUIRED for T2I.
  - a named style / medium (cinematic, photorealistic, illustration,
    concept art, film still, ...) is REQUIRED for T2I.
  - word budget 30-80 words; hard ceiling of 100 words (over-long prompts
    dilute the lead subject).
  - edit mode: exactly one reference (the uploaded image) and BOTH a
    change clause and a keep clause (the "change + keep" structure is the
    most reliable way to hold consistency).
  - positive direction only: no negation-only prompts. A short "keep /
    preserve" clause is the sanctioned exception in edit mode.
  - moderation-safety scanner (the signature feature): image filters scan
    for photorealism signals, violence, and quality-spam that raises
    realism flags. The scanner refuses on a hit and offers the guide's
    safer rephrasing. `--override-safety` bypasses it, accepting a higher
    flag risk.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from typing import Any, List, Optional, Tuple


VALID_MODES = {"T2I", "edit"}
VALID_ASPECT_RATIOS = {
    "1:1", "16:9", "9:16", "4:5", "5:4", "3:4", "4:3", "3:2", "2:3", "auto",
}
NEGATION_TOKENS = (" no ", " not ", " without ", " avoid ", " never ")
WORD_BUDGET_MIN = 30
WORD_BUDGET_MAX = 80
WORD_HARD_CEILING = 100

# Moderation risk table (from the Grok Imagine image guide § Safeguards).
# Each entry: (literal risk term, category, safer rephrasing).
# Image filters scan predicted realism, violence, and quality-spam that
# inflates realism scores. On a hit the build refuses and points the user
# to the safer alternative, unless --override-safety is set.
RISK_TABLE: Tuple[Tuple[str, str, str], ...] = (
    # Direct violence language -> stage / theatrical / choreographed framing.
    ("fight", "violence",
     "an athletic stage routine or theatrical performance"),
    ("strike", "violence",
     "a precise choreographed sequence"),
    ("punch", "violence",
     "a stage-combat aesthetic, controlled and performative"),
    ("blood", "violence",
     "dramatic stage makeup or a theatrical effect"),
    ("injury", "violence",
     "a dramatic rehearsal pose"),
    ("attack", "violence",
     "a precise choreographed sequence"),
    # Extreme-photorealism cues -> cinematic / stylized / concept framing.
    ("8k photorealistic", "extreme-photorealism",
     "a cinematic film still or high-contrast film-noir look"),
    ("raw footage", "extreme-photorealism",
     "a cinematic film still"),
    ("cctv", "extreme-photorealism",
     "a stylized cinematic look"),
    ("documentary realism", "extreme-photorealism",
     "a high-contrast film-noir or concept-art look"),
    ("ultra-realistic", "extreme-photorealism",
     "concept art or painterly"),
    ("ultra realistic", "extreme-photorealism",
     "concept art or painterly"),
    # Quality-spam -> drop it; lighting and style carry quality, and these
    # tokens can raise realism flags for little gain.
    ("8k", "quality-spam",
     "drop the resolution hype; let lighting and style carry quality"),
    ("ultra-detailed", "quality-spam",
     "drop it; let lighting and style carry quality"),
    ("masterpiece", "quality-spam",
     "drop it; let lighting and style carry quality"),
    ("best quality", "quality-spam",
     "drop it; let lighting and style carry quality"),
)


class PromptValidationError(ValueError):
    pass


def _has_negation(text: str) -> bool:
    if not text:
        return False
    padded = " " + text.lower().strip() + " "
    return any(tok in padded for tok in NEGATION_TOKENS)


def _all_negation(*clauses: str) -> bool:
    populated = [c for c in clauses if c and c.strip()]
    if not populated:
        return False
    return all(_has_negation(c) for c in populated)


def _word_count(*clauses: str) -> int:
    return sum(len(c.split()) for c in clauses if c and c.strip())


def _scan_moderation(*clauses: str) -> List[Tuple[str, str, str]]:
    """Return the list of moderation-risk hits across all clauses.

    Longer phrases are matched first and their span is blanked out so a
    contained shorter token (e.g. '8k' inside '8k photorealistic') does
    not double-count. Only the first occurrence of each term is reported.
    """
    work = " ".join(c for c in clauses if c and c.strip()).lower()
    hits: List[Tuple[str, str, str]] = []
    for term, category, safer in sorted(
        RISK_TABLE, key=lambda t: -len(t[0])
    ):
        pattern = re.compile(r"\b" + re.escape(term) + r"\b")
        match = pattern.search(work)
        if match:
            hits.append((term, category, safer))
            start, end = match.span()
            work = work[:start] + (" " * (end - start)) + work[end:]
    return hits


def _raise_on_moderation(hits: List[Tuple[str, str, str]]) -> None:
    lines = [
        f"  - {term!r} ({category}) -> {safer}"
        for term, category, safer in hits
    ]
    raise PromptValidationError(
        "moderation-safety scanner flagged high-risk terms. Grok Imagine's "
        "image filters scan predicted realism, violence, and quality-spam. "
        "Rephrase each term (or re-run with --override-safety to accept a "
        "higher flag risk):\n" + "\n".join(lines)
    )


def _normalize_refs(raw: List[Any]) -> List[str]:
    out: List[str] = []
    for r in raw:
        if isinstance(r, dict):
            role = r.get("role")
            if not role or not str(role).strip():
                raise PromptValidationError(
                    "every reference requires a non-empty 'role'."
                )
            out.append(str(role))
        else:
            out.append(str(r))
    return out


def _settings_block(*, aspect_ratio: str) -> List[str]:
    return [
        "",
        "[on-screen settings (pick these in the UI; NOT part of the "
        "prompt the model reads):",
        f"  aspect_ratio={aspect_ratio}",
        "  resolution=auto (Grok Imagine sizes the output; not prompt text)",
        "]",
    ]


def build_prompt(
    *,
    mode: str,
    subject: str = "",
    environment: str = "",
    lighting: str = "",
    camera: str = "",
    style: str = "",
    details: str = "",
    change: str = "",
    keep: str = "",
    references: Optional[List[Any]] = None,
    aspect_ratio: str = "1:1",
    override_safety: bool = False,
) -> str:
    if mode not in VALID_MODES:
        raise PromptValidationError(
            f"mode must be one of {sorted(VALID_MODES)}; got {mode!r}"
        )
    if aspect_ratio not in VALID_ASPECT_RATIOS:
        raise PromptValidationError(
            f"aspect_ratio must be one of {sorted(VALID_ASPECT_RATIOS)}; "
            f"got {aspect_ratio!r}"
        )

    if mode == "T2I":
        return _build_t2i(
            subject=subject,
            environment=environment,
            lighting=lighting,
            camera=camera,
            style=style,
            details=details,
            aspect_ratio=aspect_ratio,
            override_safety=override_safety,
        )
    return _build_edit(
        change=change,
        keep=keep,
        lighting=lighting,
        style=style,
        camera=camera,
        details=details,
        references=references,
        aspect_ratio=aspect_ratio,
        override_safety=override_safety,
    )


def _build_t2i(
    *,
    subject: str,
    environment: str,
    lighting: str,
    camera: str,
    style: str,
    details: str,
    aspect_ratio: str,
    override_safety: bool,
) -> str:
    if not subject or not subject.strip():
        raise PromptValidationError(
            "T2I requires a subject clause — the main subject leads the "
            "prompt and Grok weights it most heavily."
        )
    if not lighting or not lighting.strip():
        raise PromptValidationError(
            "T2I requires a lighting clause — lighting is the "
            "highest-leverage element (e.g. 'soft golden hour', "
            "'high-contrast film-noir', 'neon rim light')."
        )
    if not style or not style.strip():
        raise PromptValidationError(
            "T2I requires a named style / medium (e.g. 'cinematic film "
            "still', 'photorealistic', 'concept art', 'digital "
            "illustration')."
        )

    if _all_negation(subject, environment, lighting, camera, style, details):
        raise PromptValidationError(
            "every clause leans on negation tokens. Describe what you DO "
            "want; Grok Imagine has no negative-prompt field and does not "
            "honour in-prompt negation reliably."
        )

    wc = _word_count(subject, environment, lighting, camera, style, details)
    if wc > WORD_HARD_CEILING:
        raise PromptValidationError(
            f"prompt is {wc} words; over {WORD_HARD_CEILING} dilutes the "
            f"lead subject. Trim toward the {WORD_BUDGET_MIN}-"
            f"{WORD_BUDGET_MAX} word budget — cut adjectives, not subjects."
        )

    if not override_safety:
        hits = _scan_moderation(
            subject, environment, lighting, camera, style, details
        )
        if hits:
            _raise_on_moderation(hits)

    parts: List[str] = []
    for clause in (subject, environment, lighting, camera, style, details):
        if clause and clause.strip():
            parts.append(clause.strip())
    parts.extend(_settings_block(aspect_ratio=aspect_ratio))
    return "\n".join(parts)


def _build_edit(
    *,
    change: str,
    keep: str,
    lighting: str,
    style: str,
    camera: str,
    details: str,
    references: Optional[List[Any]],
    aspect_ratio: str,
    override_safety: bool,
) -> str:
    refs = _normalize_refs(references or [])
    if len(refs) != 1:
        raise PromptValidationError(
            f"edit mode requires exactly one reference (the uploaded "
            f"image); got {len(refs)}."
        )
    if not change or not change.strip():
        raise PromptValidationError(
            "edit mode requires a change clause — what to change (lighting, "
            "background, expression, clothing, weather, ...)."
        )
    if not keep or not keep.strip():
        raise PromptValidationError(
            "edit mode requires a keep clause — what must stay identical "
            "(face, expression, pose, clothing, composition, identity, "
            "framing). The 'change + keep' structure is the most reliable "
            "way to hold consistency."
        )

    # The keep clause is a sanctioned preserve statement, so the negation
    # guard only trips when the *change* content itself is all-negation.
    if _all_negation(change, lighting, style, camera, details):
        raise PromptValidationError(
            "the change instruction leans entirely on negation tokens. "
            "State the change as a positive instruction; the keep clause is "
            "where you name what to preserve."
        )

    wc = _word_count(change, keep, lighting, style, camera, details)
    if wc > WORD_HARD_CEILING:
        raise PromptValidationError(
            f"prompt is {wc} words; over {WORD_HARD_CEILING} dilutes the "
            f"edit. Trim toward the {WORD_BUDGET_MIN}-{WORD_BUDGET_MAX} "
            "word budget."
        )

    if not override_safety:
        hits = _scan_moderation(change, keep, lighting, style, camera, details)
        if hits:
            _raise_on_moderation(hits)

    parts: List[str] = [f"Reference: {refs[0]}."]
    change_line = change.strip()
    if not change_line.endswith((".", "!", "?")):
        change_line += "."
    parts.append(change_line)
    for clause in (lighting, camera, style, details):
        if clause and clause.strip():
            parts.append(clause.strip())
    parts.append(f"Keep {keep.strip()} exactly the same.")
    parts.extend(_settings_block(aspect_ratio=aspect_ratio))
    return "\n".join(parts)


def _parse_refs_arg(raw: Optional[List[str]]) -> Optional[List[Any]]:
    if not raw:
        return None
    out: List[Any] = []
    for r in raw:
        try:
            out.append(json.loads(r))
        except json.JSONDecodeError:
            out.append(r)
    return out


def _parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Assemble a Grok Imagine image prompt with validation."
    )
    p.add_argument("--mode", required=True, choices=sorted(VALID_MODES))
    p.add_argument("--subject", default="",
                   help="T2I: the main subject with key traits and pose; "
                        "leads the prompt.")
    p.add_argument("--environment", default="",
                   help="T2I: the environment and setting.")
    p.add_argument("--lighting", default="",
                   help="Lighting description (required for T2I; the "
                        "highest-leverage element).")
    p.add_argument("--camera", default="",
                   help="Camera angle / shot type / lens (e.g. '85mm, "
                        "shallow depth of field').")
    p.add_argument("--style", default="",
                   help="Named style / medium (required for T2I; e.g. "
                        "'cinematic film still', 'concept art').")
    p.add_argument("--details", default="",
                   help="Optional finishing details.")
    p.add_argument("--change", default="",
                   help="edit: what to change (required for edit).")
    p.add_argument("--keep", default="",
                   help="edit: what must stay identical (required for edit).")
    p.add_argument(
        "--reference", action="append", default=None,
        help='edit: the uploaded image role; plain string or JSON '
             '{"role": "..."}. Exactly one is required.',
    )
    p.add_argument("--aspect-ratio", default="1:1",
                   choices=sorted(VALID_ASPECT_RATIOS))
    p.add_argument(
        "--override-safety", action="store_true",
        help="Bypass the moderation-safety scanner. Accepts a higher flag "
             "risk — use only when you know the wording is safe.",
    )
    return p.parse_args(argv)


def main(argv: List[str]) -> int:
    args = _parse_args(argv)
    try:
        refs = _parse_refs_arg(args.reference)
        prompt = build_prompt(
            mode=args.mode,
            subject=args.subject,
            environment=args.environment,
            lighting=args.lighting,
            camera=args.camera,
            style=args.style,
            details=args.details,
            change=args.change,
            keep=args.keep,
            references=refs,
            aspect_ratio=args.aspect_ratio,
            override_safety=args.override_safety,
        )
    except PromptValidationError as exc:
        print(f"PromptValidationError: {exc}", file=sys.stderr)
        return 2
    print(prompt)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
