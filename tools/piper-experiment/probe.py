"""Experiment only: time the existing adapter with optional ONNX session settings."""
import argparse
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import sys
import time
from unittest.mock import patch

START = time.perf_counter()
CPU_START = time.process_time()
sys.dont_write_bytecode = True
PHRASES = Path(__file__).with_name("phrases.json")


def report(phase, start, cpu, **extra):
    event = {"phase": phase, "ms": round((time.perf_counter() - start) * 1000, 2),
             "cpu_ms": round((time.process_time() - cpu) * 1000, 2), **extra}
    line = json.dumps(event)
    if path := os.getenv("PIPER_BENCH_TIMINGS"):
        with open(path, "a", encoding="utf-8") as log:
            log.write(line + "\n")
    else:
        print(line, flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--warm", type=Path, help="Output directory for the reuse experiment")
    args = parser.parse_args()
    if args.output is None and args.warm is None:
        parser.error("--output or --warm is required")

    if fixture := os.getenv("PIPER_BENCH_FIXTURE"):
        shutil.copyfile(fixture, args.output)
        return

    import onnxruntime as ort
    from piper import PiperVoice

    source = os.getenv("PIPER_BENCH_HELPER", "/original-piper.py")
    spec = importlib.util.spec_from_file_location("mitten_piper_helper", source)
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    threads = os.getenv("PIPER_BENCH_THREADS", "default")
    if threads not in {"default", "one"}:
        parser.error("PIPER_BENCH_THREADS must be default or one")
    from importlib.metadata import version
    report("imports", START, CPU_START, threads=threads, onnxruntime=ort.__version__,
           piper=version("piper-tts"), lameenc=version("lameenc"))

    load = PiperVoice.load
    synthesize_wav = PiperVoice.synthesize_wav
    session = ort.InferenceSession
    voice = None

    def measured_session(model, sess_options, **kwargs):
        sess_options.intra_op_num_threads = 1
        sess_options.inter_op_num_threads = 1
        sess_options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        sess_options.add_session_config_entry("session.intra_op.allow_spinning", "0")
        sess_options.add_session_config_entry("session.inter_op.allow_spinning", "0")
        return session(model, sess_options=sess_options, **kwargs)

    def measured_load(model):
        nonlocal voice
        if args.warm and voice is not None:
            return voice
        start, cpu = time.perf_counter(), time.process_time()
        options = patch.object(ort, "InferenceSession", measured_session) if threads == "one" else contextlib.nullcontext()
        with options:
            voice = load(model)
        actual = voice.session.get_session_options()
        if threads == "one" and (
            actual.intra_op_num_threads != 1
            or actual.inter_op_num_threads != 1
            or actual.execution_mode != ort.ExecutionMode.ORT_SEQUENTIAL
            or actual.get_session_config_entry("session.intra_op.allow_spinning") != "0"
            or actual.get_session_config_entry("session.inter_op.allow_spinning") != "0"
        ):
            raise RuntimeError("The ONNX session did not apply the experiment settings")
        report("model_load", start, cpu, intra_threads=actual.intra_op_num_threads,
               inter_threads=actual.inter_op_num_threads)
        return voice

    def measured_wav(self, *positional, **named):
        start, cpu = time.perf_counter(), time.process_time()
        result = synthesize_wav(self, *positional, **named)
        report("synthesis_wav", start, cpu)
        return result

    def generate(text, output, index):
        start, cpu = time.perf_counter(), time.process_time()
        with patch.object(sys, "stdin", io.StringIO(text)), patch.object(
            sys, "argv", [source, "--model", str(args.model), "--output", str(output)]
        ):
            helper.main()
        report("helper_total", start, cpu, sample=index, chars=len(text), bytes=output.stat().st_size)

    with patch.object(PiperVoice, "load", staticmethod(measured_load)), patch.object(
        PiperVoice, "synthesize_wav", measured_wav
    ):
        if args.warm:
            phrases = json.loads(PHRASES.read_text(encoding="utf-8"))
            args.warm.mkdir(parents=True, exist_ok=True)
            for index, text in enumerate(phrases * 3):
                generate(text, args.warm / f"warm-{index}.mp3", index)
        else:
            generate(sys.stdin.read(), args.output, 0)


if __name__ == "__main__":
    main()
