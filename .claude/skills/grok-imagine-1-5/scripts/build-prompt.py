#!/usr/bin/env python3
"""Assemble and validate a Grok Imagine 1.5 video prompt for front-end use.

This is a prompt-assembly helper: it builds the natural-language prompt
string a user pastes into Grok Imagine (grok.com, the X app, or the Grok
Imagine app), which runs xAI's Grok Imagine 1.5 video model. It does NOT
call any API. On-screen settings (duration, aspect ratio) are recorded for
the operator and printed in a trailing settings block; they are not part of
the prompt the model reads.

Modes: T2V, I2V (image-to-video, preferred), extend (video extension),
reference (1-7 style/character images).

Grok prompt rules enforced here:
  - camera move front-loaded, then subject + action (with intensity and
    timing), then environment / atmosphere, then lighting / style; the
    Sound block is placed LAST.
  - one camera move per clip: the camera clause must name a known cinematic
    move (push-in, dolly, orbit, tracking, arc, pan, tilt, zoom, crane,
    static / locked-off, handheld) AND name only one distinct move.
    --override-camera bypasses both the named-move and the stacking checks.
  - a Sound / Audio section is REQUIRED (dialogue, SFX, ambience, or music).
    Grok generates native audio in the same pass; a prompt with no sound cue
    is refused. Sound is always placed last.
  - I2V: exactly one reference image (the first frame); the prompt describes
    only what changes. extend: exactly one source clip. reference: 1..7
    style / character images. T2V: no references.
  - moderation-safety scanner (signature): the assembled clauses are scanned
    for high-risk trigger words (violence language, extreme photorealism
    cues, celebrity likeness). If any are found the build is REFUSED with a
    per-term safer alternative from the guide's rephrasing table.
    --override-safety is a conscious escape hatch (you accept a higher
    flag risk).
  - duration 1..15 s (5-8 s is the sweet spot); aspect ratio in the
    supported set.
  - no negation-only prompts (Grok is positive-direction; there is no
    negative-prompt field).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from typing import Any, List, Optional


VALID_MODES = {"T2V", "I2V", "extend", "reference"}
VALID_ASPECT_RATIOS = {"16:9", "9:16", "1:1", "4:3", "3:4"}
VALID_REF_KINDS = {"image", "video"}
NEGATION_TOKENS = (" no ", " not ", " without ", " avoid ", " never ")
DURATION_MIN = 1
DURATION_MAX = 15
SWEET_SPOT = (5, 8)
REF_CAP = 7
CHAR_LIMIT = 2000

# Canonical camera-move groups. Each group maps to the surface variants that
# name it; synonyms (static / locked-off) collapse to one group so a phrasing
# like "locked-off / static" is NOT read as two stacked moves.
CAMERA_MOVE_GROUPS = {
    "push-in": ["push-in", "push in"],
    "dolly": ["dolly"],
    "orbit": ["orbit", "orbits", "orbiting"],
    "tracking": ["tracking", "tracks", "track"],
    "arc": ["arc", "arcs", "arcing"],
    "pan": ["pan", "pans", "panning"],
    "tilt": ["tilt", "tilts", "tilting"],
    "zoom": ["zoom", "zooms", "zooming"],
    "crane": ["crane", "cranes", "craning"],
    "static": ["static", "locked-off", "locked off", "locked-down"],
    "handheld": ["handheld", "hand-held"],
}

# Moderation triggers -> safer rephrasing, distilled from the guide's
# "risky -> safer" table plus its high-risk trigger list. Keys are matched
# with a leading word boundary (so "fight" also catches "fights",
# "fighting"). Multi-word keys are matched as phrases.
MODERATION_TRIGGERS = {
    # Direct violence language.
    "fight": "athletic stage routine / theatrical performance sequence / "
             "precise stage-combat rehearsal",
    "strike": "synchronized beat / dramatic energy of the movement / "
              "theatrical exchange",
    "punch": "controlled, pulled, safe stage movement / non-contact "
             "theatrical timing",
    "attack": "choreographed sequence / theatrical exchange",
    "impact": "synchronized beat / dramatic energy of the movement",
    "crash": "staged, choreographed collision effect / dramatic staged "
             "moment",
    "explosion": "stylized burst of light and smoke / cinematic effect",
    "blood": "remove injury cues; keep the staged scene clean",
    "injury": "frame as a safe, pulled, non-contact stage movement",
    "struggle": "controlled, deliberate, theatrical tension",
    # Extreme photorealism cues.
    "ultra-realistic": "cinematic film look / high-contrast cinematic style "
                       "/ stylized film lighting",
    "8k photorealistic": "cinematic film look / stylized film lighting",
    "photorealistic": "cinematic film look / stylized film lighting",
    "gritty realism": "cinematic film-noir look / high-contrast cinematic "
                      "style",
    "raw footage": "cinematic take / continuous cinematic shot",
    "documentary realism": "cinematic, stylized look",
    "found footage": "stylized short-film look / cinematic take",
    "cctv": "cinematic framing (not surveillance framing)",
    "surveillance": "cinematic framing (not surveillance framing)",
    # Real-people / likeness.
    "celebrity": "an original, fictional character",
    "celebrities": "original, fictional characters",
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


def _camera_move_groups(camera: str) -> set:
    """Return the set of canonical camera-move groups named in the clause."""
    lowered = camera.lower()
    found = set()
    for group, variants in CAMERA_MOVE_GROUPS.items():
        for v in variants:
            if re.search(r"\b" + re.escape(v) + r"\b", lowered):
                found.add(group)
                break
    return found


def _scan_moderation(fields: dict) -> List[str]:
    """Return a list of 'field: term -> safer alternative' strings for every
    high-risk trigger found across the supplied clause fields."""
    hits: List[str] = []
    for field, text in fields.items():
        if not text or not text.strip():
            continue
        lowered = text.lower()
        for trigger, safer in MODERATION_TRIGGERS.items():
            if " " in trigger:
                pattern = re.escape(trigger)
            else:
                pattern = r"\b" + re.escape(trigger)
            if re.search(pattern, lowered):
                hits.append(f"{field}: '{trigger}' -> {safer}")
    return hits


def _settings_block(*, duration: int, aspect_ratio: str) -> List[str]:
    note = "" if SWEET_SPOT[0] <= duration <= SWEET_SPOT[1] else \
        f" (note: {SWEET_SPOT[0]}-{SWEET_SPOT[1]}s is the stability sweet spot)"
    return [
        "",
        "[on-screen settings (pick these in the UI; NOT part of the "
        "prompt the model reads):",
        f"  duration_s={duration}{note}",
        f"  aspect_ratio={aspect_ratio}",
        "]",
    ]


def build_prompt(
    *,
    mode: str,
    camera: str,
    subject: str,
    action: str,
    environment: str = "",
    style: str = "",
    references: Optional[List[Any]] = None,
    dialogue: Optional[str] = None,
    sfx: Optional[str] = None,
    ambience: Optional[str] = None,
    music: Optional[str] = None,
    staging: bool = False,
    duration: int = 6,
    aspect_ratio: str = "16:9",
    override_camera: bool = False,
    override_safety: bool = False,
) -> str:
    if mode not in VALID_MODES:
        raise PromptValidationError(
            f"mode must be one of {sorted(VALID_MODES)}; got {mode!r}"
        )
    if not camera or not camera.strip():
        raise PromptValidationError(
            f"{mode} requires a camera clause (name one move: push-in, "
            "dolly, orbit, tracking, arc, pan, tilt, zoom, crane, static, "
            "handheld)."
        )
    if not subject or not subject.strip():
        raise PromptValidationError(f"{mode} requires a subject clause.")
    if not action or not action.strip():
        raise PromptValidationError(f"{mode} requires an action clause.")

    # --- camera: one named move per clip ---
    groups = _camera_move_groups(camera)
    if not override_camera:
        if not groups:
            raise PromptValidationError(
                "camera clause names no known cinematic move (push-in, "
                "dolly, orbit, tracking, arc, pan, tilt, zoom, crane, "
                "static / locked-off, handheld). Rephrase, or pass "
                "override_camera=True (CLI: --override-camera)."
            )
        if len(groups) > 1:
            raise PromptValidationError(
                "camera clause stacks multiple moves "
                f"({', '.join(sorted(groups))}); Grok wants ONE camera move "
                "per clip. Split into separate clips (use extend to chain), "
                "or pass override_camera=True (CLI: --override-camera)."
            )

    if aspect_ratio not in VALID_ASPECT_RATIOS:
        raise PromptValidationError(
            f"aspect_ratio must be one of {sorted(VALID_ASPECT_RATIOS)}; "
            f"got {aspect_ratio!r}"
        )
    if not (DURATION_MIN <= duration <= DURATION_MAX):
        raise PromptValidationError(
            f"duration must be {DURATION_MIN}..{DURATION_MAX} seconds "
            f"({SWEET_SPOT[0]}-{SWEET_SPOT[1]}s is the sweet spot); got "
            f"{duration}."
        )

    # --- negation guard ---
    if _all_negation(subject, action, camera, environment, style):
        raise PromptValidationError(
            "every clause leans on negation tokens. Rephrase to positive "
            "description; Grok is positive-direction and has no "
            "negative-prompt field."
        )

    # --- references per mode ---
    refs = _normalize_refs(references or [])
    if mode == "T2V":
        if refs:
            raise PromptValidationError(
                "T2V takes no reference assets; use I2V, extend, or "
                "reference."
            )
    elif mode == "I2V":
        imgs = [r for r in refs if r["kind"] == "image"]
        if len(refs) != 1 or len(imgs) != 1:
            raise PromptValidationError(
                "I2V requires exactly one reference image (the first "
                f"frame); got {len(refs)} reference(s). Describe ONLY what "
                "changes from that frame."
            )
    elif mode == "extend":
        if len(refs) != 1:
            raise PromptValidationError(
                "extend requires exactly one source clip to continue from; "
                f"got {len(refs)} reference(s)."
            )
    elif mode == "reference":
        if not (1 <= len(refs) <= REF_CAP):
            raise PromptValidationError(
                f"reference mode requires 1..{REF_CAP} style / character "
                f"images; got {len(refs)}."
            )

    # --- sound is REQUIRED ---
    dlg = _parse_dialogue(dialogue)
    have_sound = bool(dlg) or any(
        s and s.strip() for s in (sfx, ambience, music)
    )
    if not have_sound:
        raise PromptValidationError(
            "a Sound section is required. Grok generates native audio in "
            "the same pass — supply at least one of dialogue, sfx, "
            "ambience, or music. Be specific and spatial."
        )

    # --- moderation-safety scanner (signature) ---
    scan_fields = {
        "subject": subject,
        "action": action,
        "camera": camera,
        "environment": environment,
        "style": style,
        "sfx": sfx or "",
        "ambience": ambience or "",
        "music": music or "",
        "dialogue": dlg["line"] if dlg else "",
    }
    hits = _scan_moderation(scan_fields)
    if hits and not override_safety:
        listed = "\n  - ".join(hits)
        raise PromptValidationError(
            "moderation-safety scanner flagged high-risk language. Grok's "
            "video filter predicts motion and scores realism + harm; these "
            "terms raise the flag risk. Rephrase each, then retry:\n  - "
            + listed
            + "\n(Pass override_safety=True / --override-safety to proceed "
            "anyway; you accept a higher flag risk.)"
        )

    # --- assemble: camera -> subject+action -> environment -> style ->
    #     Sound (last) ---
    parts: List[str] = []

    if mode == "I2V":
        parts.append(
            "Begin from the attached image and preserve subject placement, "
            "face, clothing, and overall composition. Describe only what "
            "changes."
        )
    elif mode == "extend":
        parts.append(
            "Continue from the last frame of the attached clip, holding "
            "motion, lighting, and character position."
        )
    elif mode == "reference":
        bound = []
        for i, r in enumerate(refs, start=1):
            bound.append(f"Reference {i}: {r['role']}")
        parts.append(
            "Use the reference images for style and character consistency: "
            + "; ".join(bound) + "."
        )

    parts.append(f"{camera.strip()}.")
    parts.append(f"{subject.strip()} {action.strip()}".strip())
    if staging:
        parts.append(
            "Every movement is deliberate, theatrical, and safe stagecraft."
        )
    if environment and environment.strip():
        parts.append(environment.strip())
    if style and style.strip():
        parts.append(style.strip())

    sound_bits: List[str] = []
    if dlg:
        sound_bits.append(f'dialogue: "{dlg["line"]}"')
    if sfx and sfx.strip():
        sound_bits.append(sfx.strip())
    if ambience and ambience.strip():
        sound_bits.append(ambience.strip())
    if music and music.strip():
        sound_bits.append("music: " + music.strip())
    parts.append("Sound: " + "; ".join(sound_bits) + ".")

    body = "\n".join(parts)
    if len(body) > CHAR_LIMIT:
        raise PromptValidationError(
            f"assembled prompt is {len(body)} characters; over the "
            f"{CHAR_LIMIT}-character keep-it-tight limit. Overly long "
            "prompts raise Grok's flag risk — trim it."
        )

    out = parts + _settings_block(duration=duration, aspect_ratio=aspect_ratio)
    return "\n".join(out)


def _parse_dialogue(raw: Optional[str]) -> Optional[dict]:
    """Dialogue arg is the spoken line; kept short and quoted for lip-sync."""
    if not raw or not raw.strip():
        return None
    return {"line": raw.strip().strip('"')}


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
        description="Assemble a Grok Imagine 1.5 video prompt with "
                    "validation (moderation-aware)."
    )
    p.add_argument("--mode", required=True, choices=sorted(VALID_MODES))
    p.add_argument("--camera", required=True,
                   help="Camera clause; front-loaded. Name ONE move: "
                        "push-in/dolly/orbit/tracking/arc/pan/tilt/zoom/"
                        "crane/static/handheld.")
    p.add_argument("--subject", required=True)
    p.add_argument("--action", required=True,
                   help="Subject action with intensity and timing "
                        "(e.g. 'slowly rises and turns').")
    p.add_argument("--environment", default="")
    p.add_argument("--style", default="",
                   help="Lighting + style; prefer cinematic / film-look / "
                        "stylized over pure photorealism.")
    p.add_argument(
        "--reference", action="append", default=None,
        help='Reference asset; plain string (image) or JSON '
             '{"kind":"image|video","role":"..."}. I2V=1 image; '
             "extend=1 clip; reference=1..7 images.",
    )
    p.add_argument("--dialogue", default=None,
                   help="Spoken line, kept short (quoted for lip-sync).")
    p.add_argument("--sfx", default=None, help="Foley / spot effects.")
    p.add_argument("--ambience", default=None, help="Background soundscape.")
    p.add_argument("--music", default=None)
    p.add_argument("--staging", action="store_true",
                   help="Add a staged / theatrical / safe framing clause "
                        "(recommended for any physical-interaction scene).")
    p.add_argument("--duration", type=int, default=6,
                   help="Clip length 1..15 s; 5-8 s is the sweet spot.")
    p.add_argument("--aspect-ratio", default="16:9",
                   choices=sorted(VALID_ASPECT_RATIOS))
    p.add_argument("--override-camera", action="store_true",
                   help="Allow a camera clause that names no known move, or "
                        "that stacks more than one move.")
    p.add_argument("--override-safety", action="store_true",
                   help="Bypass the moderation-safety scanner. You accept a "
                        "higher flag risk.")
    return p.parse_args(argv)


def main(argv: List[str]) -> int:
    args = _parse_args(argv)
    try:
        refs = _parse_refs_arg(args.reference)
        prompt = build_prompt(
            mode=args.mode,
            camera=args.camera,
            subject=args.subject,
            action=args.action,
            environment=args.environment,
            style=args.style,
            references=refs,
            dialogue=args.dialogue,
            sfx=args.sfx,
            ambience=args.ambience,
            music=args.music,
            staging=args.staging,
            duration=args.duration,
            aspect_ratio=args.aspect_ratio,
            override_camera=args.override_camera,
            override_safety=args.override_safety,
        )
    except PromptValidationError as exc:
        print(f"PromptValidationError: {exc}", file=sys.stderr)
        return 2
    print(prompt)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
