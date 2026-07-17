#!/usr/bin/env python3
"""Assemble and validate a Veo 3.1 prompt.

Modes:
  - T2V — text-to-video.
  - I2V — image-to-video, single starting frame.
  - Ingredients (alias: MR, R2V) — 1-3 reference images, mutually
    exclusive with F/L. Audio supported.
  - F/L — first-and-last frame, mutually exclusive with Ingredients.
    Audio supported.
  - AddRemove — surgical add/remove of an object on an existing clip.
    Uses Veo 2 model. NO audio (--audio is rejected).

Layered:
  - Timestamp prompting: pass --timestamp-segment repeated; segments must
    sum to the requested duration. Used inside any mode for multi-shot
    in one generation.
  - Dialogue/SFX/Ambient/Music syntax in the audio block.
  - Negative prompt accepts noun phrases only.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from typing import List, Optional


VALID_MODES = {"T2V", "I2V", "MR", "Ingredients", "R2V", "F/L", "AddRemove"}
INGREDIENTS_ALIASES = {"MR", "R2V", "Ingredients"}
VALID_ASPECT_RATIOS = {"16:9", "9:16"}
NEGATION_TOKENS = (" no ", " not ", " without ", " avoid ", " never ")
VALID_DURATIONS = {4, 6, 8}
INGREDIENTS_MIN = 1
INGREDIENTS_MAX = 3
TIMESTAMP_RE = re.compile(r"^\[(\d{2}):(\d{2})-(\d{2}):(\d{2})\]")


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


def _parse_segment_to_seconds(s: dict) -> float:
    """Accepts {'start_s': X, 'end_s': Y, 'text': '...'} or {'bracket':
    '[MM:SS-MM:SS]', 'text': '...'}.
    Returns the duration in seconds.
    """
    if "start_s" in s and "end_s" in s:
        start = float(s["start_s"])
        end = float(s["end_s"])
    elif "bracket" in s:
        m = TIMESTAMP_RE.match(s["bracket"].strip())
        if not m:
            raise PromptValidationError(
                f"timestamp segment bracket {s['bracket']!r} must match "
                "format [MM:SS-MM:SS]."
            )
        start = int(m.group(1)) * 60 + int(m.group(2))
        end = int(m.group(3)) * 60 + int(m.group(4))
    else:
        raise PromptValidationError(
            "timestamp segment requires either {'start_s', 'end_s'} or "
            "{'bracket': '[MM:SS-MM:SS]'}."
        )
    if end <= start:
        raise PromptValidationError(
            f"timestamp segment end ({end}) must be > start ({start})."
        )
    return end - start


def _validate_timestamp_segments(
    segments: List[dict], duration: Optional[int]
) -> None:
    if not segments:
        return
    durs = [_parse_segment_to_seconds(s) for s in segments]
    total = sum(durs)
    if duration is not None and abs(total - duration) > 1e-6:
        raise PromptValidationError(
            f"timestamp segments sum to {total} s but requested duration "
            f"is {duration} s."
        )


def build_prompt(
    *,
    mode: str,
    subject: str,
    action: str,
    setting: str,
    style: str,
    camera: str,
    motion: str,
    references: Optional[List[str]] = None,
    first_frame: Optional[str] = None,
    last_frame: Optional[str] = None,
    audio: Optional[str] = None,
    aspect_ratio: str = "16:9",
    duration_s: Optional[int] = None,
    timestamp_segments: Optional[List[dict]] = None,
    negative_prompt: Optional[str] = None,
) -> str:
    if mode not in VALID_MODES:
        raise PromptValidationError(
            f"mode must be one of {sorted(VALID_MODES)}; got {mode!r}"
        )
    if aspect_ratio not in VALID_ASPECT_RATIOS:
        raise PromptValidationError(
            f"aspect_ratio must be one of {sorted(VALID_ASPECT_RATIOS)} for "
            f"Veo 3.1; got {aspect_ratio!r}"
        )
    if duration_s is not None and duration_s not in VALID_DURATIONS:
        raise PromptValidationError(
            f"duration_s must be one of {sorted(VALID_DURATIONS)}; got "
            f"{duration_s!r}"
        )

    # Negative-prompt syntax: noun phrases only (no "no X" / "don't").
    if negative_prompt and negative_prompt.strip():
        np_lower = " " + negative_prompt.lower().strip() + " "
        bad = [t for t in (" no ", " don't ", " do not ", " without ")
               if t in np_lower]
        if bad:
            raise PromptValidationError(
                f"negative_prompt must use noun phrases only (no "
                f"{','.join(t.strip() for t in bad)}). Veo 3.1 expects "
                "comma-separated nouns, not negation syntax."
            )

    clauses = {
        "subject": subject,
        "action": action,
        "setting": setting,
        "style": style,
        "camera": camera,
        "motion": motion,
    }
    missing = [k for k, v in clauses.items() if not v or not v.strip()]
    if missing:
        raise PromptValidationError(
            f"missing required clause(s): {missing}. The motion clause is "
            "mandatory; the model fills with bias when omitted."
        )
    if _all_negation(*clauses.values()):
        raise PromptValidationError(
            "every clause leans on negation tokens. Rephrase to positive "
            "description."
        )

    refs = references or []
    has_fl_inputs = bool(first_frame) or bool(last_frame)
    is_ingredients = mode in INGREDIENTS_ALIASES

    if mode == "I2V":
        if len(refs) != 1:
            raise PromptValidationError(
                f"I2V mode requires exactly one reference (frame 1); "
                f"got {len(refs)}."
            )
        if has_fl_inputs:
            raise PromptValidationError(
                "I2V mode does not accept first_frame / last_frame inputs."
            )

    if is_ingredients:
        if not (INGREDIENTS_MIN <= len(refs) <= INGREDIENTS_MAX):
            raise PromptValidationError(
                f"Ingredients mode requires {INGREDIENTS_MIN}.."
                f"{INGREDIENTS_MAX} references; got {len(refs)}."
            )
        if has_fl_inputs:
            raise PromptValidationError(
                "Ingredients mode is mutually exclusive with first_frame/"
                "last_frame (F/L) inputs. Choose one or the other."
            )

    if mode == "F/L":
        if refs:
            raise PromptValidationError(
                "F/L mode is mutually exclusive with Ingredients-style "
                "references. Choose F/L or Ingredients, not both."
            )
        if not first_frame or not first_frame.strip():
            raise PromptValidationError(
                "F/L mode requires a first_frame input."
            )
        if not last_frame or not last_frame.strip():
            raise PromptValidationError(
                "F/L mode requires a last_frame input."
            )

    if mode == "AddRemove":
        if audio and audio.strip():
            raise PromptValidationError(
                "AddRemove mode uses the Veo 2 model and does NOT generate "
                "audio. Drop the audio input or switch to a 3.1 mode."
            )

    _validate_timestamp_segments(timestamp_segments or [], duration_s)

    parts: List[str] = []
    if is_ingredients and refs:
        canonical = "Ingredients to Video" if mode == "Ingredients" else mode
        parts.append(
            f"References ({canonical}; 1-3, mutually exclusive with F/L):"
        )
        for i, role in enumerate(refs, start=1):
            parts.append(f"  {i}. {role}")
        parts.append("")
    if mode == "I2V" and refs:
        parts.append(f"Reference (frame 1): {refs[0]}")
        parts.append("")
    if mode == "F/L":
        parts.append(f"First frame: {first_frame.strip()}")
        parts.append(f"Last frame: {last_frame.strip()}")
        parts.append("")
    if mode == "AddRemove":
        parts.append(
            "[AddRemove mode — uses the Veo 2 model. Audio will NOT be "
            "generated.]"
        )
        parts.append("")

    if timestamp_segments:
        parts.append("Timestamp segments:")
        for s in timestamp_segments:
            label = s.get("bracket")
            if not label and "start_s" in s and "end_s" in s:
                label = f"[{int(s['start_s']):02d}-{int(s['end_s']):02d}]"
            parts.append(f"  {label}  {s.get('text', '').strip()}")
        parts.append("")

    parts.append(camera.strip())
    parts.append(subject.strip())
    parts.append(action.strip())
    parts.append(setting.strip())
    parts.append(style.strip())
    parts.append(f"Motion: {motion.strip()}")
    if audio and audio.strip():
        parts.append("")
        parts.append(f"Audio: {audio.strip()}")
    parts.append("")
    parts.append(f"[aspect_ratio={aspect_ratio}]")
    if duration_s is not None:
        parts.append(f"[duration_s={duration_s}]")
    if negative_prompt and negative_prompt.strip():
        parts.append(
            f"[negative_prompt (noun phrases only): "
            f"{negative_prompt.strip()}]"
        )
    return "\n".join(parts)


def _parse_segments(raw: Optional[List[str]]) -> Optional[List[dict]]:
    if not raw:
        return None
    out = []
    for r in raw:
        try:
            out.append(json.loads(r))
        except json.JSONDecodeError as exc:
            raise PromptValidationError(
                f"--timestamp-segment value {r!r} is not valid JSON: {exc}"
            )
    return out


def _parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Assemble a Veo 3.1 prompt.")
    p.add_argument("--mode", required=True, choices=sorted(VALID_MODES))
    p.add_argument("--subject", required=True)
    p.add_argument("--action", required=True)
    p.add_argument("--setting", required=True)
    p.add_argument("--style", required=True)
    p.add_argument("--camera", required=True)
    p.add_argument("--motion", required=True)
    p.add_argument("--reference", action="append", default=None)
    p.add_argument("--first-frame", default=None)
    p.add_argument("--last-frame", default=None)
    p.add_argument("--audio", default=None)
    p.add_argument(
        "--aspect-ratio",
        default="16:9",
        choices=sorted(VALID_ASPECT_RATIOS),
    )
    p.add_argument(
        "--duration-s",
        type=int,
        default=None,
        choices=sorted(VALID_DURATIONS),
    )
    p.add_argument(
        "--timestamp-segment",
        action="append",
        default=None,
        help='JSON object: {"bracket": "[00:00-00:02]", "text": "..."} '
             'or {"start_s": 0, "end_s": 2, "text": "..."}.',
    )
    p.add_argument("--negative-prompt", default=None)
    return p.parse_args(argv)


def main(argv: List[str]) -> int:
    args = _parse_args(argv)
    try:
        segments = _parse_segments(args.timestamp_segment)
        prompt = build_prompt(
            mode=args.mode,
            subject=args.subject,
            action=args.action,
            setting=args.setting,
            style=args.style,
            camera=args.camera,
            motion=args.motion,
            references=args.reference,
            first_frame=args.first_frame,
            last_frame=args.last_frame,
            audio=args.audio,
            aspect_ratio=args.aspect_ratio,
            duration_s=args.duration_s,
            timestamp_segments=segments,
            negative_prompt=args.negative_prompt,
        )
    except PromptValidationError as exc:
        print(f"PromptValidationError: {exc}", file=sys.stderr)
        return 2
    print(prompt)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
