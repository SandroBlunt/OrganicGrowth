#!/usr/bin/env python3
"""Assemble and validate a Nano Banana 2 prompt.

Modes: T2I, I2I, MR (variant-aware caps), frame-sequence.

Variant-aware MR caps:
  flash (Nano Banana 2 / Gemini 3.1 Flash Image):
    objects <= 10, characters <= 4, total <= 14
  pro   (Nano Banana Pro / Gemini 3 Pro Image):
    objects <= 6, characters <= 5, total <= 14

References for MR can be passed as JSON objects:
  {"kind": "object" | "character", "role": "..."}.
Plain string references (legacy) are accepted and counted as "object".

Configuration parameters (NOT part of the visible prompt budget):
  - thinking_level: "minimal" | "High"
  - include_thoughts: bool
  - grounding_web: bool (flash + pro)
  - grounding_image: bool (flash only)
  - resolution: "512" | "1K" | "2K" | "4K" (512 is flash-only)
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any, List, Optional


VALID_MODES = {"T2I", "I2I", "MR", "frame-sequence"}
VALID_ASPECT_RATIOS = {
    "1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5",
    "5:4", "8:1", "9:16", "16:9", "21:9",
}
VALID_RESOLUTIONS = {"512", "1K", "2K", "4K"}
VALID_VARIANTS = {"flash", "pro"}
VALID_THINKING = {"minimal", "High"}
VALID_REF_KINDS = {"object", "character"}
NEGATION_TOKENS = (" no ", " not ", " without ", " avoid ", " never ")
FRAME_SEQ_MIN = 3
FRAME_SEQ_MAX = 8

VARIANT_MR_CAPS = {
    "flash": {"max_objects": 10, "max_characters": 4, "max_total": 14},
    "pro": {"max_objects": 6, "max_characters": 5, "max_total": 14},
}


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


def _normalize_refs(raw: List[Any]) -> List[dict]:
    out: List[dict] = []
    for r in raw:
        if isinstance(r, dict):
            kind = r.get("kind", "object")
            role = r.get("role")
            if kind not in VALID_REF_KINDS:
                raise PromptValidationError(
                    f"reference kind {kind!r} not in "
                    f"{sorted(VALID_REF_KINDS)}."
                )
            if not role or not str(role).strip():
                raise PromptValidationError(
                    "every reference requires a non-empty 'role'."
                )
            out.append({"kind": kind, "role": str(role)})
        else:
            # Legacy plain-string reference: treated as object.
            out.append({"kind": "object", "role": str(r)})
    return out


def _validate_mr_caps(refs: List[dict], variant: str) -> dict:
    caps = VARIANT_MR_CAPS[variant]
    counts = {"object": 0, "character": 0}
    for r in refs:
        counts[r["kind"]] += 1
    total = counts["object"] + counts["character"]
    if total > caps["max_total"]:
        raise PromptValidationError(
            f"MR total references {total} exceeds variant cap "
            f"{caps['max_total']} for {variant}."
        )
    if counts["object"] > caps["max_objects"]:
        raise PromptValidationError(
            f"MR object references {counts['object']} exceeds variant cap "
            f"{caps['max_objects']} for {variant}."
        )
    if counts["character"] > caps["max_characters"]:
        raise PromptValidationError(
            f"MR character references {counts['character']} exceeds variant "
            f"cap {caps['max_characters']} for {variant}."
        )
    if total < 1:
        raise PromptValidationError(
            "MR mode requires at least 1 reference."
        )
    return counts


def _validate_resolution_for_variant(
    resolution: Optional[str], variant: str
) -> None:
    if resolution is None:
        return
    if resolution not in VALID_RESOLUTIONS:
        raise PromptValidationError(
            f"resolution {resolution!r} not in {sorted(VALID_RESOLUTIONS)}."
        )
    if resolution == "512" and variant != "flash":
        raise PromptValidationError(
            "resolution '512' is supported on the Flash variant only."
        )


def _validate_grounding(
    grounding_web: bool, grounding_image: bool, variant: str
) -> None:
    if grounding_image and variant != "flash":
        raise PromptValidationError(
            "Image Search grounding is supported on the Flash variant only."
        )


def build_prompt(
    *,
    mode: str,
    subject: str,
    action: str,
    setting: str,
    style: str,
    camera: str,
    references: Optional[List[Any]] = None,
    frames: Optional[List[str]] = None,
    handoff: Optional[str] = None,
    aspect_ratio: str = "1:1",
    variant: str = "flash",
    resolution: Optional[str] = None,
    thinking_level: str = "minimal",
    include_thoughts: bool = False,
    grounding_web: bool = False,
    grounding_image: bool = False,
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
    if variant not in VALID_VARIANTS:
        raise PromptValidationError(
            f"variant must be one of {sorted(VALID_VARIANTS)}; got "
            f"{variant!r}"
        )
    if thinking_level not in VALID_THINKING:
        raise PromptValidationError(
            f"thinking_level must be one of {sorted(VALID_THINKING)}; got "
            f"{thinking_level!r}"
        )
    _validate_resolution_for_variant(resolution, variant)
    _validate_grounding(grounding_web, grounding_image, variant)

    if mode == "frame-sequence":
        return _build_frame_sequence(
            subject=subject,
            style=style,
            camera=camera,
            frames=frames,
            handoff=handoff,
            aspect_ratio=aspect_ratio,
            variant=variant,
            resolution=resolution,
            thinking_level=thinking_level,
            include_thoughts=include_thoughts,
            grounding_web=grounding_web,
            grounding_image=grounding_image,
        )

    return _build_still(
        mode=mode,
        subject=subject,
        action=action,
        setting=setting,
        style=style,
        camera=camera,
        references=references,
        aspect_ratio=aspect_ratio,
        variant=variant,
        resolution=resolution,
        thinking_level=thinking_level,
        include_thoughts=include_thoughts,
        grounding_web=grounding_web,
        grounding_image=grounding_image,
    )


def _config_block(
    *,
    aspect_ratio: str,
    variant: str,
    resolution: Optional[str],
    thinking_level: str,
    include_thoughts: bool,
    grounding_web: bool,
    grounding_image: bool,
) -> List[str]:
    block: List[str] = []
    block.append(f"[aspect_ratio={aspect_ratio}]")
    block.append(f"[variant={variant}]")
    if resolution is not None:
        block.append(f"[resolution={resolution}]")
    block.append(
        "[config (NOT part of prompt budget): "
        f"thinkingLevel={thinking_level}, "
        f"includeThoughts={str(include_thoughts).lower()}, "
        f"grounding_web={str(grounding_web).lower()}, "
        f"grounding_image={str(grounding_image).lower()}]"
    )
    return block


def _build_still(
    *,
    mode: str,
    subject: str,
    action: str,
    setting: str,
    style: str,
    camera: str,
    references: Optional[List[Any]],
    aspect_ratio: str,
    variant: str,
    resolution: Optional[str],
    thinking_level: str,
    include_thoughts: bool,
    grounding_web: bool,
    grounding_image: bool,
) -> str:
    clauses = {
        "subject": subject,
        "action": action,
        "setting": setting,
        "style": style,
        "camera": camera,
    }
    missing = [k for k, v in clauses.items() if not v or not v.strip()]
    if missing:
        raise PromptValidationError(
            f"missing required clause(s) for {mode}: {missing}."
        )
    if _all_negation(*clauses.values()):
        raise PromptValidationError(
            "every clause leans on negation tokens. Rephrase to positive "
            "description; Nano Banana 2 does not honour negation reliably."
        )

    if mode == "I2I":
        refs = references or []
        if len(refs) != 1:
            raise PromptValidationError(
                f"I2I mode requires exactly one reference; got {len(refs)}."
            )

    refs_n: List[dict] = []
    if mode == "MR":
        refs_n = _normalize_refs(references or [])
        _validate_mr_caps(refs_n, variant)

    parts: List[str] = []
    if mode == "MR":
        parts.append("References:")
        chars = [r for r in refs_n if r["kind"] == "character"]
        objs = [r for r in refs_n if r["kind"] == "object"]
        caps = VARIANT_MR_CAPS[variant]
        if chars:
            parts.append(
                f"  Characters ({len(chars)} of {caps['max_characters']}):"
            )
            for i, r in enumerate(chars, start=1):
                parts.append(f"    {i}. {r['role']}")
        if objs:
            parts.append(
                f"  Objects ({len(objs)} of {caps['max_objects']}):"
            )
            for i, r in enumerate(objs, start=1):
                parts.append(f"    {i}. {r['role']}")
        parts.append("")

    for c in (subject, action, setting, style, camera):
        parts.append(c.strip())

    parts.append("")
    parts.extend(_config_block(
        aspect_ratio=aspect_ratio,
        variant=variant,
        resolution=resolution,
        thinking_level=thinking_level,
        include_thoughts=include_thoughts,
        grounding_web=grounding_web,
        grounding_image=grounding_image,
    ))
    return "\n".join(parts)


def _build_frame_sequence(
    *,
    subject: str,
    style: str,
    camera: str,
    frames: Optional[List[str]],
    handoff: Optional[str],
    aspect_ratio: str,
    variant: str,
    resolution: Optional[str],
    thinking_level: str,
    include_thoughts: bool,
    grounding_web: bool,
    grounding_image: bool,
) -> str:
    if not subject or not subject.strip():
        raise PromptValidationError(
            "frame-sequence requires a subject held constant across frames."
        )
    if not style or not style.strip():
        raise PromptValidationError(
            "frame-sequence requires a style/lighting clause held constant."
        )
    if not camera or not camera.strip():
        raise PromptValidationError(
            "frame-sequence requires a camera clause held constant."
        )
    if not handoff or not handoff.strip():
        raise PromptValidationError(
            "frame-sequence requires a hand-off line naming the downstream "
            "video model and its input mode (e.g. 'Veo 3.1 "
            "first-and-last-frame')."
        )
    frames = frames or []
    if not (FRAME_SEQ_MIN <= len(frames) <= FRAME_SEQ_MAX):
        raise PromptValidationError(
            f"frame-sequence requires {FRAME_SEQ_MIN}..{FRAME_SEQ_MAX} "
            f"frames; got {len(frames)}."
        )

    parts: List[str] = [
        f"Subject (held constant): {subject.strip()}",
        f"Style and lighting (held constant): {style.strip()}",
        f"Camera (held constant): {camera.strip()}",
        f"Aspect ratio: {aspect_ratio}",
        "",
        "Sequence intent:",
    ]
    for f in frames:
        parts.append(f"  {f.strip()}")
    parts.append("")
    parts.append(f"Hand-off: {handoff.strip()}")
    parts.append("")
    parts.extend(_config_block(
        aspect_ratio=aspect_ratio,
        variant=variant,
        resolution=resolution,
        thinking_level=thinking_level,
        include_thoughts=include_thoughts,
        grounding_web=grounding_web,
        grounding_image=grounding_image,
    ))
    return "\n".join(parts)


def _parse_refs_arg(raw: Optional[List[str]]) -> Optional[List[Any]]:
    if not raw:
        return None
    out: List[Any] = []
    for r in raw:
        # Try JSON first; fall back to plain string for legacy compat.
        try:
            obj = json.loads(r)
            out.append(obj)
        except json.JSONDecodeError:
            out.append(r)
    return out


def _parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Assemble a Nano Banana 2 prompt with validation."
    )
    p.add_argument("--mode", required=True, choices=sorted(VALID_MODES))
    p.add_argument("--subject", required=True)
    p.add_argument("--action", default="")
    p.add_argument("--setting", default="")
    p.add_argument("--style", required=True)
    p.add_argument("--camera", required=True)
    p.add_argument(
        "--reference",
        action="append",
        default=None,
        help='Reference role; either a plain string (treated as "object") '
             'or a JSON object {"kind": "character|object", "role": "..."}.',
    )
    p.add_argument("--frame", action="append", default=None,
                   help="Frame description; repeat 3..8 times for "
                        "frame-sequence mode.")
    p.add_argument("--handoff", default=None,
                   help="Hand-off line for frame-sequence mode.")
    p.add_argument(
        "--aspect-ratio", default="1:1",
        choices=sorted(VALID_ASPECT_RATIOS),
    )
    p.add_argument(
        "--variant", default="flash", choices=sorted(VALID_VARIANTS),
    )
    p.add_argument(
        "--resolution", default=None,
        choices=sorted(VALID_RESOLUTIONS),
    )
    p.add_argument(
        "--thinking-level", default="minimal",
        choices=sorted(VALID_THINKING),
    )
    p.add_argument("--include-thoughts", action="store_true")
    p.add_argument("--grounding-web", action="store_true")
    p.add_argument("--grounding-image", action="store_true")
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
            handoff=args.handoff,
            aspect_ratio=args.aspect_ratio,
            variant=args.variant,
            resolution=args.resolution,
            thinking_level=args.thinking_level,
            include_thoughts=args.include_thoughts,
            grounding_web=args.grounding_web,
            grounding_image=args.grounding_image,
        )
    except PromptValidationError as exc:
        print(f"PromptValidationError: {exc}", file=sys.stderr)
        return 2
    print(prompt)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
