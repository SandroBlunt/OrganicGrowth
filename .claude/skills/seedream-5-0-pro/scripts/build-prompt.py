#!/usr/bin/env python3
"""Assemble and validate a Seedream 5.0 Pro prompt for front-end use.

This is a prompt-assembly helper: it builds the natural-language prompt
string a user pastes into a Seedream 5.0 front-end (Dreamina / Jimeng,
Doubao, fal, wavespeed, ComfyUI). It does NOT call any API. On-screen
settings (aspect ratio, resolution, image count) are recorded for the
operator's reference and printed in a trailing settings block; they are
not part of the prompt the model reads.

Modes: T2I, Design (high-density info layout), Edit (grounded precision
edit), MR (reference by ordinal "Image N"), sequential-set.

Seedream 5.0 prompt rules enforced here:
  - subject-first natural-language prose in SPACE order (Subject, Palette
    & style, Arrangement, Camera & light, Extra detail); earlier concepts
    are weighted more heavily.
  - 30-100 word budget; a hard ceiling at 120 words (over-long prompts
    confuse the model).
  - in-image text must be wrapped in double quotes (renders literally in
    any of the 14 supported languages).
  - Edit: exactly one reference (the uploaded image); a marked target and
    an optional recolour value that must be a hex code or a swatch/Image
    reference.
  - MR: 1..10 references, addressed by on-screen order (Image 1, Image 2…),
    identity anchored on Image 1.
  - sequential-set: a named set count (2..8), one global style lock.
  - resolution ceiling is 2K (2048 px) — a 4K request is rejected.
  - layer separation is a cross-cutting request appended to the prompt.
  - no negation-only prompts (Seedream has no negative-prompt field).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from typing import Any, List, Optional


VALID_MODES = {"T2I", "Design", "Edit", "MR", "sequential-set"}
VALID_ASPECT_RATIOS = {
    "1:1", "16:9", "9:16", "4:5", "5:4", "3:4", "4:3", "3:2", "2:3",
    "21:9", "auto",
}
# Seedream 5.0 Pro is a 2K model: 1K or 2K (max 2048 px), or auto.
# There is deliberately NO 4K tier (this differs from Seedream 4.5).
VALID_RESOLUTIONS = {"1K", "2K", "auto"}
NEGATION_TOKENS = (" no ", " not ", " without ", " avoid ", " never ")
WORD_BUDGET_MIN = 30
WORD_BUDGET_MAX = 100
WORD_HARD_CEILING = 120
MR_REF_CAP = 10
SET_COUNT_MIN = 2
SET_COUNT_MAX = 8
HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


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


def _validate_color(color: str) -> str:
    """A recolour/material value must be a hex code or a swatch/Image
    reference. Returns the normalised value or raises."""
    c = color.strip()
    if HEX_RE.match(c):
        return c
    low = c.lower()
    if "swatch" in low or re.search(r"image\s*\d", low):
        return c
    raise PromptValidationError(
        "recolour value must be a hex code (e.g. '#1E3A8A') or reference a "
        "swatch / an uploaded image (e.g. 'swatch: teal', 'match Image 2'); "
        f"got {color!r}."
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


def _settings_block(*, aspect_ratio: str, resolution: str,
                    set_count: Optional[int]) -> List[str]:
    block = [
        "",
        "[on-screen settings (pick these in the UI; NOT part of the "
        "prompt the model reads):",
        f"  aspect_ratio={aspect_ratio}",
        f"  resolution={resolution}",
    ]
    if set_count is not None:
        block.append(f"  image_count={set_count}")
    block.append("]")
    return block


def _layers_line() -> str:
    return (
        "Layer separation: split the result into independent transparent "
        "layers (title / subject / background / elements); export as PNG."
    )


def build_prompt(
    *,
    mode: str,
    subject: str,
    action: str = "",
    setting: str = "",
    style: str = "",
    camera: str = "",
    references: Optional[List[Any]] = None,
    frames: Optional[List[str]] = None,
    set_count: Optional[int] = None,
    target: Optional[str] = None,
    color: Optional[str] = None,
    layers: bool = False,
    in_image_text: Optional[str] = None,
    text_language: Optional[str] = None,
    aspect_ratio: str = "1:1",
    resolution: str = "2K",
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
    if resolution not in VALID_RESOLUTIONS:
        raise PromptValidationError(
            f"resolution must be one of {sorted(VALID_RESOLUTIONS)}; got "
            f"{resolution!r}. Seedream 5.0 Pro is a 2K model — there is no "
            "4K tier."
        )
    if in_image_text is not None and in_image_text.strip():
        if '"' not in in_image_text:
            raise PromptValidationError(
                "in-image text must be wrapped in double quotes so Seedream "
                'renders it literally, e.g. \'the title "VISIT KYOTO"\'.'
            )

    if mode == "sequential-set":
        return _build_sequential_set(
            subject=subject,
            style=style,
            frames=frames,
            set_count=set_count,
            layers=layers,
            in_image_text=in_image_text,
            text_language=text_language,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
        )

    return _build_still(
        mode=mode,
        subject=subject,
        action=action,
        setting=setting,
        style=style,
        camera=camera,
        references=references,
        target=target,
        color=color,
        layers=layers,
        in_image_text=in_image_text,
        text_language=text_language,
        aspect_ratio=aspect_ratio,
        resolution=resolution,
    )


def _build_still(
    *,
    mode: str,
    subject: str,
    action: str,
    setting: str,
    style: str,
    camera: str,
    references: Optional[List[Any]],
    target: Optional[str],
    color: Optional[str],
    layers: bool,
    in_image_text: Optional[str],
    text_language: Optional[str],
    aspect_ratio: str,
    resolution: str,
) -> str:
    if not subject or not subject.strip():
        raise PromptValidationError(f"{mode} requires a subject clause.")
    if not style or not style.strip():
        raise PromptValidationError(f"{mode} requires a style clause.")

    if _all_negation(subject, action, setting, style, camera):
        raise PromptValidationError(
            "every clause leans on negation tokens. Rephrase to positive "
            "description; Seedream has no negative-prompt field and does "
            "not honour in-prompt negation reliably."
        )

    refs: List[str] = []
    normalised_color: Optional[str] = None
    if mode == "Edit":
        refs = _normalize_refs(references or [])
        if len(refs) != 1:
            raise PromptValidationError(
                f"Edit mode requires exactly one reference (the uploaded "
                f"image); got {len(refs)}."
            )
        if color is not None and color.strip():
            normalised_color = _validate_color(color)
    elif mode == "MR":
        refs = _normalize_refs(references or [])
        if not (1 <= len(refs) <= MR_REF_CAP):
            raise PromptValidationError(
                f"MR mode requires 1..{MR_REF_CAP} references; got "
                f"{len(refs)}."
            )

    wc = _word_count(subject, action, setting, style, camera)
    if wc > WORD_HARD_CEILING:
        raise PromptValidationError(
            f"prompt is {wc} words; over {WORD_HARD_CEILING} confuses "
            f"Seedream. Trim toward the {WORD_BUDGET_MIN}-{WORD_BUDGET_MAX} "
            "word budget — cut adjectives, not subjects."
        )

    parts: List[str] = []
    if mode == "Design":
        parts.append("High-density design brief:")
    elif mode == "Edit":
        parts.append(f"Reference: {refs[0]}.")
        if target and target.strip():
            parts.append(f"Target: {target.strip()}.")
        parts.append("")
    elif mode == "MR":
        parts.append("Using the uploaded images:")
        for i, role in enumerate(refs, start=1):
            parts.append(f"  Image {i}: {role}.")
        parts.append("")

    for c in (subject, action, setting, style, camera):
        if c and c.strip():
            parts.append(c.strip())

    if normalised_color:
        parts.append(f"Colour / material value: {normalised_color}.")

    if in_image_text and in_image_text.strip():
        line = f"In-image text: {in_image_text.strip()}."
        if text_language and text_language.strip():
            line += f" (language: {text_language.strip()})"
        parts.append(line)

    if layers:
        parts.append(_layers_line())

    parts.extend(_settings_block(
        aspect_ratio=aspect_ratio, resolution=resolution, set_count=None,
    ))
    return "\n".join(parts)


def _build_sequential_set(
    *,
    subject: str,
    style: str,
    frames: Optional[List[str]],
    set_count: Optional[int],
    layers: bool,
    in_image_text: Optional[str],
    text_language: Optional[str],
    aspect_ratio: str,
    resolution: str,
) -> str:
    if not subject or not subject.strip():
        raise PromptValidationError(
            "sequential-set requires a subject held constant across the set."
        )
    if not style or not style.strip():
        raise PromptValidationError(
            "sequential-set requires a single global style/lighting clause "
            "held constant across the whole set."
        )
    if set_count is None:
        raise PromptValidationError(
            "sequential-set requires an explicit set count (e.g. --set-count "
            "6). Without it the model returns a single image."
        )
    if not (SET_COUNT_MIN <= set_count <= SET_COUNT_MAX):
        raise PromptValidationError(
            f"sequential-set count must be {SET_COUNT_MIN}..{SET_COUNT_MAX}; "
            f"got {set_count}. For larger sets, split into two and share an "
            "anchor image to hold identity."
        )
    frames = frames or []
    if frames and len(frames) > set_count:
        raise PromptValidationError(
            f"got {len(frames)} per-image states but the set count is "
            f"{set_count}; states must not exceed the count."
        )

    parts: List[str] = [
        f"Generate a set of {set_count} images of {subject.strip()}.",
        f"Style and lighting (same across the whole set): {style.strip()}.",
    ]
    if frames:
        parts.append("Across the set, change only:")
        for f in frames:
            parts.append(f"  {f.strip()}")
    if in_image_text and in_image_text.strip():
        line = f"In-image text: {in_image_text.strip()}."
        if text_language and text_language.strip():
            line += f" (language: {text_language.strip()})"
        parts.append(line)
    if layers:
        parts.append(_layers_line())

    parts.extend(_settings_block(
        aspect_ratio=aspect_ratio, resolution=resolution,
        set_count=set_count,
    ))
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
        description="Assemble a Seedream 5.0 Pro prompt with validation."
    )
    p.add_argument("--mode", required=True, choices=sorted(VALID_MODES))
    p.add_argument("--subject", required=True)
    p.add_argument("--action", default="")
    p.add_argument("--setting", default="")
    p.add_argument("--style", default="")
    p.add_argument("--camera", default="")
    p.add_argument(
        "--reference", action="append", default=None,
        help='Reference role; plain string or JSON {"role": "..."}. '
             "Order = on-screen order (Image 1, Image 2, ...).",
    )
    p.add_argument(
        "--frame", action="append", default=None,
        help="Per-image state for sequential-set mode; repeat per image.",
    )
    p.add_argument("--set-count", type=int, default=None,
                   help="Number of images in a sequential set (2..8).")
    p.add_argument("--target", default=None,
                   help="Edit mode: the marked element (point / box / lasso "
                        "/ sketch), described in words.")
    p.add_argument("--color", default=None,
                   help="Edit mode: recolour / material value — a hex code "
                        "(e.g. '#1E3A8A') or a swatch / Image reference.")
    p.add_argument("--layers", action="store_true",
                   help="Request layer separation (transparent PNG layers).")
    p.add_argument("--in-image-text", default=None,
                   help='Literal text to render; MUST be double-quoted, '
                        'e.g. \'the title "VISIT KYOTO"\'.')
    p.add_argument("--text-language", default=None,
                   help="Optional language hint for in-image text (e.g. ar, "
                        "ja); one of the 14 supported languages.")
    p.add_argument("--aspect-ratio", default="1:1",
                   choices=sorted(VALID_ASPECT_RATIOS))
    p.add_argument("--resolution", default="2K",
                   choices=sorted(VALID_RESOLUTIONS))
    return p.parse_args(argv)


def main(argv: List[str]) -> int:
    args = _parse_args(argv)
    try:
        refs = _parse_refs_arg(args.reference)
        prompt = build_prompt(
            mode=args.mode,
            subject=args.subject,
            action=args.action,
            setting=args.setting,
            style=args.style,
            camera=args.camera,
            references=refs,
            frames=args.frame,
            set_count=args.set_count,
            target=args.target,
            color=args.color,
            layers=args.layers,
            in_image_text=args.in_image_text,
            text_language=args.text_language,
            aspect_ratio=args.aspect_ratio,
            resolution=args.resolution,
        )
    except PromptValidationError as exc:
        print(f"PromptValidationError: {exc}", file=sys.stderr)
        return 2
    print(prompt)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
