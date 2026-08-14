#!/usr/bin/env python3
"""Assemble and validate a ChatGPT Image 2 (gpt-image-2) prompt.

Usage:
    python3 scripts/build-prompt.py --mode T2I \
        --subject "..." --action "..." --setting "..." \
        --style "..." --camera "..." --aspect-ratio 3:2

For MR mode, pass --reference one or more times (2..4 references):
    python3 scripts/build-prompt.py --mode MR --subject "..." \
        --action "..." --setting "..." --style "..." --camera "..." \
        --reference "subject's face" --reference "outfit"

Exits non-zero with a diagnostic on validation failure.
"""

from __future__ import annotations

import argparse
import sys
from typing import List, Optional


VALID_MODES = {"T2I", "I2I", "MR"}
VALID_ASPECT_RATIOS = {"1:1", "3:2", "2:3", "16:9", "9:16", "4:5"}
NEGATION_TOKENS = (" no ", " not ", " without ", " avoid ", " never ")
MR_MIN_REFS = 2
MR_MAX_REFS = 4


class PromptValidationError(ValueError):
    pass


def _has_negation(text: str) -> bool:
    """Return True when the clause contains any negation token."""
    if not text:
        return False
    padded = " " + text.lower().strip() + " "
    return any(tok in padded for tok in NEGATION_TOKENS)


def _all_negation(*clauses: str) -> bool:
    """Return True when every non-empty clause contains a negation token.

    Heuristic for "negation-dominant": every clause leans on no/not/
    without/avoid as control. A single negation in one clause is fine;
    negation across all five clauses is the failure mode this guards.
    """
    populated = [c for c in clauses if c and c.strip()]
    if not populated:
        return False
    return all(_has_negation(c) for c in populated)


def build_prompt(
    *,
    mode: str,
    subject: str,
    action: str,
    setting: str,
    style: str,
    camera: str,
    references: Optional[List[str]],
    aspect_ratio: str,
) -> str:
    """Assemble a validated prompt string. Raises PromptValidationError."""
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
        "subject": subject,
        "action": action,
        "setting": setting,
        "style": style,
        "camera": camera,
    }
    missing = [k for k, v in clauses.items() if not v or not v.strip()]
    if missing:
        raise PromptValidationError(
            f"missing required clause(s): {missing}. "
            "All five clauses (subject, action, setting, style, camera) "
            "are mandatory."
        )

    if _all_negation(*clauses.values()):
        raise PromptValidationError(
            "prompt is dominated by negation tokens (no/not/without/avoid). "
            "Rephrase to positive description; ChatGPT Image 2 does not "
            "honour negation reliably in prose."
        )

    if mode == "I2I":
        refs = references or []
        if len(refs) != 1:
            raise PromptValidationError(
                f"I2I mode requires exactly one reference; got {len(refs)}."
            )

    if mode == "MR":
        refs = references or []
        if not (MR_MIN_REFS <= len(refs) <= MR_MAX_REFS):
            raise PromptValidationError(
                f"MR mode requires {MR_MIN_REFS}..{MR_MAX_REFS} references; "
                f"got {len(refs)}. The practical cap is 4 for gpt-image-2."
            )

    parts: List[str] = []
    if mode == "MR":
        parts.append("References:")
        for i, role in enumerate(references or [], start=1):
            parts.append(f"  {i}. {role}")
        parts.append("")

    parts.append(subject.strip())
    parts.append(action.strip())
    parts.append(setting.strip())
    parts.append(style.strip())
    parts.append(camera.strip())
    parts.append("")
    parts.append(f"[aspect_ratio={aspect_ratio}]")

    return "\n".join(parts)


def _parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Assemble a gpt-image-2 prompt with validation."
    )
    p.add_argument("--mode", required=True, choices=sorted(VALID_MODES))
    p.add_argument("--subject", required=True)
    p.add_argument("--action", required=True)
    p.add_argument("--setting", required=True)
    p.add_argument("--style", required=True)
    p.add_argument("--camera", required=True)
    p.add_argument(
        "--reference",
        action="append",
        default=None,
        help="Reference role description; repeat for MR. 1 for I2I.",
    )
    p.add_argument(
        "--aspect-ratio",
        default="1:1",
        choices=sorted(VALID_ASPECT_RATIOS),
    )
    return p.parse_args(argv)


def main(argv: List[str]) -> int:
    args = _parse_args(argv)
    try:
        prompt = build_prompt(
            mode=args.mode,
            subject=args.subject,
            action=args.action,
            setting=args.setting,
            style=args.style,
            camera=args.camera,
            references=args.reference,
            aspect_ratio=args.aspect_ratio,
        )
    except PromptValidationError as exc:
        print(f"PromptValidationError: {exc}", file=sys.stderr)
        return 2
    print(prompt)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
