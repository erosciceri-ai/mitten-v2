# MITTEN V2 Firmware Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the core Protocol V2 firmware in MicroPython within `firmware/esp32/`, implementing NDJSON framing, request/response/event envelopes, device.handshake and device.status commands, a 6-state firmware state machine, structured error handling, and a non-blocking main loop.

**Architecture:** Pure-Python core (framework-agonstic, no ESP32 HAL imports in testable modules) with an ESP32 `main.py` entry point that imports the core modules. All logic is unit-testable under CPython 3.11+ using pytest; MicroPython compatibility is verified via `py_compile`.

**Tech Stack:** MicroPython-compatible Python, pytest for CPython testing, `py_compile` for MicroPython syntax verification.

**Spec:** `docs/protocol.md` (Protocol Version 2), `packages/contracts/src/types.ts` and `packages/contracts/src/validators.ts` (shared type contracts and validation rules), `tools/esp32-simulator/src/dispatcher.ts` (reference behavior for handshake, status, state machine).

## Global Constraints

- Protocol Version = 2; all messages include `"v":2`
- `maxMessageBytes = 8192` (includes bootstrap/handshake)
- requestId pattern: `^[A-Za-z0-9._:-]{1,64}$`
- Client must be `"MITTEN_WEB"` for handshake
- `PROTOCOL_VERSION = 2` in firmware config
- Firmware states: INITIALIZING, CALIBRATING, IDLE, CAPTURING, SYNCING, ERROR
- Only 2 commands implemented: `device.handshake`, `device.status`
- Handshake must work in ALL states
- Status works in all states except DISCONNECTED (post-handshake states)
- Events: `device.state` on every state change
- Error reporting: `protocol.error` event for uncorrelated errors; error response for correlated errors
- No fragmentation; oversize → discard + error
- Frame delimiter: LF (`\n`), accept CRLF too
- No `print()`/banners on protocol channel — only NDJSON envelopes

## Additional Precautions

1. **No enum.Enum** — Use simple string constants for `FirmwareState` and `ProtocolErrorCode`. MicroPython does not guarantee `enum` module availability. Constants are strings matching the canonical values exactly.
2. **Transport abstraction** — Frame a `StreamTransport` ABC with `read()` and `write()` methods. The real ESP32 UART adapter implements this, and tests use `MockStreamTransport`. Never import `machine` outside `main.py`.
3. **Request ID tracking** — Maintain a `set` of in-flight request IDs only for concurrent async operations. For synchronous command-response (handshake, status), the single outstanding ID is tracked via a simple variable. After the response is sent, the ID is freed. No unbounded history.

## Review Focus

1. **Oversize frame handling** - Framing must discard the line and emit `MESSAGE_TOO_LARGE` after handshake, but during bootstrap (pre-handshake), oversize must cause frontend to reject. Tests should verify the discard-then-resync behavior precisely.
2. **RequestId correlation on errors** - Every error response must carry the original request `id` when recoverable. Only uncorrelatable errors use `protocol.error` event.
3. **State transition on device.state event timing** - The `device.state` event must be emitted immediately after each state transition, including the initial INITIALIZING→CALIBRATING→IDLE during startup.
4. **Handshake before other commands** - Before a compatible handshake, only `device.handshake` is allowed; everything else gets `HANDSHAKE_REQUIRED`. After handshake, unknown commands get `UNKNOWN_COMMAND`.
5. **CRLF tolerance** - The framing must strip trailing CR before LF.

---

## Task 1: Project Structure and Configuration

**Files:**
- Create: `firmware/esp32/config.py`
- Create: `firmware/esp32/__init__.py` (empty, for package-style imports if needed)

**Interfaces:**
- Consumes: docs/protocol.md version and constants
- Produces: `PROTOCOL_VERSION`, `BOOTSTRAP_MAX_MESSAGE_BYTES`, `FirmwareState` enum, `ProtocolErrorCode` enum, `MAX_GESTURES`, `FIRMWARE_VERSION`, `DEVICE_NAME`, `HANDSHAKE_IDLE_TIMEOUT_MS`, etc.

