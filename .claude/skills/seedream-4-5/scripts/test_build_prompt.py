#!/usr/bin/env python3
"""Tests for seedream-4-5 build-prompt.py — TDD-first.

Covers: subject-first stills, in-image text quoting, Edit single-ref,
MR ordinal labelling + 10-ref cap, sequential-set count + global style
lock, word-budget hard ceiling, negation guard, aspect/resolution
validation.

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
        mode="T2I",
        subject="A weathered fisherman mends a net.",
        action="His hands work the cord, gaze down and focused.",
        setting="A wooden harbour jetty at golden hour.",
        style="Naturalistic 35mm film look, neutral-warm grade.",
        camera="85mm portrait, low golden-hour sun from camera-right.",
        references=None,
        frames=None,
        set_count=None,
        in_image_text=None,
        aspect_ratio="3:2",
        resolution="2K",
    )
    args.update(overrides)
    return args


class TestT2I(unittest.TestCase):
    def test_t2i_assembles(self):
        out = bp.build_prompt(**base())
        self.assertIn("fisherman", out)
        self.assertIn("[on-screen settings", out)
        self.assertIn("aspect_ratio=3:2", out)
        self.assertIn("resolution=2K", out)

    def test_t2i_requires_subject(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(subject="  "))

    def test_t2i_requires_style(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(style=""))


class TestInImageText(unittest.TestCase):
    def test_quoted_text_passes_and_appears(self):
        out = bp.build_prompt(**base(
            in_image_text='the title "VISIT KYOTO" in bold serif',
        ))
        self.assertIn("VISIT KYOTO", out)
        self.assertIn("In-image text:", out)

    def test_unquoted_text_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(in_image_text="the title VISIT KYOTO"))


class TestEdit(unittest.TestCase):
    def test_edit_with_one_ref_passes(self):
        out = bp.build_prompt(**base(
            mode="Edit",
            subject="Change the season to winter, bare trees, light snow.",
            action="",
            setting="",
            style="Keep the original 35mm film look and warm grade.",
            camera="",
            references=["a lakeside cabin in autumn, warm window glow"],
        ))
        self.assertIn("Reference:", out)

    def test_edit_without_ref_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(mode="Edit", references=None))

    def test_edit_with_two_refs_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(mode="Edit", references=["a", "b"]))


class TestMR(unittest.TestCase):
    def test_mr_labels_images_by_ordinal(self):
        out = bp.build_prompt(**base(
            mode="MR",
            references=["red-haired woman headshot", "neon Tokyo alley"],
        ))
        self.assertIn("Image 1: red-haired woman headshot", out)
        self.assertIn("Image 2: neon Tokyo alley", out)

    def test_mr_ten_refs_passes(self):
        refs = [f"ref {i}" for i in range(10)]
        out = bp.build_prompt(**base(mode="MR", references=refs))
        self.assertIn("Image 10:", out)

    def test_mr_eleven_refs_raises(self):
        refs = [f"ref {i}" for i in range(11)]
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(mode="MR", references=refs))

    def test_mr_dict_ref_requires_role(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(mode="MR", references=[{"role": ""}]))


class TestSequentialSet(unittest.TestCase):
    def test_set_assembles_with_count_and_states(self):
        out = bp.build_prompt(**base(
            mode="sequential-set",
            subject="the same chubby orange cat mascot",
            action="",
            setting="",
            style="flat vector sticker, bold outline, white background",
            camera="",
            set_count=3,
            frames=["Image 1: happy, waving.",
                    "Image 2: sleeping.",
                    "Image 3: surprised."],
        ))
        self.assertIn("Generate a set of 3 images", out)
        self.assertIn("same across the whole set", out)
        self.assertIn("image_count=3", out)

    def test_set_without_count_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                mode="sequential-set",
                subject="a cat mascot",
                style="flat vector sticker",
                set_count=None,
            ))

    def test_set_count_too_large_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                mode="sequential-set",
                subject="a cat mascot",
                style="flat vector sticker",
                set_count=9,
            ))

    def test_set_more_states_than_count_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                mode="sequential-set",
                subject="a cat mascot",
                style="flat vector sticker",
                set_count=2,
                frames=["Image 1: a.", "Image 2: b.", "Image 3: c."],
            ))


class TestWordBudget(unittest.TestCase):
    def test_over_ceiling_raises(self):
        long_subject = "a cat " * 130
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(subject=long_subject))


class TestNegationGuard(unittest.TestCase):
    def test_negation_only_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                subject="No people, no cars.",
                action="Not moving.",
                setting="An empty street, no signage.",
                style="No grain, no filter.",
                camera="Not close, without flare.",
            ))


class TestSettingsValidation(unittest.TestCase):
    def test_twenty_one_by_nine_passes(self):
        out = bp.build_prompt(**base(aspect_ratio="21:9"))
        self.assertIn("aspect_ratio=21:9", out)

    def test_unsupported_aspect_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(aspect_ratio="32:9"))

    def test_4k_passes(self):
        out = bp.build_prompt(**base(resolution="4K"))
        self.assertIn("resolution=4K", out)

    def test_unsupported_resolution_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(resolution="8K"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
