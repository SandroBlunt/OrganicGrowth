#!/usr/bin/env python3
"""Tests for grok-imagine-1-5 build-prompt.py — TDD-first.

Covers: camera-front-loaded ordering, subject+action, Sound placed last,
Sound-required refusal, I2V one-first-frame rule, reference 1..7 cap,
extend one-clip rule, single-camera-move validation + stacking rejection +
override, the moderation-safety scanner (violence word refused; safe
rephrase passes; --override-safety bypasses), negation guard, duration
range (1..15).

Run: python3 scripts/test_build_prompt.py
"""

from __future__ import annotations

import importlib.util
import pathlib
import unittest


HERE = pathlib.Path(__file__).resolve().parent
SCRIPT = HERE / "build-prompt.py"


def load_module():
    spec = importlib.util.spec_from_file_location("build_prompt", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load module from {SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


bp = load_module()


def base(**overrides):
    args = dict(
        mode="T2V",
        camera="Slow push-in toward the performers.",
        subject="Two performers move through a precise athletic stage "
                "routine in a rain-soaked alley at night.",
        action="Their footwork splashes through puddles with crisp, "
               "synchronized timing.",
        environment="Neon reflections shift on the wet brick.",
        style="High-contrast film-noir look, stylized film lighting.",
        references=None,
        dialogue=None,
        sfx="boots splashing through puddles, heavy rain on concrete",
        ambience=None,
        music=None,
        duration=6,
        aspect_ratio="16:9",
    )
    args.update(overrides)
    return args


class TestOrdering(unittest.TestCase):
    def test_camera_leads_then_subject_then_sound(self):
        out = bp.build_prompt(**base())
        self.assertIn("push-in", out)
        self.assertIn("Sound:", out)
        self.assertIn("[on-screen settings", out)
        self.assertLess(out.index("push-in"), out.index("performers move"))
        self.assertLess(out.index("performers move"), out.index("Sound:"))
        self.assertLess(out.index("Sound:"), out.index("on-screen settings"))

    def test_requires_camera_subject_action(self):
        for field in ("camera", "subject", "action"):
            with self.assertRaises(bp.PromptValidationError):
                bp.build_prompt(**base(**{field: ""}))

    def test_t2v_rejects_references(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(references=["something"]))


class TestSoundRequired(unittest.TestCase):
    def test_no_sound_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(sfx=None, ambience=None, music=None,
                                   dialogue=None))

    def test_ambience_only_passes(self):
        out = bp.build_prompt(**base(sfx=None, ambience="distant traffic "
                                     "muffled by rain"))
        self.assertIn("Sound:", out)

    def test_audio_is_last_content_line(self):
        out = bp.build_prompt(**base(ambience="distant thunder"))
        # Sound comes after environment and style, before settings.
        self.assertLess(out.index("film-noir"), out.index("Sound:"))
        self.assertLess(out.index("Sound:"), out.index("on-screen settings"))

    def test_dialogue_quoted_in_sound(self):
        out = bp.build_prompt(**base(dialogue='You made it.'))
        self.assertIn('dialogue: "You made it."', out)


class TestI2V(unittest.TestCase):
    def test_i2v_one_image_passes(self):
        out = bp.build_prompt(**base(
            mode="I2V",
            references=[{"kind": "image", "role": "the two performers"}],
        ))
        self.assertIn("Begin from the attached image", out)
        self.assertIn("only what changes", out)

    def test_i2v_zero_refs_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(mode="I2V", references=None))

    def test_i2v_two_refs_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(mode="I2V", references=["a", "b"]))


class TestExtend(unittest.TestCase):
    def test_extend_one_clip_passes(self):
        out = bp.build_prompt(**base(
            mode="extend",
            references=[{"kind": "video", "role": "source clip"}],
        ))
        self.assertIn("Continue from the last frame", out)

    def test_extend_zero_refs_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(mode="extend", references=None))