```python
# Expected config.py API (NO class/enum — plain string constants for MicroPython)
PROTOCOL_VERSION = 2
FIRMWARE_VERSION = "2.0.0"
DEVICE_NAME = "MITTEN"
BOOTSTRAP_MAX_MESSAGE_BYTES = 8192
MAX_GESTURES = 50
HANDSHAKE_TIMEOUT_MS = 5000
RESPONSE_TIMEOUT_MS = 5000
FRAME_INCOMPLETE_TIMEOUT_MS = 5000

# FirmwareState — string constants (NOT enum.Enum for MicroPython compat)
STATE_INITIALIZING = "INITIALIZING"
STATE_CALIBRATING = "CALIBRATING"
STATE_IDLE = "IDLE"
STATE_CAPTURING = "CAPTURING"
STATE_SYNCING = "SYNCING"
STATE_ERROR = "ERROR"

FIRMWARE_STATES = [STATE_INITIALIZING, STATE_CALIBRATING, STATE_IDLE, STATE_CAPTURING, STATE_SYNCING, STATE_ERROR]

# ProtocolErrorCode — string constants (NOT enum.Enum for MicroPython compat)
ERR_INVALID_JSON = "INVALID_JSON"
ERR_INVALID_MESSAGE = "INVALID_MESSAGE"
ERR_MESSAGE_TOO_LARGE = "MESSAGE_TOO_LARGE"
ERR_INCOMPLETE_MESSAGE = "INCOMPLETE_MESSAGE"
ERR_UNKNOWN_COMMAND = "UNKNOWN_COMMAND"
ERR_DUPLICATE_REQUEST_ID = "DUPLICATE_REQUEST_ID"
ERR_HANDSHAKE_REQUIRED = "HANDSHAKE_REQUIRED"
ERR_PROTOCOL_INCOMPATIBLE = "PROTOCOL_INCOMPATIBLE"
ERR_INVALID_PAYLOAD = "INVALID_PAYLOAD"
ERR_INVALID_STATE = "INVALID_STATE"
ERR_DEVICE_BUSY = "DEVICE_BUSY"
# ... (full list from docs/protocol.md section 15.4)
```

- [ ] **Step 1: Write config.py**
- [ ] **Step 2: Verify with py_compile**

```bash
python -m py_compile firmware/esp32/config.py
```

---

## Task 2: NDJSON Framing Parser

**Files:**
- Create: `firmware/esp32/protocol/__init__.py`
- Create: `firmware/esp32/protocol/framing.py`
- Create: `firmware/esp32/tests/test_framing.py`

**Interfaces:**
- Consumes: `BOOTSTRAP_MAX_MESSAGE_BYTES` from `config`
- Produces: `class NdjsonParser` with `.push(chunk: bytes) -> ParseResult` where `ParseResult` has `.frames: list[dict]`, `.errors: list[ParseError]`. `ParseError` is a dict with `type` (INVALID_JSON, INVALID_UTF8, MESSAGE_TOO_LARGE, INCOMPLETE_MESSAGE) and `message: str`.

**MicroPython considerations:**
- Use `bytearray` for the pending buffer
- Use `bytes` slicing for operations
- Avoid `memoryview` if not compatible; use plain slicing
- UTF-8 decode via `bytes.decode('utf-8')` in a try/except
- `json.loads()` works in MicroPython

