#!/usr/bin/env python3
"""Tests for kling-3-0-omni build-prompt.py — TDD-first."""

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
        subject="A subject.",
        action="Stands.",
        setting="A place.",
        style="Cinematic.",
        camera="Medium, 50 mm.",
        motion="Subject turns head.",
        references=None,
        i2v_reference=None,
        v2v_reference=None,
        v2v_role=None,
        first_frame=None,
        last_frame=None,
        aspect_ratio="16:9",
        override_mix_budget=False,
    )
    args.update(overrides)
    return args


class TestT2V(unittest.TestCase):
    def test_t2v_assembles(self):
        out = bp.build_prompt(**base())
        self.assertIn("Motion:", out)


class TestV2V(unittest.TestCase):
    def test_v2v_with_role_passes(self):
        out = bp.build_prompt(**base(
            mode="V2V",
            v2v_reference="A short clip of a dancer spinning.",
            v2v_role="motion source",
        ))
        self.assertIn("Reference clip", out)
        self.assertIn("motion source", out)

    def test_v2v_without_ref_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(mode="V2V", v2v_reference=None,
                                   v2v_role="motion source"))

    def test_v2v_without_role_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(mode="V2V", v2v_reference="x",
                                   v2v_role=None))


class TestMR(unittest.TestCase):
    def test_mr_seven_images(self):
        refs = [{"type": "image", "role": f"r{i}"} for i in range(7)]
        out = bp.build_prompt(**base(mode="MR", references=refs))
        self.assertIn("References (mixed", out)

    def test_mr_eight_inputs_raises(self):
        refs = [{"type": "image", "role": f"r{i}"} for i in range(8)]
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(mode="MR", references=refs))

    def test_mr_three_video_raises_heuristic(self):
        refs = [{"type": "video", "role": f"v{i}"} for i in range(3)]
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(mode="MR", references=refs))

    def test_mr_video_present_with_two_images_raises_image_floor(self):
        refs = [
            {"type": "video", "role": "v1"},
            {"type": "image", "role": "i1"},
            {"type": "image", "role": "i2"},
        ]
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(mode="MR", references=refs))

    def test_mr_video_present_with_three_images_passes(self):
        refs = [
            {"type": "video", "role": "v1"},
            {"type": "image", "role": "i1"},
            {"type": "image", "role": "i2"},
            {"type": "image", "role": "i3"},
        ]
        out = bp.build_prompt(**base(mode="MR", references=refs))
        self.assertIn("References", out)

    def test_mr_two_audio_raises(self):
        refs = [
            {"type": "audio", "role": "a1"},
            {"type": "audio", "role": "a2"},
        ]
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(mode="MR", references=refs))

    def test_mr_heuristic_violation_with_override_passes(self):
        refs = [{"type": "video", "role": f"v{i}"} for i in range(3)]
        out = bp.build_prompt(**base(
            mode="MR", references=refs, override_mix_budget=True,
        ))
        self.assertIn("References", out)


class TestI2V(unittest.TestCase):
    def test_i2v_with_one_ref_passes(self):
        out = bp.build_prompt(**base(
            mode="I2V", i2v_reference="frame 1: subject portrait"))
        self.assertIn("Reference (frame 1)", out)


class TestFL(unittest.TestCase):
    def test_fl_with_two_frames(self):
        out = bp.build_prompt(**base(
            mode="F/L",
            first_frame="ff", last_frame="lf",
        ))
        self.assertIn("First frame:", out)


if __name__ == "__main__":
    unittest.main(verbosity=2)
