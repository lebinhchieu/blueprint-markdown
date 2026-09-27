"""Generate VieNeu-TTS audio for scripts/narrate.mjs.

Reads a JSON list of {"text", "voice", "out"} on stdin and writes one WAV per item,
printing each finished text so narrate.mjs can report progress.
"""
import json
import sys

from vieneu import Vieneu

tts = Vieneu(precision="int8")
for job in json.load(sys.stdin):
    tts.save(tts.infer(job["text"], voice=job["voice"]), job["out"])
    print(job["text"], flush=True)
