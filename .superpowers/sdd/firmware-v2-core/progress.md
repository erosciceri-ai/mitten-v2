# SDD ledger — plan: docs/superpowers/plans/firmware-v2-core.md

Execution method: native; no commits per explicit user instruction.
Pre-flight: Task 1 constants feed Tasks 2–6; plain string constants satisfy MicroPython constraints.
Pre-flight: Task 2 parser feeds Task 7 transport loop; ParseResult exposes frames/errors/remaining.
Pre-flight: Task 3 builders feed Tasks 4–7; all envelopes remain plain dictionaries.
Pre-flight: Task 4 state changes feed Tasks 5 and 7 through an injected event callback.
Pre-flight: Task 5 dispatcher feeds Task 7; request IDs are tracked only while active.
Ruling: startup emits INITIALIZING plus subsequent CALIBRATING and IDLE events — protocol requires device.state on each startup transition and simulator emits the current initial state before transitions.
Ruling: no commits despite plan workflow — explicit user instruction overrides plan commit steps.
Task 1: complete (syntax: python -m py_compile firmware/esp32/config.py → pass; no enum.Enum).
Task 2: Ruling: corrected resumed test fixture max limit from 10 to 100 — the valid recovery frame must fit the configured limit; cost if wrong: recovery expectation would contradict maxMessageBytes.
Task 2: complete (tests: python -m pytest tests/test_framing.py -q → pass; syntax → pass).
Task 3: complete (tests: python -m pytest tests/test_envelopes.py -q → 17 passed; syntax → pass).
Task 4: complete (tests: python -m pytest tests/test_state_machine.py -q → 15 passed; syntax → pass).
Task 5: Ruling: sequential request ID reuse is accepted — docs/protocol.md only rejects IDs still pending or tied to an active asynchronous operation; cost if wrong: stricter historical tracking would consume unbounded RAM and reject permitted requests.
Task 5: complete (tests: handshake + status → pass; syntax → pass).
Task 6: complete (tests: python -m pytest tests/test_error_handling.py -q → 6 passed; syntax → pass).
Task 7: Ruling: machine.UART is lazily imported only by create_protocol_uart_transport; protocol logic consumes a read/write stream — preserves CPython imports and a separate future DFPlayer UART.
Task 7: complete (tests: framing + main → pass; syntax → pass).
Task 8: Ruling: parser retains ordered frame/error items in addition to public frames/errors lists — required to preserve bootstrap error priority within a single UART chunk; cost if wrong: a malformed pre-handshake frame could be misreported after a later handshake in the same chunk.
Final review: self-review (native execution and no delegated agents per user/harness instruction).
