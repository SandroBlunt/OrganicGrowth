#!/usr/bin/env python3
"""Tests for veo-3-1 build-prompt.py — TDD-first.

Reflects 0.1.1 refresh: timestamp prompting, Ingredients alias,
AddRemove (Veo 2, no audio), explicit dialogue/SFX in audio block,
noun-phrase negative prompt, F/L hand-off from Nano Banana 2.
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
        subject="A barista pulls an espresso shot.",
        action="Hands rest on the portafilter.",
        setting="A small Melbourne specialty cafe at 7:30 am.",
        style="Cinematic photograph, neutral grade.",
        camera="Medium close-up at 50 mm.",
        motion="Barista lifts portafilter, locks it, presses brew.",
        references=None,
        first_frame=None,
        last_frame=None,
        audio=None,
        aspect_ratio="16:9",
        duration_s=None,
        timestamp_segments=None,
        negative_prompt=None,
    )
    args.update(overrides)
    return args


class TestT2V(unittest.TestCase):
    def test_t2v_assembles_six_clauses(self):
        out = bp.build_prompt(**base(
            audio='A woman says, "We have to leave now."',
        ))
        self.assertIn("barista", out.lower())
        self.assertIn("Motion:", out)
        self.assertIn("Audio", out)

    def test_t2v_missing_motion_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(motion=""))


class TestI2V(unittest.TestCase):
    def test_i2v_with_one_ref_passes(self):
        out = bp.build_prompt(**base(
            mode="I2V",
            references=["frame 1: portrait of subject"],
            aspect_ratio="9:16",
            motion="Subject inhales and looks up.",
        ))
        self.assertIn("frame 1", out)


class TestIngredients(unittest.TestCase):
    def test_ingredients_alias_for_mr(self):
        out = bp.build_prompt(**base(
            mode="Ingredients",
            references=["face", "outfit"],
        ))
        self.assertIn("Ingredients to Video", out)

    def test_legacy_mr_alias_still_accepted(self):
        out = bp.build_prompt(**base(
            mode="MR",
            references=["face", "outfit"],
        ))
        self.assertIn("References", out)

    def test_ingredients_with_four_refs_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                mode="Ingredients",
                references=["a", "b", "c", "d"],
            ))

    def test_ingredients_with_first_frame_raises_exclusivity(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                mode="Ingredients",
                references=["a"],
                first_frame="ff",
            ))


class TestFL(unittest.TestCase):
    def test_fl_with_two_frames_passes(self):
        out = bp.build_prompt(**base(
            mode="F/L",
            first_frame="dancer arms at sides",
            last_frame="dancer arms overhead",
            motion="Subject raises arms from sides to overhead.",
        ))
        self.assertIn("First frame:", out)
        self.assertIn("Last frame:", out)

    def test_fl_without_last_frame_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                mode="F/L",
                first_frame="ff",
                last_frame=None,
            ))

    def test_fl_with_ingredients_refs_raises_exclusivity(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                mode="F/L",
                references=["a"],
                first_frame="ff",
                last_frame="lf",
            ))


class TestAddRemove(unittest.TestCase):
    def test_addremove_passes_without_audio(self):
        out = bp.build_prompt(**base(
            mode="AddRemove",
            motion="Add a coffee cup to the right side of the desk.",
        ))
        self.assertIn("AddRemove mode", out)
        self.assertIn("Veo 2 model", out)

    def test_addremove_with_audio_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                mode="AddRemove",
                audio='A woman says, "Hi."',
            ))


class TestTimestampSegments(unittest.TestCase):
    def test_segments_summing_to_duration_passes(self):
        out = bp.build_prompt(**base(
            duration_s=8,
            timestamp_segments=[
                {"bracket": "[00:00-00:02]", "text": "Medium shot"},
                {"bracket": "[00:02-00:04]", "text": "Reverse shot"},
                {"bracket": "[00:04-00:06]", "text": "Tracking shot"},
                {"bracket": "[00:06-00:08]", "text": "Wide crane"},
            ],
        ))
        self.assertIn("Timestamp segments:", out)
        self.assertIn("[00:00-00:02]", out)

    def test_segments_not_summing_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                duration_s=8,
                timestamp_segments=[
                    {"bracket": "[00:00-00:02]", "text": "x"},
                    {"bracket": "[00:02-00:05]", "text": "y"},
                ],
            ))

    def test_segments_with_seconds_fields_pass(self):
        out = bp.build_prompt(**base(
            duration_s=4,
            timestamp_segments=[
                {"start_s": 0, "end_s": 2, "text": "wide"},
                {"start_s": 2, "end_s": 4, "text": "close-up"},
            ],
        ))
        self.assertIn("Timestamp segments:", out)


class TestDuration(unittest.TestCase):
    def test_valid_duration_passes(self):
        out = bp.build_prompt(**base(duration_s=8))
        self.assertIn("[duration_s=8]", out)

    def test_invalid_duration_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(duration_s=5))


class TestNegativePrompt(unittest.TestCase):
    def test_noun_phrases_pass(self):
        out = bp.build_prompt(**base(
            negative_prompt="blurriness, distortion, extra limbs",
        ))
        self.assertIn("[negative_prompt", out)

    def test_negation_syntax_in_negative_prompt_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                negative_prompt="no people, don't show buildings",
            ))


class TestAspectRatio(unittest.TestCase):
    def test_invalid_aspect_ratio_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(aspect_ratio="3:2"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
