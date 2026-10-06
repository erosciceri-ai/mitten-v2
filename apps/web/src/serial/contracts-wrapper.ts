// Wrapper to re-export CommonJS modules from @mitten/contracts as ES modules
import type { ProtocolEnvelope, ParseResult, ParseError } from '@mitten/contracts';
import * as protocol from '@mitten/contracts/protocol';

export type { ProtocolEnvelope, ParseResult, ParseError };
export type NdjsonParser = protocol.NdjsonParser;
export const NdjsonParser = protocol.NdjsonParser;
export const serializeFrame = protocol.serializeFrame;
export const FRAME_DELIMITER = protocol.FRAME_DELIMITER;
export const FRAME_DELIMITER_BYTE = protocol.FRAME_DELIMITER_BYTE;
export const CR_BYTE = protocol.CR_BYTE;
export const BOOTSTRAP_MAX_MESSAGE_BYTES = protocol.BOOTSTRAP_MAX_MESSAGE_BYTES;
export const parseFrames = protocol.parseFrames;
export const encodeUtf8 = protocol.encodeUtf8;
export const decodeUtf8 = protocol.decodeUtf8;
export const utf8ByteLength = protocol.utf8ByteLength;
export const serializeFrames = protocol.serializeFrames;