```python
# Test expectations
def test_parse_single_frame():
    parser = NdjsonParser()
    result = parser.push(b'{"v":2,"type":"request","id":"req-1","command":"device.status","payload":{}}\n')
    assert len(result.frames) == 1
    assert result.frames[0]['command'] == 'device.status'

def test_parse_chunked_frame():
    parser = NdjsonParser()
    r1 = parser.push(b'{"v":2,"type":"request","id":"req-1",')
    assert len(r1.frames) == 0
    r2 = parser.push(b'"command":"device.status","payload":{}}\n')
    assert len(r2.frames) == 1

def test_reject_oversize():
    parser = NdjsonParser(max_message_bytes=100)
    large = b'{"v":2,"type":"request","id":"req-1","command":"a","payload":{' + b'"x":"' + b'x' * 200 + b'"}}\n'
    result = parser.push(large)
    assert len(result.errors) == 1
    assert result.errors[0]['type'] == 'MESSAGE_TOO_LARGE'

def test_crlf_tolerance():
    parser = NdjsonParser()
    result = parser.push(b'{"v":2,"type":"request","id":"req-1","command":"a","payload":{}}\r\n')
    assert len(result.frames) == 1
```

- [ ] **Step 1: Write failing tests in `test_framing.py`**
- [ ] **Step 2: Run tests, verify they fail**
- [ ] **Step 3: Implement `NdjsonParser` in `framing.py`**
- [ ] **Step 4: Run tests, verify they pass**
- [ ] **Step 5: Verify MicroPython compatibility**

```bash
cd firmware/esp32
python -m pytest tests/test_framing.py -v
python -m py_compile protocol/framing.py
```

---

## Task 3: Envelope Builders and Validators

**Files:**
- Create: `firmware/esp32/protocol/__init__.py` (update)
- Create: `firmware/esp32/protocol/envelopes.py`
- Create: `firmware/esp32/tests/test_envelopes.py`

**Interfaces:**
- Consumes: `FirmwareState`, `ProtocolErrorCode`, `PROTOCOL_VERSION` from `config`; requestId pattern from `config`
- Produces: `build_handshake_response(request_id, firmware_version, protocol_version, state, capabilities)`, `build_status_response(request_id, state, active_profile, active_sync, error)`, `build_error_response(request_id, code, message, details=None)`, `build_state_event(state)`, `build_protocol_error_event(code, message)`, `is_valid_request_id(id) -> bool`, `serialize_envelope(envelope) -> bytes`, `deserialize_envelope(line) -> dict | None`.

```python
# Test expectations
def test_handshake_response():
    result = build_handshake_response('req-1', '2.0.0', 2, FirmwareState.IDLE, {'maxGestures': 50, 'maxMessageBytes': 8192})
    assert result['v'] == 2
    assert result['type'] == 'response'
    assert result['ok'] == True
    assert result['result']['device'] == 'MITTEN'
    assert result['result']['protocolVersion'] == 2
    assert result['result']['capabilities']['maxMessageBytes'] == 8192

def test_error_response_correlation():
    result = build_error_response('req-1', ProtocolErrorCode.HANDSHAKE_REQUIRED, 'Handshake required')
    assert result['id'] == 'req-1'
    assert result['ok'] == False
    assert result['error']['code'] == 'HANDSHAKE_REQUIRED'

def test_state_event():
    event = build_state_event(FirmwareState.CAPTURING)
    assert event['type'] == 'event'
    assert event['event'] == 'device.state'
    assert event['data']['state'] == 'CAPTURING'

def test_invalid_request_id():
    assert is_valid_request_id('req-1') == True
    assert is_valid_request_id('invalid@id') == False
    assert is_valid_request_id('') == False
```

- [ ] **Step 1: Write failing tests in `test_envelopes.py`**
- [ ] **Step 2: Run tests, verify they fail**
- [ ] **Step 3: Implement envelope builders and validators in `envelopes.py`**
- [ ] **Step 4: Run tests, verify they pass**
- [ ] **Step 5: Verify MicroPython compatibility**

```bash
python -m py_compile protocol/envelopes.py
```

---

## Task 4: Firmware State Machine

**Files:**
- Create: `firmware/esp32/statemachine/__init__.py`
- Create: `firmware/esp32/statemachine/states.py`
- Create: `firmware/esp32/statemachine/machine.py`
- Create: `firmware/esp32/tests/test_state_machine.py`

