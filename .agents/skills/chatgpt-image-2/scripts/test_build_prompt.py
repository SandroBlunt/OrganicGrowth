#!/usr/bin/env python3
"""Tests for build-prompt.py — written first (TDD).

Run: python3 scripts/test_build_prompt.py
Exits non-zero on first failure, zero if all pass.
"""

from __future__ import annotations

import importlib.util
import pathlib
import sys
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


class TestT2IAssembly(unittest.TestCase):
    def test_t2i_assembles_five_clauses_in_order(self):
        out = bp.build_prompt(
            mode="T2I",
            subject="A barista pulling an espresso shot.",
            action="The barista's hands rest on the portafilter.",
            setting="A small Melbourne specialty cafe at 7:30 am.",
            style="35 mm photograph, Kodak Portra 400 palette.",
            camera="Medium close-up at 50 mm, key from window camera-left.",
            references=None,
            aspect_ratio="3:2",
        )
        self.assertIn("barista pulling an espresso shot", out)
        self.assertIn("portafilter", out)
        self.assertIn("Melbourne", out)
        self.assertIn("Portra 400", out)
        self.assertIn("Medium close-up", out)
        idx_subject = out.index("barista pulling")
        idx_setting = out.index("Melbourne")
        idx_camera = out.index("Medium close-up")
        self.assertLess(idx_subject, idx_setting)
        self.assertLess(idx_setting, idx_camera)

    def test_t2i_missing_clause_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(
                mode="T2I",
                subject="A barista.",
                action="",
                setting="A cafe.",
                style="Photograph.",
                camera="Medium shot.",
                references=None,
                aspect_ratio="1:1",
            )


class TestNegationGuard(unittest.TestCase):
    def test_negation_only_subject_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(
                mode="T2I",
                subject="No people, no cars, not a cityscape.",
                action="No motion.",
                setting="An empty street, no signage.",
                style="Photograph, no grain.",
                camera="Wide shot, no people.",
                references=None,
                aspect_ratio="16:9",
            )

    def test_positive_phrasing_passes(self):
        out = bp.build_prompt(
            mode="T2I",
            subject="An empty cobbled street.",
            action="Wind drifts a single paper bag along the kerb.",
            setting="A pre-dawn European old-town square, blue hour.",
            style="35 mm photograph, neutral grade.",
            camera="Wide at 28 mm, eye level, soft ambient sky as key.",
            references=None,
            aspect_ratio="16:9",
        )
        self.assertIn("cobbled street", out)


class TestMRCap(unittest.TestCase):
    def test_mr_with_four_refs_passes(self):
        out = bp.build_prompt(
            mode="MR",
            subject="Editorial portrait composite.",
            action="Subject stands three-quarter to camera.",
            setting="Charcoal studio cyc.",
            style="Editorial photograph.",
            camera="Medium close-up, 85 mm.",
            references=[
                "subject's face",
                "outfit: charcoal blazer",
                "set: charcoal cyc",
                "lighting reference: soft key 45 deg camera-left",
            ],
            aspect_ratio="4:5",
        )
        self.assertIn("References:", out)
        self.assertIn("1.", out)
        self.assertIn("4.", out)

    def test_mr_with_five_refs_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(
                mode="MR",
                subject="Composite.",
                action="Stands.",
                setting="Studio.",
                style="Photograph.",
                camera="Medium.",
                references=["a", "b", "c", "d", "e"],
                aspect_ratio="1:1",
            )

    def test_mr_with_one_ref_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(
                mode="MR",
                subject="Composite.",
                action="Stands.",
                setting="Studio.",
                style="Photograph.",
                camera="Medium.",
                references=["only-one"],
                aspect_ratio="1:1",
            )


class TestI2IRefRequired(unittest.TestCase):
    def test_i2i_without_ref_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(
                mode="I2I",
                subject="Edit the supplied portrait.",
                action="Subject smiles instead of frowns.",
                setting="Same set as the reference.",
                style="Match the reference style.",
                camera="Hold the reference framing.",
                references=None,
                aspect_ratio="1:1",
            )

    def test_i2i_with_one_ref_passes(self):
        out = bp.build_prompt(
            mode="I2I",
            subject="Reference: half-body portrait of a woman in a denim jacket.",
            action="Edit: change lighting to golden-hour from camera-left.",
            setting="Preserve: subject identity, pose, framing.",
            style="Style hold: 35 mm photograph, Portra palette.",
            camera="Hold reference framing.",
            references=["primary edit reference"],
            aspect_ratio="3:2",
        )
        self.assertIn("Reference:", out)


class TestAspectRatio(unittest.TestCase):
    def test_invalid_aspect_ratio_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(
                mode="T2I",
                subject="A.",
                action="B.",
                setting="C.",
                style="D.",
                camera="E.",
                references=None,
                aspect_ratio="banana",
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
