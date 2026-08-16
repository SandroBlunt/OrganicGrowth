#!/usr/bin/env python3
"""Assemble and validate a Kling 3.0 Omni prompt.

Modes: T2V, I2V, V2V, MR (mixed up to 7, mix-budget heuristic), F/L.

Mix-budget heuristic (vendor-unconfirmed; verify against latest official
docs):
  - video clips <= 2
  - if any video present, image count >= 3
  - audio (if API tier accepts) <= 1
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import List, Optional


VALID_MODES = {"T2V", "I2V", "V2V", "MR", "F/L"}
VALID_ASPECT_RATIOS = {"16:9", "9:16"}
VALID_REF_TYPES = {"image", "video", "audio"}
VALID_V2V_ROLES = {"subject identity", "motion source", "style source"}
NEGATION_TOKENS = (" no ", " not ", " without ", " avoid ", " never ")
MR_MAX_TOTAL = 7
MR_MAX_VIDEO = 2
MR_MAX_AUDIO = 1
MR_MIN_IMAGES_WHEN_VIDEO_PRESENT = 3


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


def _validate_v2v_role(role: str) -> None:
    parts = [p.strip() for p in role.split(",")]
    for p in parts:
        if p not in VALID_V2V_ROLES:
            raise PromptValidationError(
                f"V2V role part {p!r} not in {sorted(VALID_V2V_ROLES)}."
            )
    if len(parts) > 2:
        raise PromptValidationError(
            "V2V role names at most two of {subject identity, motion "
            f"source, style source}}; got {len(parts)}."
        )


def _validate_mr_mix_budget(
    references: List[dict],
    override: bool,
) -> Optional[str]:
    """Return None if within heuristic; raise if violated and not overridden."""
    if len(references) > MR_MAX_TOTAL:
        raise PromptValidationError(
            f"MR mode accepts at most {MR_MAX_TOTAL} total references; "
            f"got {len(references)}."
        )
    type_counts = {t: 0 for t in VALID_REF_TYPES}
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
        type_counts[t] += 1

    violations: List[str] = []
    if type_counts["video"] > MR_MAX_VIDEO:
        violations.append(
            f"video count {type_counts['video']} exceeds heuristic cap "
            f"{MR_MAX_VIDEO}"
        )
    if (type_counts["video"] > 0
            and type_counts["image"] < MR_MIN_IMAGES_WHEN_VIDEO_PRESENT):
        violations.append(
            f"video present but image count {type_counts['image']} below "
            f"floor {MR_MIN_IMAGES_WHEN_VIDEO_PRESENT}"
        )
    if type_counts["audio"] > MR_MAX_AUDIO:
        violations.append(
            f"audio count {type_counts['audio']} exceeds heuristic cap "
            f"{MR_MAX_AUDIO}"
        )

    if violations and not override:
        raise PromptValidationError(
            "MR mix-budget heuristic violated: "
            + "; ".join(violations)
            + ". Pass override_mix_budget=True to bypass; the heuristic "
            "is vendor-unconfirmed (verify against latest official docs)."
        )
    return None


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
    v2v_reference: Optional[str],
    v2v_role: Optional[str],
    first_frame: Optional[str],
    last_frame: Optional[str],
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

    if mode == "I2V":
        if not i2v_reference or not i2v_reference.strip():
            raise PromptValidationError("I2V mode requires an i2v_reference.")

    if mode == "V2V":
        if not v2v_reference or not v2v_reference.strip():
            raise PromptValidationError("V2V mode requires a v2v_reference.")
        if not v2v_role or not v2v_role.strip():
            raise PromptValidationError(
                "V2V mode requires a v2v_role naming one or two of "
                "{subject identity, motion source, style source}."
            )
        _validate_v2v_role(v2v_role)

    if mode == "MR":
        refs = references or []
        if not refs:
            raise PromptValidationError("MR mode requires at least 1 reference.")
        _validate_mr_mix_budget(refs, override_mix_budget)

    if mode == "F/L":
        if not first_frame or not first_frame.strip():
            raise PromptValidationError("F/L mode requires a first_frame.")
        if not last_frame or not last_frame.strip():
            raise PromptValidationError("F/L mode requires a last_frame.")

    parts: List[str] = []
    if mode == "I2V":
        parts.append(f"Reference (frame 1): {i2v_reference.strip()}")
        parts.append("")
    if mode == "V2V":
        parts.append(f"Reference clip (V2V source): {v2v_reference.strip()}")
        parts.append(f"Reference clip role: {v2v_role.strip()}")
        parts.append("")
    if mode == "MR":
        parts.append(
            "References (mixed, up to 7 total; mix-budget heuristic "
            "in translation-notes):"
        )
        for i, r in enumerate(references, start=1):
            parts.append(f"  {i}. [{r['type']}] {r['role']}")
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
    p = argparse.ArgumentParser(description="Assemble a Kling 3.0 Omni prompt.")
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
    p.add_argument("--v2v-reference", default=None)
    p.add_argument(
        "--v2v-role",
        default=None,
        help="One or two of: 'subject identity', 'motion source', "
             "'style source' (comma-separated).",
    )
    p.add_argument("--first-frame", default=None)
    p.add_argument("--last-frame", default=None)
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
            v2v_reference=args.v2v_reference,
            v2v_role=args.v2v_role,
            first_frame=args.first_frame,
            last_frame=args.last_frame,
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