class TestReferenceMode(unittest.TestCase):
    def test_reference_seven_passes(self):
        refs = [{"kind": "image", "role": f"style {i}"} for i in range(7)]
        out = bp.build_prompt(**base(mode="reference", references=refs))
        self.assertIn("Reference 7:", out)

    def test_reference_eight_raises(self):
        refs = [{"kind": "image", "role": f"style {i}"} for i in range(8)]
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(mode="reference", references=refs))

    def test_reference_zero_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(mode="reference", references=None))


class TestCameraValidation(unittest.TestCase):
    def test_off_list_camera_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                camera="Camera floats dreamily through the scene.",
            ))

    def test_each_named_move_passes(self):
        for move in ("push-in", "dolly", "orbit", "tracking", "arc",
                     "pan", "tilt", "zoom", "crane", "handheld"):
            with self.subTest(move=move):
                out = bp.build_prompt(**base(
                    camera=f"Gentle {move} across the alley.",
                ))
                self.assertIn(f"{move}", out)

    def test_static_locked_off_not_stacking(self):
        # synonyms collapse to one group; must NOT read as two moves
        out = bp.build_prompt(**base(camera="Locked-off / static frame."))
        self.assertIn("Locked-off / static frame.", out)

    def test_stacked_camera_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                camera="Slow push-in, then a smooth orbit around the lead.",
            ))

    def test_stacked_camera_override_passes(self):
        out = bp.build_prompt(**base(
            camera="Slow push-in, then a smooth orbit around the lead.",
            override_camera=True,
        ))
        self.assertIn("push-in", out)

    def test_off_list_override_passes(self):
        out = bp.build_prompt(**base(
            camera="Camera floats dreamily through the scene.",
            override_camera=True,
        ))
        self.assertIn("floats dreamily", out)


class TestModerationScanner(unittest.TestCase):
    def test_violence_word_refused(self):
        with self.assertRaises(bp.PromptValidationError) as ctx:
            bp.build_prompt(**base(
                action="One performer throws a punch at the other.",
            ))
        self.assertIn("punch", str(ctx.exception))

    def test_photorealism_cue_refused(self):
        with self.assertRaises(bp.PromptValidationError) as ctx:
            bp.build_prompt(**base(
                style="ultra-realistic 8K photorealistic raw footage",
            ))
        self.assertIn("ultra-realistic", str(ctx.exception))

    def test_safe_rephrase_passes(self):
        out = bp.build_prompt(**base(
            action="One performer guides the other through a controlled, "
                   "pulled stage movement with synchronized timing.",
        ))
        self.assertIn("Sound:", out)

    def test_override_safety_bypasses(self):
        out = bp.build_prompt(**base(
            action="One performer throws a punch at the other.",
            override_safety=True,
        ))
        self.assertIn("throws a punch", out)

    def test_scanner_reads_sound_fields(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(sfx="the crack of a real punch landing"))


class TestNegationGuard(unittest.TestCase):
    def test_negation_only_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                subject="No people.",
                action="Not moving.",
                camera="Not close, without a move.",
                environment="No signage.",
                style="No grain, never lit.",
            ))


class TestDuration(unittest.TestCase):
    def test_min_passes(self):
        out = bp.build_prompt(**base(duration=1))
        self.assertIn("duration_s=1", out)

    def test_max_passes(self):
        out = bp.build_prompt(**base(duration=15))
        self.assertIn("duration_s=15", out)

    def test_zero_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(duration=0))

    def test_sixteen_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(duration=16))

    def test_sweet_spot_note_outside_range(self):
        out = bp.build_prompt(**base(duration=12))
        self.assertIn("sweet spot", out)


class TestAspectRatio(unittest.TestCase):
    def test_unsupported_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(aspect_ratio="21:9"))

    def test_9_16_passes(self):
        out = bp.build_prompt(**base(aspect_ratio="9:16"))
        self.assertIn("aspect_ratio=9:16", out)


class TestStaging(unittest.TestCase):
    def test_staging_clause_added(self):
        out = bp.build_prompt(**base(staging=True))
        self.assertIn("safe stagecraft", out)


if __name__ == "__main__":
    unittest.main(verbosity=2)
