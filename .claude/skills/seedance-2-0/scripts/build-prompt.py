#!/usr/bin/env python3
"""Assemble and validate a Seedance 2.0 prompt.

Modes: T2V, I2V, MR (per-modality caps + mix-budget heuristic), F/L.

Per-modality caps (documented):
  images <= 9, videos <= 3, audios <= 3

Mix-budget heuristic (vendor-unconfirmed):
  - if any video or audio present, images >= 2
  - effective video cap 2 (3 documented but not recommended)
  - effective audio cap 2 (3 documented but not recommended)
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import List, Optional


VALID_MODES = {"T2V", "I2V", "MR", "F/L"}
VALID_ASPECT_RATIOS = {"16:9", "9:16"}
VALID_REF_TYPES = {"image", "video", "audio"}
NEGATION_TOKENS = (" no ", " not ", " without ", " avoid ", " never ")
DOC_MAX_IMAGES = 9
DOC_MAX_VIDEOS = 3
DOC_MAX_AUDIOS = 3
HEURISTIC_EFFECTIVE_VIDEO_CAP = 2
HEURISTIC_EFFECTIVE_AUDIO_CAP = 2
HEURISTIC_MIN_IMAGES_WHEN_AV_PRESENT = 2


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


def _validate_mr(references: List[dict], override: bool) -> dict:
    counts = {t: 0 for t in VALID_REF_TYPES}
    for r in references:
        t = r.get("type")
        if t not in VALID_REF_TYPES:
            raise PromptValidationError(
                f"reference type {t!r} not in {sorted(VALID_REF_TYPES)}."
            )
        if not r.get("role") or not str(r["role"]).strip():
            raise PromptValidationError(
                "every reference requires a non-empty 'role'."
            )
        counts[t] += 1

    # Documented caps — hard.
    if counts["image"] > DOC_MAX_IMAGES:
        raise PromptValidationError(
            f"image references {counts['image']} exceeds documented cap "
            f"{DOC_MAX_IMAGES}."
        )
    if counts["video"] > DOC_MAX_VIDEOS:
        raise PromptValidationError(
            f"video references {counts['video']} exceeds documented cap "
            f"{DOC_MAX_VIDEOS}."
        )
    if counts["audio"] > DOC_MAX_AUDIOS:
        raise PromptValidationError(
            f"audio references {counts['audio']} exceeds documented cap "
            f"{DOC_MAX_AUDIOS}."
        )

    # Heuristic caps — soft, override-able.
    violations: List[str] = []
    if (counts["video"] > 0 or counts["audio"] > 0) and \
            counts["image"] < HEURISTIC_MIN_IMAGES_WHEN_AV_PRESENT:
        violations.append(
            f"video or audio present but image count {counts['image']} "
            f"below floor {HEURISTIC_MIN_IMAGES_WHEN_AV_PRESENT}"
        )
    if counts["video"] > HEURISTIC_EFFECTIVE_VIDEO_CAP:
        violations.append(
            f"video count {counts['video']} exceeds effective heuristic "
            f"cap {HEURISTIC_EFFECTIVE_VIDEO_CAP} "
            f"(documented max is {DOC_MAX_VIDEOS}; field experience says "
            "blending occurs above 2)"
        )
    if counts["audio"] > HEURISTIC_EFFECTIVE_AUDIO_CAP:
        violations.append(
            f"audio count {counts['audio']} exceeds effective heuristic "
            f"cap {HEURISTIC_EFFECTIVE_AUDIO_CAP} "
            f"(documented max is {DOC_MAX_AUDIOS}; field experience says "
            "blending occurs above 2)"
        )

    if violations and not override:
        raise PromptValidationError(
            "MR mix-budget heuristic violated: "
            + "; ".join(violations)
            + ". Pass override_mix_budget=True to bypass; the heuristic "
            "is vendor-unconfirmed (verify against latest official docs)."
        )
    return counts


def build_prompt(
    *,
    mode: str,
    subject: str,
    action: str,
    setting: str,
    style: str,
    camera: str,
    motion: str,
    references: Optional[List[dict]],
    i2v_reference: Optional[str],
    first_frame: Optional[str],
    last_frame: Optional[str],
    audio: Optional[str],
    aspect_ratio: str,
    override_mix_budget: bool,
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

    clauses = {
        "subject": subject, "action": action, "setting": setting,
        "style": style, "camera": camera, "motion": motion,
    }
    missing = [k for k, v in clauses.items() if not v or not v.strip()]
    if missing:
        raise PromptValidationError(
            f"missing required clause(s): {missing}."
        )
    if _all_negation(*clauses.values()):
        raise PromptValidationError(
            "every clause leans on negation tokens; rephrase to positive."
        )

    counts = {"image": 0, "video": 0, "audio": 0}
    if mode == "I2V":
        if not i2v_reference or not i2v_reference.strip():
            raise PromptValidationError("I2V mode requires an i2v_reference.")
    if mode == "MR":
        refs = references or []
        if not refs:
            raise PromptValidationError("MR mode requires at least 1 reference.")
        counts = _validate_mr(refs, override_mix_budget)
    if mode == "F/L":
        if not first_frame or not first_frame.strip():
            raise PromptValidationError("F/L mode requires a first_frame.")
        if not last_frame or not last_frame.strip():
            raise PromptValidationError("F/L mode requires a last_frame.")

    parts: List[str] = []
    if mode == "I2V":
        parts.append(f"Reference (frame 1): {i2v_reference.strip()}")
        parts.append("")
    if mode == "MR":
        parts.append("References:")
        # Group by type.
        groups = {"image": [], "video": [], "audio": []}
        for r in references:
            groups[r["type"]].append(r["role"])
        if groups["image"]:
            parts.append(f"  Images ({counts['image']}/{DOC_MAX_IMAGES}):")
            for i, role in enumerate(groups["image"], start=1):
                parts.append(f"    {i}. {role}")
        if groups["video"]:
            parts.append(f"  Videos ({counts['video']}/{DOC_MAX_VIDEOS}):")
            for i, role in enumerate(groups["video"], start=1):
                parts.append(f"    {i}. [video] {role}")
        if groups["audio"]:
            parts.append(f"  Audios ({counts['audio']}/{DOC_MAX_AUDIOS}):")
            for i, role in enumerate(groups["audio"], start=1):
                parts.append(f"    {i}. [audio] {role}")
        if override_mix_budget:
            parts.append(
                "  [heuristic-override: user accepted mix-budget violation]"
            )
        parts.append("")
    if mode == "F/L":
        parts.append(f"First frame: {first_frame.strip()}")
        parts.append(f"Last frame: {last_frame.strip()}")
        parts.append("")

    parts.append(subject.strip())
    parts.append(action.strip())
    parts.append(setting.strip())
    parts.append(style.strip())
    parts.append(camera.strip())
    parts.append(f"Motion: {motion.strip()}")
    if audio and audio.strip():
        parts.append(f"Audio: {audio.strip()}")
    parts.append("")
    parts.append(f"[aspect_ratio={aspect_ratio}]")
    return "\n".join(parts)


def _parse_refs(raw: Optional[List[str]]) -> Optional[List[dict]]:
    if not raw:
        return None
    out = []
    for r in raw:
        try:
            out.append(json.loads(r))
        except json.JSONDecodeError as exc:
            raise PromptValidationError(
                f"--reference value {r!r} is not valid JSON: {exc}"
            )
    return out


def _parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Assemble a Seedance 2.0 prompt.")
    p.add_argument("--mode", required=True, choices=sorted(VALID_MODES))
    p.add_argument("--subject", required=True)
    p.add_argument("--action", required=True)
    p.add_argument("--setting", required=True)
    p.add_argument("--style", required=True)
    p.add_argument("--camera", required=True)
    p.add_argument("--motion", required=True)
    p.add_argument(
        "--reference",
        action="append",
        default=None,
        help='JSON object: {"type": "image|video|audio", "role": "..."}; '
             "repeat for MR.",
    )
    p.add_argument("--i2v-reference", default=None)
    p.add_argument("--first-frame", default=None)
    p.add_argument("--last-frame", default=None)
    p.add_argument("--audio", default=None)
    p.add_argument(
        "--aspect-ratio",
        default="16:9",
        choices=sorted(VALID_ASPECT_RATIOS),
    )
    p.add_argument(
        "--override-mix-budget",
        action="store_true",
        help="Bypass the vendor-unconfirmed mix-budget heuristic for MR.",
    )
    return p.parse_args(argv)


def main(argv: List[str]) -> int:
    args = _parse_args(argv)
    try:
        refs = _parse_refs(args.reference)
        prompt = build_prompt(
            mode=args.mode,
            subject=args.subject,
            action=args.action,
            setting=args.setting,
            style=args.style,
            camera=args.camera,
            motion=args.motion,
            references=refs,
            i2v_reference=args.i2v_reference,
            first_frame=args.first_frame,
            last_frame=args.last_frame,
            audio=args.audio,
            aspect_ratio=args.aspect_ratio,
            override_mix_budget=args.override_mix_budget,
        )
    except PromptValidationError as exc:
        print(f"PromptValidationError: {exc}", file=sys.stderr)
        return 2
    print(prompt)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
