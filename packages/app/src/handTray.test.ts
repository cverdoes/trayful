import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clampHandHeight,
  HAND_HEIGHT,
  handCardHeight,
  loadHandHeight,
  loadHandMinimized,
  saveHandHeight,
} from './handTray';
import { handTrayHeight, toggleHandTray } from './hand';
import { useStore } from './store';

function fakeStorage(): Storage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  } as Storage;
}

afterEach(() => vi.unstubAllGlobals());

describe('clampHandHeight', () => {
  it('keeps the tray between its smallest size and most of the window', () => {
    expect(clampHandHeight(200.4, 1000)).toBe(200);
    expect(clampHandHeight(10, 1000)).toBe(80);
    expect(clampHandHeight(900, 1000)).toBe(400);
    expect(clampHandHeight(390, 500)).toBe(300);
  });

  it('still leaves room for a card in a tiny window', () => {
    expect(clampHandHeight(300, 100)).toBe(80);
  });
});

it('draws cards to fill the tray', () => {
  expect(handCardHeight(HAND_HEIGHT)).toBe(92);
});

describe('remembering the height', () => {
  it('uses the default until a height is saved', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    expect(loadHandHeight()).toBe(HAND_HEIGHT);
    saveHandHeight(240);
    expect(loadHandHeight()).toBe(240);
  });

  it('ignores a saved height that is out of range or not a number', () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    storage.setItem('trayful.handHeight', '5000');
    expect(loadHandHeight()).toBe(400);
    storage.setItem('trayful.handHeight', 'tall');
    expect(loadHandHeight()).toBe(HAND_HEIGHT);
  });

  it('falls back to the default when storage is switched off', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    vi.stubGlobal('localStorage', broken);
    expect(() => saveHandHeight(200)).not.toThrow();
    expect(loadHandHeight()).toBe(HAND_HEIGHT);
  });
});

describe('shrinking the tray to a bubble', () => {
  it('toggles, frees the bottom of the screen and is remembered', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    useStore.setState({ handMinimized: false, handHeight: 200 });
    expect(loadHandMinimized()).toBe(false);
    expect(handTrayHeight()).toBe(200);

    toggleHandTray();
    expect(useStore.getState().handMinimized).toBe(true);
    expect(handTrayHeight()).toBe(0);
    expect(loadHandMinimized()).toBe(true);

    toggleHandTray();
    expect(handTrayHeight()).toBe(200);
    expect(loadHandMinimized()).toBe(false);
  });
});
