#!/usr/bin/env python3
"""Assemble and validate a Happy Horse prompt for front-end use.

This is a prompt-assembly helper: it builds the natural-language prompt
string a user pastes into the Happy Horse front-end (happy-horse.ai,
running Alibaba's HappyHorse-1.0). It does NOT call any API. On-screen
settings (duration, resolution, aspect ratio) are recorded for the
operator and printed in a trailing settings block; they are not part of
the prompt the model reads.

Modes: T2V, I2V (first-frame), R2V (up to 5 reference assets), edit.

Happy Horse prompt rules enforced here:
  - subject+action leads, then camera, then style, then environment;
    audio block placed LAST.
  - camera clause names one of the six named moves (pan, tilt, dolly,
    zoom, orbit, crane) or 'static' — soft check; --override-camera
    bypasses it for prose-only moves like 'tracking shot'.
  - reference assets bound with @Image1 / @Video1 tokens.
  - I2V: exactly one first-frame image. R2V / edit: 1..5 reference assets.
  - native audio: dialogue requires a language; audio always last.
  - duration 4..15 s; resolution in {480p, 720p, 1080p}; aspect ratio in
    the supported set.
  - assembled prompt under the ~2500-character front-end limit.
  - no negation-only prompts (Happy Horse has no negative-prompt field).
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any, List, Optional


VALID_MODES = {"T2V", "I2V", "R2V", "edit"}
VALID_RESOLUTIONS = {"480p", "720p", "1080p"}
VALID_ASPECT_RATIOS = {"16:9", "9:16", "1:1", "4:3", "3:4"}
VALID_REF_KINDS = {"image", "video"}
NAMED_CAMERA_MOVES = {
    "pan", "tilt", "dolly", "zoom", "orbit", "crane", "static",
}
NEGATION_TOKENS = (" no ", " not ", " without ", " avoid ", " never ")
DURATION_MIN = 4
DURATION_MAX = 15
REF_CAP = 5
CHAR_LIMIT = 2500


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
            kind = r.get("kind", "image")
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
            out.append({"kind": "image", "role": str(r)})
    return out


def _camera_names_move(camera: str) -> bool:
    """True when the camera clause mentions a named move or 'static'."""
    lowered = camera.lower()
    return any(move in lowered for move in NAMED_CAMERA_MOVES)


def _parse_dialogue(raw: Optional[str]) -> Optional[dict]:
    """Dialogue arg format: 'language|line'."""
    if not raw or not raw.strip():
        return None
    if "|" not in raw:
        raise PromptValidationError(
            "dialogue must be 'language|line', e.g. "
            '\'English|she says, "You made it."\'. A language is required '
            "for accurate lip-sync."
        )
    lang, line = raw.split("|", 1)
    if not lang.strip():
        raise PromptValidationError("dialogue requires a language.")
    if not line.strip():
        raise PromptValidationError("dialogue requires a line.")
    return {"language": lang.strip(), "line": line.strip()}


def _settings_block(*, duration: int, resolution: str,
                    aspect_ratio: str) -> List[str]:
    return [
        "",
        "[on-screen settings (pick these in the UI; NOT part of the "
        "prompt the model reads):",
        f"  duration_s={duration}",
        f"  resolution={resolution}",
        f"  aspect_ratio={aspect_ratio}",
        "]",
    ]


def build_prompt(
    *,
    mode: str,
    subject: str,
    action: str,
    camera: str,
    style: str = "",
    environment: str = "",
    references: Optional[List[Any]] = None,
    dialogue: Optional[str] = None,
    sfx: Optional[str] = None,
    ambience: Optional[str] = None,
    music: Optional[str] = None,
    sequence: Optional[List[str]] = None,
    duration: int = 5,
    resolution: str = "1080p",
    aspect_ratio: str = "16:9",
    override_camera: bool = False,
) -> str:
    if mode not in VALID_MODES:
        raise PromptValidationError(
            f"mode must be one of {sorted(VALID_MODES)}; got {mode!r}"
        )
    if not subject or not subject.strip():
        raise PromptValidationError(f"{mode} requires a subject clause.")
    if not action or not action.strip():
        raise PromptValidationError(f"{mode} requires an action clause.")
    if not camera or not camera.strip():
        raise PromptValidationError(
            f"{mode} requires a camera clause (name a move or 'static')."
        )
    if not _camera_names_move(camera) and not override_camera:
        raise PromptValidationError(
            "camera clause names none of the six named moves "
            "(pan, tilt, dolly, zoom, orbit, crane) nor 'static'. "
            "Pass override_camera=True (CLI: --override-camera) to allow "
            "a prose-only move such as 'tracking shot' or 'reference "
            "@Video1 for camera movement'."
        )
    if resolution not in VALID_RESOLUTIONS:
        raise PromptValidationError(
            f"resolution must be one of {sorted(VALID_RESOLUTIONS)}; "
            f"got {resolution!r}"
        )
    if aspect_ratio not in VALID_ASPECT_RATIOS:
        raise PromptValidationError(
            f"aspect_ratio must be one of {sorted(VALID_ASPECT_RATIOS)}; "
            f"got {aspect_ratio!r}"
        )
    if not (DURATION_MIN <= duration <= DURATION_MAX):
        raise PromptValidationError(
            f"duration must be {DURATION_MIN}..{DURATION_MAX} seconds; got "
            f"{duration}."
        )
    if _all_negation(subject, action, camera, style, environment):
        raise PromptValidationError(
            "every clause leans on negation tokens. Rephrase to positive "
            "description; Happy Horse has no negative-prompt field."
        )

    refs = _normalize_refs(references or [])
    if mode == "I2V":
        imgs = [r for r in refs if r["kind"] == "image"]
        if len(imgs) != 1 or len(refs) != 1:
            raise PromptValidationError(
                "I2V requires exactly one reference image (the first "
                f"frame); got {len(refs)} reference(s)."
            )
    elif mode in {"R2V", "edit"}:
        if not (1 <= len(refs) <= REF_CAP):
            raise PromptValidationError(
                f"{mode} requires 1..{REF_CAP} reference assets; got "
                f"{len(refs)}."
            )
    elif mode == "T2V" and refs:
        raise PromptValidationError(
            "T2V takes no reference assets; use I2V, R2V, or edit."
        )

    dlg = _parse_dialogue(dialogue)

    parts: List[str] = []

    # Reference-token binding line.
    if refs:
        image_idx = 0
        video_idx = 0
        bound: List[str] = []
        for r in refs:
            if r["kind"] == "video":
                video_idx += 1
                tok = f"@Video{video_idx}"
            else:
                image_idx += 1
                tok = f"@Image{image_idx}"
            bound.append(f"{tok}: {r['role']}")
        if mode == "I2V":
            parts.append(f"Use @Image1 as the first frame ({refs[0]['role']}).")
        elif mode == "edit":
            parts.append("Edit; " + "; ".join(bound) + ".")
        else:
            parts.append("Use " + "; ".join(bound) + ".")

    # Subject + action (leads), optional sequence beats.
    parts.append(f"{subject.strip()} {action.strip()}".strip())
    if sequence:
        parts.append("Sequence: " + _format_sequence(sequence))

    # Camera, style, environment.
    parts.append(f"Camera: {camera.strip()}.")
    if style and style.strip():
        parts.append(f"Style: {style.strip()}.")
    if environment and environment.strip():
        parts.append(f"Environment: {environment.strip()}.")

    # Audio block — always LAST.
    audio_lines: List[str] = []
    if dlg:
        audio_lines.append(f"  Dialogue ({dlg['language']}): {dlg['line']}")
    if sfx and sfx.strip():
        audio_lines.append(f"  SFX: {sfx.strip()}.")
    if ambience and ambience.strip():
        audio_lines.append(f"  Ambience: {ambience.strip()}.")
    if music and music.strip():
        audio_lines.append(f"  Music: {music.strip()}.")
    if audio_lines:
        parts.append("Audio:")
        parts.extend(audio_lines)

    body = "\n".join(parts)
    if len(body) > CHAR_LIMIT:
        raise PromptValidationError(
            f"assembled prompt is {len(body)} characters; over the "
            f"{CHAR_LIMIT}-character front-end limit. Trim it."
        )

    out = parts + _settings_block(
        duration=duration, resolution=resolution, aspect_ratio=aspect_ratio,
    )
    return "\n".join(out)


def _format_sequence(beats: List[str]) -> str:
    beats = [b.strip() for b in beats if b and b.strip()]
    if not beats:
        return ""
    if len(beats) == 1:
        return beats[0] + "."
    if len(beats) == 2:
        return f"First, {beats[0]}. Then, {beats[1]}."
    parts = [f"First, {beats[0]}."]
    for b in beats[1:-1]:
        parts.append(f"Then, {b}.")
    parts.append(f"Finally, {beats[-1]}.")
    return " ".join(parts)


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
        description="Assemble a Happy Horse prompt with validation."
    )
    p.add_argument("--mode", required=True, choices=sorted(VALID_MODES))
    p.add_argument("--subject", required=True)
    p.add_argument("--action", required=True)
    p.add_argument("--camera", required=True,
                   help="Camera move clause; name pan/tilt/dolly/zoom/"
                        "orbit/crane or 'static'.")
    p.add_argument("--style", default="")
    p.add_argument("--environment", default="")
    p.add_argument(
        "--reference", action="append", default=None,
        help='Reference asset; plain string (image) or JSON '
             '{"kind":"image|video","role":"..."}. I2V=1 image; '
             "R2V/edit=1..5.",
    )
    p.add_argument("--dialogue", default=None,
                   help="Dialogue as 'language|line'; language required.")
    p.add_argument("--sfx", default=None)
    p.add_argument("--ambience", default=None)
    p.add_argument("--music", default=None)
    p.add_argument("--beat", action="append", default=None, dest="sequence",
                   help="Sequence beat; repeat for First/then/finally.")
    p.add_argument("--duration", type=int, default=5)
    p.add_argument("--resolution", default="1080p",
                   choices=sorted(VALID_RESOLUTIONS))
    p.add_argument("--aspect-ratio", default="16:9",
                   choices=sorted(VALID_ASPECT_RATIOS))
    p.add_argument("--override-camera", action="store_true",
                   help="Allow a camera clause that names none of the six "
                        "moves nor 'static' (e.g. prose moves like "
                        "'tracking shot').")
    return p.parse_args(argv)


def main(argv: List[str]) -> int:
    args = _parse_args(argv)
    try:
        refs = _parse_refs_arg(args.reference)
        prompt = build_prompt(
            mode=args.mode,
            subject=args.subject,
            action=args.action,
            camera=args.camera,
            style=args.style,
            environment=args.environment,
            references=refs,
            dialogue=args.dialogue,
            sfx=args.sfx,
            ambience=args.ambience,
            music=args.music,
            sequence=args.sequence,
            duration=args.duration,
            resolution=args.resolution,
            aspect_ratio=args.aspect_ratio,
            override_camera=args.override_camera,
        )
    except PromptValidationError as exc:
        print(f"PromptValidationError: {exc}", file=sys.stderr)
        return 2
    print(prompt)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
