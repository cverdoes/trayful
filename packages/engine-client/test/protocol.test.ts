import type * as core from '@trayful/core';
import { describe, expect, it } from 'vitest';
import type * as engine from '../src/protocol.js';

/** `true` only when each type can stand for the other. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** `true` when every `A` is a `B`. */
type Fits<A, B> = [A] extends [B] ? true : false;

/**
 * The published client spells out the protocol so it needs no other package. These
 * checks fail to compile (in `pnpm typecheck`) when it drifts from the server's.
 */
const checks = {
  piece: true satisfies Same<core.Piece, engine.Piece>,
  stack: true satisfies Same<core.Stack, engine.Stack>,
  view: true satisfies Same<core.TableView, engine.TableView>,
  command: true satisfies Same<core.Command, engine.Command>,
  prompt: true satisfies Same<core.PromptRequest, engine.PromptRequest>,
  asked: true satisfies Same<core.PlayerPrompt, engine.PlayerPrompt>,
  answer: true satisfies Same<core.PromptAnswer, engine.PromptAnswer>,
  event: true satisfies Same<core.TableEvent, engine.TableEvent>,
  player: true satisfies Same<core.PlayerInfo, engine.PlayerInfo>,
  activity: true satisfies Same<core.Activity, engine.Activity>,
  // What the engine sends the server takes; what the server sends the engine reads.
  sent: true satisfies Fits<engine.EngineMessage, core.ClientMessage>,
  heard: true satisfies Fits<core.ServerMessage, engine.TableMessage>,
};

describe('the engine protocol', () => {
  it('matches the server', () => {
    expect(Object.values(checks).every(Boolean)).toBe(true);
  });
});