**Interfaces:**
- Consumes: `FirmwareState` from `config`
- Produces: `class FirmwareStateMachine` with:
  - `startup()` — transitions INITIALIZING → CALIBRATING → IDLE, emitting `device.state` for each
  - `start_capture() -> bool` — IDLE → CAPTURING
  - `finish_capture() -> bool` — CAPTURING → IDLE
  - `start_sync() -> bool` — IDLE → SYNCING
  - `finish_sync() -> bool` — SYNCING → IDLE
  - `to_error() -> bool` — any state → ERROR
  - `current -> FirmwareState`
  - `set_state_change_listener(callback)` — callback receives old_state, new_state

```python
# Test expectations
def test_startup_sequence():
    events = []
    sm = FirmwareStateMachine(lambda old, new: events.append(new))
    sm.startup()
    assert events == [FirmwareState.CALIBRATING, FirmwareState.IDLE]
    assert sm.current == FirmwareState.IDLE

def test_capture_transitions():
    events = []
    sm = FirmwareStateMachine(lambda old, new: events.append((old, new)))
    sm.startup()
    events.clear()
    assert sm.start_capture() == True
    assert sm.current == FirmwareState.CAPTURING
    assert events == [(FirmwareState.IDLE, FirmwareState.CAPTURING)]
    assert sm.finish_capture() == True
    assert sm.current == FirmwareState.IDLE

def test_invalid_transition():
    sm = FirmwareStateMachine(lambda old, new: None)
    sm.startup()
    # Cannot start sync from IDLE if already syncing
    sm.start_sync()
    assert sm.start_capture() == False  # IDLE is now SYNCING
    assert sm.current == FirmwareState.SYNCING

def test_to_error_from_any_state():
    sm = FirmwareStateMachine(lambda old, new: None)
    sm.startup()
    assert sm.to_error() == True
    assert sm.current == FirmwareState.ERROR
    # From ERROR, should stay ERROR
    assert sm.start_capture() == False
```

- [ ] **Step 1: Write failing tests in `test_state_machine.py`**
- [ ] **Step 2: Run tests, verify they fail**
- [ ] **Step 3: Implement state machine in `machine.py`** (states.py just exposes the FirmwareState constants from config)
- [ ] **Step 4: Run tests, verify they pass**
- [ ] **Step 5: Verify MicroPython compatibility**

```bash
python -m py_compile statemachine/machine.py statemachine/states.py
```

---

## Task 5: Command Handlers (device.handshake, device.status)

**Files:**
- Create: `firmware/esp32/protocol/commands.py`
- Create: `firmware/esp32/tests/test_handshake.py`
- Create: `firmware/esp32/tests/test_status.py`

**Interfaces:**
- Consumes: `FirmwareStateMachine` from `statemachine/machine`, envelope builders from `protocol/envelopes`, validators from `protocol/envelopes`
- Produces: `class Firmware` — the central dispatcher class that holds state and dispatches commands. Methods:
  - `handle_handshake(request_id, payload) -> envelope_dict`
  - `handle_status(request_id) -> envelope_dict`
  - `handle_request(envelope: dict) -> envelope_dict | None` — returns the response envelope or None for async ops
  - `pending_request_ids: set` — tracks in-flight request IDs to reject `DUPLICATE_REQUEST_ID`

