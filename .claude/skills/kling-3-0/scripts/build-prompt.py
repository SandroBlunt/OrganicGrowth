#!/usr/bin/env python3
"""Assemble and validate a Kling 3.0 prompt.

Modes: T2V, I2V (optional element binding), MR (element binding,
1–3 images per element), F/L. Multi-Shot (Auto / Custom, up to 6 shots,
3–15 s total) and native Audio (dialogue with attribution) layer on top.

Notes:
  - Multi-shot is a first-class mode in Kling 3.0; the historical "one
    beat per prompt" guard is removed.
  - Negative prompt is a separate parameter and does NOT count against
    the visible prompt's character budget.
  - 1:1 and 4:5 are supported in addition to 16:9 and 9:16.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any, List, Optional


VALID_MODES = {"T2V", "I2V", "MR", "F/L"}
VALID_ASPECT_RATIOS = {"16:9", "9:16", "1:1", "4:5"}
VALID_MULTI_SHOT = {"single", "auto", "custom"}
NEGATION_TOKENS = (" no ", " not ", " without ", " avoid ", " never ")
ELEMENT_MIN = 2
ELEMENT_MAX = 4
IMAGES_PER_ELEMENT_MIN = 1
IMAGES_PER_ELEMENT_MAX = 3
DURATION_MIN_S = 3
DURATION_MAX_S = 15
MAX_SHOTS = 6
MOTION_INTENSITY_MIN = 0.1
MOTION_INTENSITY_MAX = 1.0


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


def _validate_elements(elements: List[dict]) -> None:
    if not (ELEMENT_MIN <= len(elements) <= ELEMENT_MAX):
        raise PromptValidationError(
            f"MR mode requires {ELEMENT_MIN}..{ELEMENT_MAX} elements; "
            f"got {len(elements)}."
        )
    for i, el in enumerate(elements, start=1):
        if not isinstance(el, dict):
            raise PromptValidationError(
                f"element {i} is not a dict. Each element must have "
                "'name' and 'images' keys."
            )
        name = el.get("name")
        images = el.get("images") or []
        if not name or not str(name).strip():
            raise PromptValidationError(
                f"element {i} is missing a non-empty 'name'."
            )
        if not (IMAGES_PER_ELEMENT_MIN <= len(images) <=
                IMAGES_PER_ELEMENT_MAX):
            raise PromptValidationError(
                f"element {i} ({name!r}) has {len(images)} images; "
                f"each element requires {IMAGES_PER_ELEMENT_MIN}.."
                f"{IMAGES_PER_ELEMENT_MAX} images."
            )


def _validate_shots(
    shots: List[dict], multi_shot_mode: str, total_duration: Optional[int]
) -> None:
    if len(shots) > MAX_SHOTS:
        raise PromptValidationError(
            f"Multi-Shot accepts at most {MAX_SHOTS} shots; got {len(shots)}."
        )
    if multi_shot_mode == "custom":
        if not shots:
            raise PromptValidationError(
                "Custom Multi-Shot requires at least one shot."
            )
        durations: List[float] = []
        for i, s in enumerate(shots, start=1):
            if not isinstance(s, dict):
                raise PromptValidationError(
                    f"shot {i} is not a dict; expected "
                    "{'duration_s': N, 'text': '...'}."
                )
            d = s.get("duration_s")
            text = s.get("text")
            if d is None or not isinstance(d, (int, float)) or d <= 0:
                raise PromptValidationError(
                    f"shot {i} requires a positive 'duration_s'."
                )
            if not text or not str(text).strip():
                raise PromptValidationError(
                    f"shot {i} requires non-empty 'text'."
                )
            durations.append(float(d))
        total = sum(durations)
        if total_duration is not None and abs(total - total_duration) > 1e-6:
            raise PromptValidationError(
                f"Custom Multi-Shot per-shot durations sum to {total} s but "
                f"requested total duration is {total_duration} s."
            )
        if not (DURATION_MIN_S <= total <= DURATION_MAX_S):
            raise PromptValidationError(
                f"Custom Multi-Shot total {total} s outside the supported "
                f"range {DURATION_MIN_S}..{DURATION_MAX_S} s."
            )


def _validate_motion_intensity(value: Optional[float]) -> None:
    if value is None:
        return
    if not (MOTION_INTENSITY_MIN <= value <= MOTION_INTENSITY_MAX):
        raise PromptValidationError(
            f"motion_intensity {value} outside supported range "
            f"{MOTION_INTENSITY_MIN}..{MOTION_INTENSITY_MAX}."
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
    elements: Optional[List[dict]] = None,
    first_frame: Optional[str] = None,
    last_frame: Optional[str] = None,
    i2v_reference: Optional[str] = None,
    aspect_ratio: str = "16:9",
    multi_shot_mode: str = "single",
    shots: Optional[List[dict]] = None,
    total_duration_s: Optional[int] = None,
    audio: Optional[str] = None,
    motion_intensity: Optional[float] = None,
    negative_prompt: Optional[str] = None,
) -> str:
    if mode not in VALID_MODES:
        raise PromptValidationError(
            f"mode must be one of {sorted(VALID_MODES)}; got {mode!r}"
        )
    if aspect_ratio not in VALID_ASPECT_RATIOS:
        raise PromptValidationError(
            f"aspect_ratio must be one of {sorted(VALID_ASPECT_RATIOS)} for "
            f"Kling 3.0; got {aspect_ratio!r}"
        )
    if multi_shot_mode not in VALID_MULTI_SHOT:
        raise PromptValidationError(
            f"multi_shot_mode must be one of {sorted(VALID_MULTI_SHOT)}; "
            f"got {multi_shot_mode!r}"
        )
    if total_duration_s is not None and not (
        DURATION_MIN_S <= total_duration_s <= DURATION_MAX_S
    ):
        raise PromptValidationError(
            f"total_duration_s {total_duration_s} outside supported range "
            f"{DURATION_MIN_S}..{DURATION_MAX_S}."
        )
    _validate_motion_intensity(motion_intensity)

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
            "mandatory."
        )
    if _all_negation(*clauses.values()):
        raise PromptValidationError(
            "every clause leans on negation tokens. Rephrase to positive "
            "description."
        )

    if mode == "I2V":
        if not i2v_reference or not i2v_reference.strip():
            raise PromptValidationError(
                "I2V mode requires an i2v_reference (start frame) image."
            )
        if elements:
            _validate_elements(elements)

    if mode == "MR":
        elements = elements or []
        _validate_elements(elements)

    if mode == "F/L":
        if not first_frame or not first_frame.strip():
            raise PromptValidationError("F/L mode requires a first_frame.")
        if not last_frame or not last_frame.strip():
            raise PromptValidationError("F/L mode requires a last_frame.")

    if multi_shot_mode != "single":
        _validate_shots(shots or [], multi_shot_mode, total_duration_s)

    parts: List[str] = []
    if mode == "I2V":
        parts.append(f"Reference (start frame): {i2v_reference.strip()}")
        if elements:
            parts.append("Bound elements:")
            for i, el in enumerate(elements, start=1):
                parts.append(
                    f"  Element {i} — {el['name']}: {len(el['images'])} "
                    "images."
                )
                for j, img in enumerate(el["images"], start=1):
                    parts.append(f"    image {i}.{j}: {img}")
        parts.append("")
    if mode == "MR":
        parts.append("Elements:")
        for i, el in enumerate(elements, start=1):
            name = el["name"]
            imgs = el["images"]
            parts.append(f"  Element {i} — {name}: {len(imgs)} images.")
            for j, img in enumerate(imgs, start=1):
                parts.append(f"    image {i}.{j}: {img}")
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

    if multi_shot_mode == "auto":
        parts.append(
            f"Multi-Shot: auto (model plans transitions; up to {MAX_SHOTS} "
            "shots)."
        )
        if shots:
            for i, s in enumerate(shots, start=1):
                parts.append(f"  Shot {i}: {s.get('text', '').strip()}")
    elif multi_shot_mode == "custom":
        parts.append("Multi-Shot: custom (per-shot durations).")
        for i, s in enumerate(shots or [], start=1):
            parts.append(
                f"  Shot {i} ({s['duration_s']}s): {s['text'].strip()}"
            )

    if audio and audio.strip():
        parts.append(f"Audio: {audio.strip()}")
    if motion_intensity is not None:
        parts.append(f"Motion intensity: {motion_intensity}")

    parts.append("")
    parts.append(f"[aspect_ratio={aspect_ratio}]")
    if total_duration_s is not None:
        parts.append(f"[duration_s={total_duration_s}]")
    if negative_prompt and negative_prompt.strip():
        parts.append("")
        parts.append(
            "[negative_prompt (separate field; not counted in prompt "
            f"char budget): {negative_prompt.strip()}]"
        )
    return "\n".join(parts)


def _parse_elements(raw: Optional[List[str]]) -> Optional[List[dict]]:
    if not raw:
        return None
    out = []
    for r in raw:
        try:
            obj = json.loads(r)
        except json.JSONDecodeError as exc:
            raise PromptValidationError(
                f"--element value {r!r} is not valid JSON: {exc}"
            )
        out.append(obj)
    return out


def _parse_shots(raw: Optional[List[str]]) -> Optional[List[dict]]:
    if not raw:
        return None
    out = []
    for r in raw:
        try:
            obj = json.loads(r)
        except json.JSONDecodeError as exc:
            raise PromptValidationError(
                f"--shot value {r!r} is not valid JSON: {exc}"
            )
        out.append(obj)
    return out


def _parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Assemble a Kling 3.0 prompt.")
    p.add_argument("--mode", required=True, choices=sorted(VALID_MODES))
    p.add_argument("--subject", required=True)
    p.add_argument("--action", required=True)
    p.add_argument("--setting", required=True)
    p.add_argument("--style", required=True)
    p.add_argument("--camera", required=True)
    p.add_argument("--motion", required=True)
    p.add_argument(
        "--element",
        action="append",
        default=None,
        help='JSON object: {"name": "subject", "images": ["a", "b"]}; '
             "repeat 2..4 times for MR mode (1..3 images per element).",
    )
    p.add_argument("--first-frame", default=None)
    p.add_argument("--last-frame", default=None)
    p.add_argument("--i2v-reference", default=None)
    p.add_argument(
        "--aspect-ratio",
        default="16:9",
        choices=sorted(VALID_ASPECT_RATIOS),
    )
    p.add_argument(
        "--multi-shot-mode",
        default="single",
        choices=sorted(VALID_MULTI_SHOT),
    )
    p.add_argument(
        "--shot",
        action="append",
        default=None,
        help='JSON object: {"duration_s": N, "text": "..."}; repeat for '
             "custom or auto Multi-Shot (max 6).",
    )
    p.add_argument("--total-duration-s", type=int, default=None)
    p.add_argument("--audio", default=None)
    p.add_argument("--motion-intensity", type=float, default=None)
    p.add_argument("--negative-prompt", default=None)
    return p.parse_args(argv)


def main(argv: List[str]) -> int:
    args = _parse_args(argv)
    try:
        elements = _parse_elements(args.element)
        shots = _parse_shots(args.shot)
        prompt = build_prompt(
            mode=args.mode,
            subject=args.subject,
            action=args.action,
            setting=args.setting,
            style=args.style,
            camera=args.camera,
            motion=args.motion,
            elements=elements,
            first_frame=args.first_frame,
            last_frame=args.last_frame,
            i2v_reference=args.i2v_reference,
            aspect_ratio=args.aspect_ratio,
            multi_shot_mode=args.multi_shot_mode,
            shots=shots,
            total_duration_s=args.total_duration_s,
            audio=args.audio,
            motion_intensity=args.motion_intensity,
            negative_prompt=args.negative_prompt,
        )
    except PromptValidationError as exc:
        print(f"PromptValidationError: {exc}", file=sys.stderr)
        return 2
    print(prompt)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
