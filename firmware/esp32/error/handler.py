"""Structured Protocol V2 error conversion."""

from config import (
    ERR_INCOMPLETE_MESSAGE,
    ERR_INTERNAL_ERROR,
    ERR_INVALID_JSON,
    ERR_INVALID_MESSAGE,
    ERR_MESSAGE_TOO_LARGE,
)
from protocol.envelopes import (
    build_error_response,
    build_protocol_error_event,
    is_valid_request_id,
)


class ProtocolException(Exception):
    def __init__(self, code, message, details=None):
        Exception.__init__(self, message)
        self.code = code
        self.message = message
        self.details = details


class ErrorHandler:
    _PARSE_CODE_MAP = {
        "INVALID_JSON": ERR_INVALID_JSON,
        "MESSAGE_TOO_LARGE": ERR_MESSAGE_TOO_LARGE,
        "INCOMPLETE_MESSAGE": ERR_INCOMPLETE_MESSAGE,
        "INVALID_UTF8": ERR_INVALID_MESSAGE,
        "INVALID_MESSAGE": ERR_INVALID_MESSAGE,
    }

    @classmethod
    def from_parse_error(cls, parse_error):
        error_type = parse_error.get("type", "INVALID_MESSAGE")
        code = cls._PARSE_CODE_MAP.get(error_type, ERR_INVALID_MESSAGE)
        message = parse_error.get("message") or "Invalid protocol frame"
        return build_protocol_error_event(code, message)

    @staticmethod
    def from_exception(exception, request_id=None):
        if isinstance(exception, ProtocolException):
            code = exception.code
            message = exception.message
            details = exception.details
        else:
            code = ERR_INTERNAL_ERROR
            message = "Unexpected internal firmware error"
            details = None

        if is_valid_request_id(request_id):
            return build_error_response(request_id, code, message, details)
        return build_protocol_error_event(code, message, details)