```python
# Test expectations (matching simulator tests)
def test_handshake_success():
    fw = Firmware()
    fw.startup()
    response = fw.handle_handshake('req-1', {'client': 'MITTEN_WEB', 'supportedProtocolVersions': [2]})
    assert response['ok'] == True
    assert response['result']['device'] == 'MITTEN'
    assert response['result']['protocolVersion'] == 2
    assert 'maxMessageBytes' in response['result']['capabilities']

def test_handshake_invalid_client():
    fw = Firmware()
    fw.startup()
    response = fw.handle_handshake('req-1', {'client': 'WRONG', 'supportedProtocolVersions': [2]})
    assert response['ok'] == False
    assert response['error']['code'] == 'INVALID_PAYLOAD'

def test_handshake_incompatible_version():
    fw = Firmware()
    fw.startup()
    response = fw.handle_handshake('req-1', {'client': 'MITTEN_WEB', 'supportedProtocolVersions': [99]})
    assert response['ok'] == True  # Still responds ok
    assert response['result']['protocolVersion'] == 2  # But reports v2
    assert fw.handshake_compatible == False  # Frontend should detect incompatibility

def test_status_after_handshake():
    fw = Firmware()
    fw.startup()
    fw.handle_handshake('hs-1', {'client': 'MITTEN_WEB', 'supportedProtocolVersions': [2]})
    status = fw.handle_status('req-2')
    assert status['result']['state'] == 'IDLE'
    assert status['result']['activeProfile'] is None
    assert status['result']['activeSync'] is None
    assert status['result']['error'] is None

def test_commands_before_handshake():
    fw = Firmware()
    fw.startup()
    # Don't do handshake
    response = fw.handle_status('req-1')
    assert response['ok'] == False
    assert response['error']['code'] == 'HANDSHAKE_REQUIRED'
```

- [ ] **Step 1: Write failing tests in `test_handshake.py` and `test_status.py`**
- [ ] **Step 2: Run tests, verify they fail**
- [ ] **Step 3: Implement `commands.py` with `Firmware` class**
- [ ] **Step 4: Run tests, verify they pass**
- [ ] **Step 5: Compare behavior with simulator expectations**
- [ ] **Step 6: Verify MicroPython compatibility**

```bash
python -m py_compile protocol/commands.py
```

---

## Task 6: Error Handler

**Files:**
- Create: `firmware/esp32/error/handler.py`
- Create: `firmware/esp32/tests/test_error_handling.py`

**Interfaces:**
- Consumes: `ProtocolErrorCode` from `config`, envelope builders from `protocol/envelopes`
- Produces: `class ErrorHandler`:
  - `make_error_response(request_id: str, code, message, details=None) -> dict`
  - `make_unhandled_error(code, message) -> dict` — emits `protocol.error` event
  - `parse_error_to_code(parse_error_type) -> ProtocolErrorCode`

```python
# Test expectations
def test_invalid_json_error():
    response = ErrorHandler.make_error_response('req-1', ProtocolErrorCode.INVALID_JSON, 'Bad JSON')
    assert response['ok'] == False
    assert response['error']['code'] == 'INVALID_JSON'

def test_message_too_large():
    response = ErrorHandler.make_error_response('req-1', ProtocolErrorCode.MESSAGE_TOO_LARGE, 'Frame too large')
    assert response['error']['code'] == 'MESSAGE_TOO_LARGE'

def test_unknown_command():
    fw = Firmware()
    fw.handle_handshake('hs-1', {'client': 'MITTEN_WEB', 'supportedProtocolVersions': [2]})
    response = fw.handle_request({'v': 2, 'type': 'request', 'id': 'req-1', 'command': 'device.fly', 'payload': {}})
    assert response['ok'] == False
    assert response['error']['code'] == 'UNKNOWN_COMMAND'
```

- [ ] **Step 1: Write failing tests in `test_error_handling.py`**
- [ ] **Step 2: Run tests, verify they fail**
- [ ] **Step 3: Implement `handler.py`**
- [ ] **Step 4: Run tests, verify they pass**
- [ ] **Step 5: Verify MicroPython compatibility**

```bash
python -m py_compile error/handler.py
```

---

## Task 7: Main Entry Point

**Files:**
- Create: `firmware/esp32/main.py`

**Interfaces:**
- Consumes: `Firmware` from `protocol/commands`, `NdjsonParser` from `protocol/framing`, envelope serializers from `protocol/envelopes`
- Produces: `main()` — sets up UART, runs the main loop. In CPython test environment, `main_loop` should be importable and testable with a mock UART.

