#!/usr/bin/env python3
"""Tests for seedream-5-0-pro build-prompt.py — TDD-first.

Covers: subject-first stills, Design (info-layout) mode, in-image text
quoting + language hint, Edit single-ref with grounded target and
hex/swatch recolour validation, MR ordinal labelling + 10-ref cap,
sequential-set count + global style lock, layer-separation flag,
word-budget hard ceiling, negation guard, aspect/resolution validation
(2K ceiling — a 4K request is rejected).

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
        target=None,
        color=None,
        layers=False,
        in_image_text=None,
        text_language=None,
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


class TestDesign(unittest.TestCase):
    def test_design_has_brief_header(self):
        out = bp.build_prompt(**base(
            mode="Design",
            subject="A one-page infographic explaining the water cycle.",
            action="",
            setting="A circular clockwise flow with four labelled stages.",
            style="Flat vector, teal-and-white, bold sans-serif headings.",
            camera="",
            in_image_text='the title "THE WATER CYCLE"',
        ))
        self.assertIn("High-density design brief:", out)
        self.assertIn("THE WATER CYCLE", out)

    def test_design_requires_style(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(mode="Design", style=""))


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

    def test_language_hint_appears(self):
        out = bp.build_prompt(**base(
            in_image_text='the sign "مرحبا"',
            text_language="ar",
        ))
        self.assertIn("language: ar", out)


class TestEdit(unittest.TestCase):
    def test_edit_with_one_ref_passes(self):
        out = bp.build_prompt(**base(
            mode="Edit",
            subject="Recolour the car body to a deep metallic blue.",
            action="",
            setting="",
            style="Keep the original commercial-product look.",
            camera="",
            references=["a red sports car in a studio"],
        ))
        self.assertIn("Reference:", out)

    def test_edit_target_appears(self):
        out = bp.build_prompt(**base(
            mode="Edit",
            subject="Recolour the body panels.",
            action="", setting="", camera="",
            style="Keep the original look.",
            references=["a red sports car"],
            target="the box around the body panels, not the windows",
        ))
        self.assertIn("Target:", out)

    def test_edit_hex_color_passes(self):
        out = bp.build_prompt(**base(
            mode="Edit",
            subject="Recolour the body.",
            action="", setting="", camera="",
            style="Keep the gloss.",
            references=["a car"],
            color="#1E3A8A",
        ))
        self.assertIn("#1E3A8A", out)

    def test_edit_swatch_color_passes(self):
        out = bp.build_prompt(**base(
            mode="Edit",
            subject="Replace the tabletop material.",
            action="", setting="", camera="",
            style="Keep the lighting.",
            references=["a wooden table"],
            color="match the swatch in Image 2",
        ))
        self.assertIn("Colour / material value:", out)

    def test_edit_bad_color_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                mode="Edit",
                subject="Recolour the body.",
                action="", setting="", camera="",
                style="Keep the gloss.",
                references=["a car"],
                color="bluish",
            ))

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
            action="", setting="", camera="",
            style="flat vector sticker, bold outline, white background",
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


class TestLayers(unittest.TestCase):
    def test_layers_flag_appends_instruction(self):
        out = bp.build_prompt(**base(layers=True))
        self.assertIn("Layer separation:", out)
        self.assertIn("export as PNG", out)

    def test_layers_on_sequential_set(self):
        out = bp.build_prompt(**base(
            mode="sequential-set",
            subject="a cat mascot",
            action="", setting="", camera="",
            style="flat vector sticker",
            set_count=2,
            layers=True,
        ))
        self.assertIn("Layer separation:", out)


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
    def test_four_by_five_passes(self):
        out = bp.build_prompt(**base(aspect_ratio="4:5"))
        self.assertIn("aspect_ratio=4:5", out)

    def test_auto_aspect_passes(self):
        out = bp.build_prompt(**base(aspect_ratio="auto"))
        self.assertIn("aspect_ratio=auto", out)

    def test_unsupported_aspect_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(aspect_ratio="32:9"))

    def test_2k_passes(self):
        out = bp.build_prompt(**base(resolution="2K"))
        self.assertIn("resolution=2K", out)

    def test_auto_resolution_passes(self):
        out = bp.build_prompt(**base(resolution="auto"))
        self.assertIn("resolution=auto", out)

    def test_4k_rejected(self):
        # Seedream 5.0 Pro is a 2K model — 4K is not a valid tier.
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(resolution="4K"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
