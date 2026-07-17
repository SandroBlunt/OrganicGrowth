#!/usr/bin/env python3
"""Tests for kling-3-0 build-prompt.py — TDD-first.

Reflects 0.2.0 capability: Multi-Shot is core, native audio, element
binding 1–3 images per element, separate negative prompt, motion
intensity, additional aspect ratios.
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
        subject="A dancer.",
        action="Stands.",
        setting="Empty stage.",
        style="Painterly cinematic.",
        camera="Wide medium, 50 mm.",
        motion="Dancer raises both arms overhead.",
        elements=None,
        first_frame=None,
        last_frame=None,
        i2v_reference=None,
        aspect_ratio="16:9",
        multi_shot_mode="single",
        shots=None,
        total_duration_s=None,
        audio=None,
        motion_intensity=None,
        negative_prompt=None,
    )
    args.update(overrides)
    return args


class TestT2V(unittest.TestCase):
    def test_t2v_assembles(self):
        out = bp.build_prompt(**base())
        self.assertIn("Motion:", out)

    def test_t2v_missing_motion_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(motion=""))

    def test_t2v_multi_beat_motion_no_longer_rejected(self):
        # Legacy "one beat per prompt" guard removed in 0.2.0.
        out = bp.build_prompt(**base(
            motion="She sits, then stands, then walks away."
        ))
        self.assertIn("Motion:", out)


class TestI2V(unittest.TestCase):
    def test_i2v_with_one_ref_passes(self):
        out = bp.build_prompt(**base(
            mode="I2V",
            i2v_reference="start frame: dancer at rest",
        ))
        self.assertIn("Reference (start frame)", out)

    def test_i2v_without_ref_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(mode="I2V", i2v_reference=None))

    def test_i2v_with_element_binding(self):
        out = bp.build_prompt(**base(
            mode="I2V",
            i2v_reference="start frame: dancer at rest",
            elements=[
                {"name": "dancer", "images": ["front"]},
                {"name": "the dress", "images": ["front", "back"]},
            ],
        ))
        self.assertIn("Bound elements", out)


class TestMR(unittest.TestCase):
    def test_mr_two_elements_with_one_to_three_images(self):
        out = bp.build_prompt(**base(
            mode="MR",
            elements=[
                {"name": "subject's face", "images": ["a1"]},
                {"name": "the satchel", "images": ["b1", "b2", "b3"]},
            ],
        ))
        self.assertIn("Elements:", out)
        self.assertIn("subject's face", out)

    def test_mr_element_with_zero_images_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                mode="MR",
                elements=[
                    {"name": "x", "images": []},
                    {"name": "y", "images": ["b1"]},
                ],
            ))

    def test_mr_element_with_four_images_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                mode="MR",
                elements=[
                    {"name": "x", "images": ["a", "b", "c", "d"]},
                    {"name": "y", "images": ["b1"]},
                ],
            ))

    def test_mr_with_one_element_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                mode="MR",
                elements=[{"name": "x", "images": ["a", "b"]}],
            ))

    def test_mr_with_five_elements_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                mode="MR",
                elements=[
                    {"name": f"e{i}", "images": ["x", "y"]}
                    for i in range(5)
                ],
            ))


class TestFL(unittest.TestCase):
    def test_fl_with_two_frames(self):
        out = bp.build_prompt(**base(
            mode="F/L",
            first_frame="dancer arms at sides",
            last_frame="dancer arms overhead",
        ))
        self.assertIn("First frame:", out)

    def test_fl_missing_last_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                mode="F/L",
                first_frame="ff",
                last_frame=None,
            ))


class TestMultiShot(unittest.TestCase):
    def test_auto_multi_shot_passes(self):
        out = bp.build_prompt(**base(
            multi_shot_mode="auto",
            shots=[
                {"text": "Shot 1: wide establishing"},
                {"text": "Shot 2: medium reaction"},
            ],
            total_duration_s=8,
        ))
        self.assertIn("Multi-Shot: auto", out)

    def test_custom_multi_shot_passes_when_durations_sum(self):
        out = bp.build_prompt(**base(
            multi_shot_mode="custom",
            shots=[
                {"duration_s": 3, "text": "wide"},
                {"duration_s": 5, "text": "medium"},
            ],
            total_duration_s=8,
        ))
        self.assertIn("Multi-Shot: custom", out)

    def test_custom_multi_shot_durations_must_sum(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                multi_shot_mode="custom",
                shots=[
                    {"duration_s": 3, "text": "wide"},
                    {"duration_s": 5, "text": "medium"},
                ],
                total_duration_s=10,  # mismatched
            ))

    def test_more_than_six_shots_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                multi_shot_mode="custom",
                shots=[
                    {"duration_s": 1, "text": f"s{i}"} for i in range(7)
                ],
                total_duration_s=7,
            ))


class TestAudio(unittest.TestCase):
    def test_audio_clause_appears_when_supplied(self):
        out = bp.build_prompt(**base(
            audio='[Detective, sharp]: "Where is the truth?"',
        ))
        self.assertIn("Audio:", out)
        self.assertIn("Detective", out)


class TestMotionIntensity(unittest.TestCase):
    def test_in_range_passes(self):
        out = bp.build_prompt(**base(motion_intensity=0.5))
        self.assertIn("Motion intensity: 0.5", out)

    def test_out_of_range_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(motion_intensity=1.5))


class TestNegativePrompt(unittest.TestCase):
    def test_negative_prompt_appears_as_separate_block(self):
        out = bp.build_prompt(**base(
            negative_prompt="motion blur, face distortion",
        ))
        self.assertIn("[negative_prompt", out)
        self.assertIn("motion blur, face distortion", out)


class TestAspect(unittest.TestCase):
    def test_invalid_aspect_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(aspect_ratio="3:2"))

    def test_one_to_one_passes(self):
        out = bp.build_prompt(**base(aspect_ratio="1:1"))
        self.assertIn("[aspect_ratio=1:1]", out)

    def test_four_by_five_passes(self):
        out = bp.build_prompt(**base(aspect_ratio="4:5"))
        self.assertIn("[aspect_ratio=4:5]", out)


class TestDuration(unittest.TestCase):
    def test_in_range_passes(self):
        out = bp.build_prompt(**base(total_duration_s=10))
        self.assertIn("[duration_s=10]", out)

    def test_out_of_range_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(total_duration_s=20))


if __name__ == "__main__":
    unittest.main(verbosity=2)