```python
# Main loop structure (pseudo-code)
def main_loop(uart=None):
    """Non-blocking main loop. uart is a mock in tests, real UART in firmware."""
    firmware = Firmware()
    firmware.startup()  # Emits INITIALIZING → CALIBRATING → IDLE
    parser = NdjsonParser()
    
    while True:
        if uart:
            chunk = uart.read()  # non-blocking
            if chunk:
                result = parser.push(chunk)
                for frame in result.frames:
                    response = firmware.handle_request(frame)
                    if response:
                        uart.write(serialize_envelope(response))
                for error in result.errors:
                    # Emit protocol.error event
                    pass
        # uasyncio.sleep_ms(1) to yield
```

Tests should verify the main loop processes requests from a mock UART and emits correct responses.

```python
# Test in test_main.py (in tests/)
def test_main_loop_handshake():
    uart = MockUART()
    uart.inject_line('{"v":2,"type":"request","id":"req-1","command":"device.handshake","payload":{"client":"MITTEN_WEB","supportedProtocolVersions":[2]}}')
    
    # Run one iteration
    responses = []
    firmware_loop = main_loop(uart, emit_callback=responses.append)
    
    # Should have state events + handshake response
    assert len(responses) >= 2
    handshake_resp = [r for r in responses if r.get('type') == 'response' and r.get('id') == 'req-1']
    assert len(handshake_resp) == 1
    assert handshake_resp[0]['ok'] == True
```

- [ ] **Step 1: Create `main.py` with importable, testable main_loop**
- [ ] **Step 2: Write test for main loop**
- [ ] **Step 3: Run tests, verify pass**
- [ ] **Step 4: Verify py_compile**

```bash
python -m py_compile main.py
```

---

## Task 8: Integration and Validation

**Files:**
- Verify all files compile

**Steps:**

- [ ] **Step 1: Run full test suite**

```bash
cd firmware/esp32
python -m pytest -q
```
Expected: All tests green (≈30+ tests across framing, envelopes, state machine, handshake, status, error handling, main loop).

- [ ] **Step 2: Verify py_compile on all Python files**

```bash
python -m py_compile main.py config.py
python -m py_compile protocol/framing.py protocol/envelopes.py protocol/commands.py
python -m py_compile statemachine/states.py statemachine/machine.py
python -m py_compile error/handler.py
```

- [ ] **Step 3: Compare key behaviors with simulator**
- Verify handshake response matches: `device == "MITTEN"`, `protocolVersion == 2`, `state` starts as `"IDLE"` after startup, `capabilities.maxMessageBytes == 8192`
- Verify status response includes `state`, `activeProfile`, `activeSync`, `error`
- Verify state machine transitions emit `device.state` events

- [ ] **Step 4: Final directory structure verification**

Expected structure:
```
firmware/esp32/
├── main.py
├── config.py
├── protocol/
│   ├── __init__.py
│   ├── framing.py
│   ├── envelopes.py
│   └── commands.py
├── statemachine/
│   ├── __init__.py
│   ├── states.py
│   └── machine.py
├── error/
│   ├── __init__.py
│   └── handler.py
└── tests/
    ├── __init__.py
    ├── test_framing.py
    ├── test_envelopes.py
    ├── test_state_machine.py
    ├── test_handshake.py
    ├── test_status.py
    ├── test_error_handling.py
    └── test_main.py
```

- [ ] **Step 5: Clean up** — ensure no `__pycache__` or `.pytest_cache` in committed files

---

## MicroPython Compatibility Notes

All modules must work on both CPython 3.11+ (for testing) and MicroPython:
- No `dataclasses` — use plain classes/dicts
- No `typing` module imports — use inline comments or no type hints in MicroPython
- No `pathlib` — use string paths or no file I/O in modules
- `json` module is available in both
- `sys` module is available in both
- `ubinascii` on MicroPython vs `binascii` on CPython — use try/except import
- String formatting: use `%` or `.format()` not f-strings (f-strings work in modern MicroPython but check compatibility)
- `set()` is available in MicroPython
- `bytearray` and `bytes` are available in both
