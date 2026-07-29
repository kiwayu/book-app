/*
 * Integration test for the RSVP overlay: mounts the real component and
 * drives it through a play loop with a controlled clock + rAF, proving the
 * engine → state → rendered-word wiring works end to end (the device-level
 * Maestro journey for this is deferred — see TODOS.md #4).
 */
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import RsvpOverlay from "../RsvpOverlay";
import { tokenizeParagraphs } from "../engine";

const colors = {
  bg: "#fff",
  fg: "#000",
  sub: "#888",
  accent: "#3f82bc",
  barBg: "#eee",
  border: "#ddd",
};

// "alpha beta gamma delta" at 300 WPM => 200ms per plain word.
// "delta" is the paragraph end (2.8x). cumEnd ≈ [200, 400, 600, 1160].
const tokens = tokenizeParagraphs(["alpha beta gamma delta"]);

let clock = 0;
let rafCbs: FrameRequestCallback[] = [];

beforeEach(() => {
  clock = 0;
  rafCbs = [];
  jest.spyOn(Date, "now").mockImplementation(() => clock);
  global.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    rafCbs.push(cb);
    return rafCbs.length;
  }) as typeof requestAnimationFrame;
  global.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;
});

afterEach(() => jest.restoreAllMocks());

function flushFrame() {
  const cbs = rafCbs;
  rafCbs = [];
  act(() => {
    cbs.forEach((cb) => cb(clock));
  });
}

function word(r: ReactTestRenderer): string {
  return r.root.findByProps({ testID: "rsvp-word" }).props.accessibilityLabel;
}

function press(r: ReactTestRenderer, testID: string) {
  act(() => {
    r.root.findByProps({ testID }).props.onPress();
  });
}

describe("RsvpOverlay", () => {
  it("shows the first word, paused, on mount", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <RsvpOverlay
          tokens={tokens}
          initialWpm={300}
          colors={colors}
          onClose={() => {}}
        />
      );
    });
    expect(word(r)).toBe("alpha");
  });

  it("advances through words as the clock runs while playing", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <RsvpOverlay
          tokens={tokens}
          initialWpm={300}
          colors={colors}
          onClose={() => {}}
        />
      );
    });

    press(r, "rsvp-playpause"); // start playing from index 0
    expect(word(r)).toBe("alpha");

    clock = 210; // past word 0's 200ms end
    flushFrame();
    expect(word(r)).toBe("beta");

    clock = 410; // past word 1
    flushFrame();
    expect(word(r)).toBe("gamma");

    clock = 610; // past word 2
    flushFrame();
    expect(word(r)).toBe("delta");
  });

  it("resumes from a saved word index", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <RsvpOverlay
          tokens={tokens}
          initialWpm={300}
          startIndex={2}
          colors={colors}
          onClose={() => {}}
        />
      );
    });
    expect(word(r)).toBe("gamma");
  });

  it("reports the last index reached when closed", () => {
    const onClose = jest.fn();
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <RsvpOverlay
          tokens={tokens}
          initialWpm={300}
          colors={colors}
          onClose={onClose}
        />
      );
    });

    press(r, "rsvp-playpause");
    clock = 410;
    flushFrame(); // now on "gamma" (index 2)
    press(r, "rsvp-close");

    expect(onClose).toHaveBeenCalledWith(2);
  });

  it("emits WPM changes to the parent", () => {
    const onWpmChange = jest.fn();
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <RsvpOverlay
          tokens={tokens}
          initialWpm={300}
          colors={colors}
          onWpmChange={onWpmChange}
          onClose={() => {}}
        />
      );
    });

    // Press the "+" stepper: 300 -> 325.
    press(r, "rsvp-wpm-inc");
    expect(onWpmChange).toHaveBeenCalledWith(325);
  });

  it("auto-shrinks the focus word so it is never truncated or ellipsised", () => {
    const longTokens = tokenizeParagraphs([
      "supercalifragilisticexpialidocious",
    ]);
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <RsvpOverlay
          tokens={longTokens}
          initialWpm={300}
          colors={colors}
          onClose={() => {}}
        />
      );
    });
    const focus = r.root.findByProps({ testID: "rsvp-focus" });
    // scale-to-fit + single line == shrinks instead of clipping/ellipsising
    expect(focus.props.adjustsFontSizeToFit).toBe(true);
    expect(focus.props.numberOfLines).toBe(1);
  });

  it("handles an empty chapter without crashing", () => {
    const onClose = jest.fn();
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <RsvpOverlay
          tokens={[]}
          initialWpm={300}
          colors={colors}
          onClose={onClose}
        />
      );
    });
    // Empty-state renders its own close affordance; pressing it reports -? safely.
    expect(() => word(r)).toThrow(); // no word node in empty state
  });
});
