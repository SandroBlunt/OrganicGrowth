#!/usr/bin/env python3
"""Tests for grok-imagine-1-5 (image) build-prompt.py — TDD-first.

Covers: T2I subject-first assembly with required subject / lighting /
style, the word-budget hard ceiling, the edit change+keep requirement,
the edit one-reference rule, the moderation-safety scanner (a violence
term refused, a safe rephrase passes, --override-safety bypasses), the
negation guard (with the edit keep-clause exception), and aspect-ratio
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


def t2i(**overrides):
    args = dict(
        mode="T2I",
        subject="A weathered fisherman mending a net, hands working the cord.",
        environment="A wooden harbour jetty, boats blurred behind him.",
        lighting="Soft golden-hour side light, warm and low.",
        camera="85mm portrait, three-quarter angle, shallow depth of field.",
        style="Cinematic film still, naturalistic 35mm look.",
        details="",
        aspect_ratio="3:2",
    )
    args.update(overrides)
    return args


def edit(**overrides):
    args = dict(
        mode="edit",
        change="Relight the scene as heavy night rain with neon reflections.",
        keep="the performers' faces, poses, costumes, and exact composition",
        references=["two performers in a rain-soaked alley"],
        aspect_ratio="16:9",
    )
    args.update(overrides)
    return args


class TestT2I(unittest.TestCase):
    def test_t2i_assembles(self):
        out = bp.build_prompt(**t2i())
        self.assertIn("fisherman", out)
        self.assertIn("[on-screen settings", out)
        self.assertIn("aspect_ratio=3:2", out)

    def test_t2i_subject_leads(self):
        out = bp.build_prompt(**t2i())
        first_line = out.splitlines()[0]
        self.assertIn("fisherman", first_line)

    def test_t2i_requires_subject(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**t2i(subject="  "))

    def test_t2i_requires_lighting(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**t2i(lighting=""))

    def test_t2i_requires_style(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**t2i(style=""))


class TestWordBudget(unittest.TestCase):
    def test_over_ceiling_raises(self):
        long_subject = "a lone figure " * 40
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**t2i(subject=long_subject))


class TestEdit(unittest.TestCase):
    def test_edit_assembles(self):
        out = bp.build_prompt(**edit())
        self.assertIn("Reference:", out)
        self.assertIn("Keep the performers' faces", out)
        self.assertIn("exactly the same", out)

    def test_edit_requires_change(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**edit(change=""))

    def test_edit_requires_keep(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**edit(keep=""))

    def test_edit_requires_one_reference(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**edit(references=None))

    def test_edit_two_refs_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**edit(references=["a", "b"]))

    def test_edit_keep_clause_not_falsely_negation_rejected(self):
        # A keep clause containing "without" must not trip the negation
        # guard when the change clause is a positive instruction.
        out = bp.build_prompt(**edit(
            change="Relight the scene as a bright overcast midday.",
            keep="the face and pose without altering the framing",
        ))
        self.assertIn("Reference:", out)


class TestModerationScanner(unittest.TestCase):
    def test_violence_term_refused(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**t2i(
                subject="Two boxers in a brutal fight, one landing a punch.",
            ))

    def test_extreme_photorealism_refused(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**t2i(
                style="8K photorealistic, raw footage, documentary realism.",
            ))

    def test_quality_spam_refused(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**t2i(
                details="ultra-detailed, masterpiece, best quality.",
            ))

    def test_safe_rephrase_passes(self):
        out = bp.build_prompt(**t2i(
            subject="Two performers mid-rehearsal of a precise athletic "
                    "stage routine, one guiding the other.",
            style="High-contrast film-noir look, gritty but theatrical.",
        ))
        self.assertIn("performers", out)

    def test_override_safety_bypasses(self):
        out = bp.build_prompt(**t2i(
            subject="Two boxers in a fight, one landing a punch.",
            override_safety=True,
        ))
        self.assertIn("boxers", out)

    def test_scanner_reports_offending_term_and_alternative(self):
        try:
            bp.build_prompt(**t2i(
                subject="A soldier in a fight scene.",
            ))
        except bp.PromptValidationError as exc:
            msg = str(exc)
            self.assertIn("fight", msg)
            self.assertIn("stage routine", msg)
        else:
            self.fail("expected a PromptValidationError")


class TestNegationGuard(unittest.TestCase):
    def test_t2i_all_negation_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**t2i(
                subject="No people, no cars.",
                environment="An empty street, no signage.",
                lighting="No harsh light, never overexposed.",
                camera="Not close, without flare.",
                style="No grain, no filter.",
            ))


class TestAspectRatio(unittest.TestCase):
    def test_default_and_presets_pass(self):
        self.assertIn("aspect_ratio=1:1", bp.build_prompt(**t2i(
            aspect_ratio="1:1")))
        self.assertIn("aspect_ratio=9:16", bp.build_prompt(**t2i(
            aspect_ratio="9:16")))
        self.assertIn("aspect_ratio=auto", bp.build_prompt(**t2i(
            aspect_ratio="auto")))

    def test_unsupported_aspect_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**t2i(aspect_ratio="32:9"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
