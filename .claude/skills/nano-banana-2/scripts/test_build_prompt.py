#!/usr/bin/env python3
"""Tests for nano-banana-2 build-prompt.py — TDD-first.

Reflects 0.2.0: variant-aware MR caps (Flash 10obj+4char, Pro 6obj+5char,
14 total), expanded aspect ratios, 512 (Flash-only) resolution, Thinking
Mode and grounding configuration parameters, frame-sequence unchanged.

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
        subject="A barista pulls an espresso shot.",
        action="Hands rest on the portafilter.",
        setting="A small Tokyo specialty cafe at 7 am.",
        style="35 mm photograph, neutral grade.",
        camera="Medium close-up at 50 mm.",
        references=None,
        frames=None,
        handoff=None,
        aspect_ratio="3:2",
        variant="flash",
        resolution=None,
        thinking_level="minimal",
        include_thoughts=False,
        grounding_web=False,
        grounding_image=False,
    )
    args.update(overrides)
    return args


class TestT2I(unittest.TestCase):
    def test_t2i_assembles(self):
        out = bp.build_prompt(**base())
        self.assertIn("Tokyo", out)
        self.assertIn("portafilter", out)
        self.assertIn("[aspect_ratio=3:2]", out)
        self.assertIn("[variant=flash]", out)


class TestI2I(unittest.TestCase):
    def test_i2i_with_one_ref_passes(self):
        out = bp.build_prompt(**base(
            mode="I2I",
            subject="Reference: half-body portrait, daylight.",
            action="Edit: shift to golden-hour lighting.",
            setting="Preserve identity, framing.",
            style="Style hold: 35 mm photograph.",
            camera="Hold reference framing.",
            references=["primary"],
        ))
        self.assertIn("Reference:", out)

    def test_i2i_without_ref_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(mode="I2I", references=None))


class TestMRCapsFlash(unittest.TestCase):
    def test_flash_max_objects_passes(self):
        refs = [{"kind": "object", "role": f"o{i}"} for i in range(10)]
        out = bp.build_prompt(**base(
            mode="MR", references=refs, variant="flash",
        ))
        self.assertIn("Objects (10 of 10)", out)

    def test_flash_eleven_objects_raises(self):
        refs = [{"kind": "object", "role": f"o{i}"} for i in range(11)]
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                mode="MR", references=refs, variant="flash",
            ))

    def test_flash_max_characters_passes(self):
        refs = [{"kind": "character", "role": f"c{i}"} for i in range(4)]
        out = bp.build_prompt(**base(
            mode="MR", references=refs, variant="flash",
        ))
        self.assertIn("Characters (4 of 4)", out)

    def test_flash_five_characters_raises(self):
        refs = [{"kind": "character", "role": f"c{i}"} for i in range(5)]
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                mode="MR", references=refs, variant="flash",
            ))


class TestMRCapsPro(unittest.TestCase):
    def test_pro_max_characters_passes(self):
        refs = [{"kind": "character", "role": f"c{i}"} for i in range(5)]
        out = bp.build_prompt(**base(
            mode="MR", references=refs, variant="pro",
        ))
        self.assertIn("Characters (5 of 5)", out)

    def test_pro_six_characters_raises(self):
        refs = [{"kind": "character", "role": f"c{i}"} for i in range(6)]
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                mode="MR", references=refs, variant="pro",
            ))

    def test_pro_seven_objects_raises(self):
        refs = [{"kind": "object", "role": f"o{i}"} for i in range(7)]
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                mode="MR", references=refs, variant="pro",
            ))


class TestMRTotal(unittest.TestCase):
    def test_total_fifteen_raises(self):
        refs = (
            [{"kind": "object", "role": f"o{i}"} for i in range(10)]
            + [{"kind": "character", "role": f"c{i}"} for i in range(5)]
        )
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                mode="MR", references=refs, variant="flash",
            ))


class TestMRLegacyStringRefs(unittest.TestCase):
    def test_legacy_string_refs_treated_as_objects(self):
        out = bp.build_prompt(**base(
            mode="MR",
            references=["face", "outfit", "set"],
            variant="flash",
        ))
        self.assertIn("References:", out)
        self.assertIn("face", out)


class TestFrameSequence(unittest.TestCase):
    def test_frame_sequence_passes_with_4_frames_and_handoff(self):
        out = bp.build_prompt(**base(
            mode="frame-sequence",
            subject="A dancer in a pale-grey silk dress.",
            action="",
            setting="",
            style="50 mm photograph, soft window key from camera-left.",
            camera="Wide medium at 50 mm, eye level, subject centered.",
            frames=[
                "Frame 1: arms at sides, gaze lowered.",
                "Frame 2: hands rising, gaze lifting.",
                "Frame 3: arms three-quarters up, hem catches motion.",
                "Frame 4: arms overhead, palms together, gaze upward.",
            ],
            handoff="Veo 3.1 first-and-last-frame",
            aspect_ratio="16:9",
        ))
        self.assertIn("Sequence intent:", out)
        self.assertIn("Frame 4", out)
        self.assertIn("Veo 3.1", out)

    def test_frame_sequence_without_handoff_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                mode="frame-sequence",
                subject="A dancer.",
                action="",
                setting="",
                style="Photograph.",
                camera="Medium.",
                frames=["Frame 1: a.", "Frame 2: b.", "Frame 3: c."],
                handoff=None,
                aspect_ratio="16:9",
            ))

    def test_frame_sequence_with_2_frames_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                mode="frame-sequence",
                subject="A dancer.",
                action="",
                setting="",
                style="Photograph.",
                camera="Medium.",
                frames=["Frame 1: a.", "Frame 2: b."],
                handoff="Veo 3.1",
                aspect_ratio="16:9",
            ))

    def test_frame_sequence_with_9_frames_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                mode="frame-sequence",
                subject="A dancer.",
                action="",
                setting="",
                style="Photograph.",
                camera="Medium.",
                frames=[f"Frame {i}: x." for i in range(1, 10)],
                handoff="Veo 3.1",
                aspect_ratio="16:9",
            ))


class TestNegationGuard(unittest.TestCase):
    def test_negation_only_t2i_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                subject="No people, no cars.",
                action="No motion, not moving.",
                setting="An empty street, not lit, no signage.",
                style="No grain, no filter.",
                camera="Wide shot, not close, without flare.",
            ))


class TestExpandedAspectRatios(unittest.TestCase):
    def test_twenty_one_by_nine_passes(self):
        out = bp.build_prompt(**base(aspect_ratio="21:9"))
        self.assertIn("[aspect_ratio=21:9]", out)

    def test_one_by_eight_passes(self):
        out = bp.build_prompt(**base(aspect_ratio="1:8"))
        self.assertIn("[aspect_ratio=1:8]", out)

    def test_unsupported_aspect_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(aspect_ratio="32:9"))


class TestResolution(unittest.TestCase):
    def test_512_on_flash_passes(self):
        out = bp.build_prompt(**base(resolution="512", variant="flash"))
        self.assertIn("[resolution=512]", out)

    def test_512_on_pro_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(resolution="512", variant="pro"))

    def test_2k_on_pro_passes(self):
        out = bp.build_prompt(**base(resolution="2K", variant="pro"))
        self.assertIn("[resolution=2K]", out)


class TestThinkingMode(unittest.TestCase):
    def test_high_thinking_appears_in_config_block(self):
        out = bp.build_prompt(**base(thinking_level="High"))
        self.assertIn("thinkingLevel=High", out)
        self.assertIn("NOT part of prompt budget", out)


class TestGrounding(unittest.TestCase):
    def test_image_grounding_on_flash_passes(self):
        out = bp.build_prompt(**base(
            grounding_image=True, variant="flash",
        ))
        self.assertIn("grounding_image=true", out)

    def test_image_grounding_on_pro_raises(self):
        with self.assertRaises(bp.PromptValidationError):
            bp.build_prompt(**base(
                grounding_image=True, variant="pro",
            ))


if __name__ == "__main__":
    unittest.main(verbosity=2)
