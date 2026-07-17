#!/usr/bin/env python3
"""Tests for happy-horse build-prompt.py — TDD-first.

Covers: subject+action lead, camera/style/environment ordering, audio
placed last, dialogue language requirement, @Image1/@Video1 token
binding, I2V one-first-frame rule, R2V/edit 5-reference cap, duration and
resolution ranges, sequence beats (First/then/finally), negation guard,
named-camera-move validation (soft; override_camera bypasses).

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
        subject="A lone swordswoman steps into a courtyard.",
        action="She snaps into a guard stance.",
        camera="Camera tracks behind her, then orbits 90 degrees left.",
        style="Ultra-realistic, warm lantern light, cinematic.",
        environment="Night, heavy rain, paper lanterns swaying.",
        references=None,
        dialogue=None,
        sfx=None,
        ambience=None,
        music=None,
        sequence=None,
        duration=5,
        resolution="1080p",
        aspect_ratio="16:9",
    )
    args.update(overrides)
    return args


class TestT2V(unittest.TestCase):
    def test_assembles_in_order(self):
        out = bp.build_prompt(**base())
        self.assertIn("swordswoman", out)
        self.assertIn("Camera:", out)
        self.assertIn("Style:", out)
        self.assertIn("Environment:", out)
        self.assertIn("[on-screen settings", out)
        # subject/action precedes camera precedes settings
        self.assertLess(out.index("swordswoman"), out.index("Camera:"))
        self.assertLess(out.index("Camera:"), out.index("on-screen settings"))

    def test_requires_subject_action_camera(self):
        for field in ("subject", "action", "camera"):
            with self.assertRaises(bp.PromptValidationError):
                bp.build_prompt(**base(**{field: ""}))

    def test_t2v_rejects_references(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(references=["something"]))


class TestAudioLast(unittest.TestCase):
    def test_audio_block_after_visuals(self):
        out = bp.build_prompt(**base(
            sfx="rain hammering on tile",
            ambience="distant thunder",
        ))
        self.assertIn("Audio:", out)
        self.assertLess(out.index("Environment:"), out.index("Audio:"))
        self.assertLess(out.index("Audio:"), out.index("on-screen settings"))


class TestDialogue(unittest.TestCase):
    def test_dialogue_with_language_passes(self):
        out = bp.build_prompt(**base(
            dialogue='Japanese|the old man says, "おかえり。"',
        ))
        self.assertIn("Dialogue (Japanese):", out)

    def test_dialogue_without_language_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(dialogue='she says, "hi"'))


class TestI2V(unittest.TestCase):
    def test_i2v_with_one_image_passes(self):
        out = bp.build_prompt(**base(
            mode="I2V",
            references=[{"kind": "image", "role": "woman on a beach"}],
        ))
        self.assertIn("@Image1 as the first frame", out)

    def test_i2v_without_ref_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(mode="I2V", references=None))

    def test_i2v_with_two_refs_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(mode="I2V", references=["a", "b"]))


class TestR2V(unittest.TestCase):
    def test_r2v_binds_image_and_video_tokens(self):
        out = bp.build_prompt(**base(
            mode="R2V",
            references=[
                {"kind": "image", "role": "the mercenary"},
                {"kind": "image", "role": "neon palette"},
                {"kind": "video", "role": "camera reference"},
            ],
        ))
        self.assertIn("@Image1: the mercenary", out)
        self.assertIn("@Image2: neon palette", out)
        self.assertIn("@Video1: camera reference", out)

    def test_r2v_five_refs_passes(self):
        refs = [{"kind": "image", "role": f"r{i}"} for i in range(5)]
        out = bp.build_prompt(**base(mode="R2V", references=refs))
        self.assertIn("@Image5", out)

    def test_r2v_six_refs_raises(self):
        refs = [{"kind": "image", "role": f"r{i}"} for i in range(6)]
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(mode="R2V", references=refs))

    def test_r2v_zero_refs_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(mode="R2V", references=None))


class TestEdit(unittest.TestCase):
    def test_edit_assembles(self):
        out = bp.build_prompt(**base(
            mode="edit",
            subject="The car drives down the road.",
            action="It rounds a bend.",
            references=[
                {"kind": "video", "role": "source clip"},
                {"kind": "image", "role": "cream convertible"},
            ],
        ))
        self.assertIn("Edit;", out)
        self.assertIn("@Video1: source clip", out)


class TestDuration(unittest.TestCase):
    def test_in_range_passes(self):
        out = bp.build_prompt(**base(duration=15))
        self.assertIn("duration_s=15", out)

    def test_too_short_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(duration=3))

    def test_too_long_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(duration=16))


class TestSettings(unittest.TestCase):
    def test_480p_passes(self):
        out = bp.build_prompt(**base(resolution="480p"))
        self.assertIn("resolution=480p", out)

    def test_unsupported_resolution_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(resolution="4K"))

    def test_unsupported_aspect_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(aspect_ratio="21:9"))


class TestSequence(unittest.TestCase):
    def test_three_beats_first_then_finally(self):
        out = bp.build_prompt(**base(
            sequence=["she draws the blade",
                      "she lunges forward",
                      "she holds the final pose"],
        ))
        self.assertIn("First, she draws the blade.", out)
        self.assertIn("Then, she lunges forward.", out)
        self.assertIn("Finally, she holds the final pose.", out)


class TestCameraValidation(unittest.TestCase):
    def test_off_list_camera_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                camera="Camera floats dreamily through the scene.",
            ))

    def test_each_named_move_passes(self):
        for move in ("pan", "tilt", "dolly", "zoom", "orbit", "crane"):
            with self.subTest(move=move):
                out = bp.build_prompt(**base(
                    camera=f"Slow {move} across the courtyard.",
                ))
                self.assertIn("Camera:", out)

    def test_static_passes(self):
        out = bp.build_prompt(**base(camera="Static camera, locked off."))
        self.assertIn("Camera: Static camera, locked off.", out)

    def test_override_allows_off_list_camera(self):
        out = bp.build_prompt(**base(
            camera="Fully reference @Video1 for all camera movements.",
            override_camera=True,
        ))
        self.assertIn("Camera: Fully reference @Video1", out)


class TestNegationGuard(unittest.TestCase):
    def test_negation_only_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                subject="No people.",
                action="Not moving.",
                camera="Not close, without flare.",
                style="No grain.",
                environment="No signage, never lit.",
            ))


if __name__ == "__main__":
    unittest.main(verbosity=2)
