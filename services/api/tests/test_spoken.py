import unittest

from app.spoken import speak_chunks, spoken_preview


class SpokenPreviewTests(unittest.TestCase):
    def test_short_text_is_unchanged(self) -> None:
        self.assertEqual(spoken_preview("Tell me about the Taj."), "Tell me about the Taj.")

    def test_cuts_at_a_sentence_not_mid_word(self) -> None:
        long = (
            "The Taj Mahal is a white marble mausoleum in Agra. "
            "The charbagh garden sits on the Yamuna. "
            "A third sentence should be dropped when the cap is tight."
        )
        preview = spoken_preview(long, max_chars=120)
        self.assertTrue(preview.endswith("."))
        self.assertLessEqual(len(preview), 90)
        self.assertIn("Taj Mahal", preview)
        self.assertNotIn("third sentence", preview)

    def test_speak_chunks_starts_with_the_first_sentence(self) -> None:
        chunks = speak_chunks("The Taj Mahal is in Agra. The charbagh sits on the Yamuna.")
        self.assertGreaterEqual(len(chunks), 2)
        self.assertTrue(chunks[0].startswith("The Taj Mahal"))


class VoiceLatencyHelperTests(unittest.TestCase):
    def test_english_is_the_default_stt_language(self) -> None:
        from app.voice_service import _resolve_language

        self.assertEqual(_resolve_language("hi"), "hi")
        self.assertIsNone(_resolve_language("auto"))
        self.assertEqual(_resolve_language(None), "en")

    def test_warmup_wav_is_a_real_wave_file(self) -> None:
        from app.voice_service import _silent_wav

        data = _silent_wav()
        self.assertTrue(data.startswith(b"RIFF"))
        self.assertEqual(data[8:12], b"WAVE")


if __name__ == "__main__":
    unittest.main()
