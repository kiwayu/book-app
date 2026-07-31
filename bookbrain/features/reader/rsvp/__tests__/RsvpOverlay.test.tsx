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

  it("tells the parent once when the chapter finishes, and mounts the next one paused", () => {
    const onFinish = jest.fn();
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <RsvpOverlay
          tokens={tokens}
          initialWpm={300}
          colors={colors}
          onFinish={onFinish}
          onClose={() => {}}
        />
      );
    });

    press(r, "rsvp-playpause");
    clock = 1200; // past "delta"'s paragraph-end pause (cumEnd ≈ 1160)
    flushFrame();
    expect(onFinish).toHaveBeenCalledTimes(1);

    // The parent answers by remounting with the next chapter's tokens — a fresh
    // mount is the "paused at the first word" state the user asked for.
    const next = tokenizeParagraphs(["epsilon zeta"]);
    let r2!: ReactTestRenderer;
    act(() => {
      r2 = create(
        <RsvpOverlay
          tokens={next}
          initialWpm={300}
          colors={colors}
          onFinish={onFinish}
          onClose={() => {}}
        />
      );
    });
    expect(word(r2)).toBe("epsilon");
    clock = 5000;
    flushFrame(); // no rAF scheduled while paused → still the first word
    expect(word(r2)).toBe("epsilon");
  });

  /* ── chapter transition ─────────────────────────────
     The label is held in the word slot rather than on a card: RSVP's premise
     is that the eye never moves, so a new surface at the chapter boundary
     would break the one thing the feature is for. */

  function slot(r: ReactTestRenderer): string {
    return r.root.findByProps({ testID: "rsvp-slot" }).props.children;
  }

  it("holds the chapter label in the word slot, then resumes on its own", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <RsvpOverlay
          tokens={tokens}
          initialWpm={300}
          introLabel="Chapter 2 — The Return"
          colors={colors}
          onClose={() => {}}
        />
      );
    });

    // The label occupies the word slot; no focus word is rendered yet.
    expect(slot(r)).toBe("Chapter 2 — The Return");
    expect(() => r.root.findByProps({ testID: "rsvp-focus" })).toThrow();

    // 6 word slots at 300 WPM = 1200ms.
    clock = 1300;
    flushFrame();

    expect(word(r)).toBe("alpha"); // resumed at the first word
    expect(() => r.root.findByProps({ testID: "rsvp-slot" })).toThrow();
  });

  it("stays put when tapped during the intro instead of resuming", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <RsvpOverlay
          tokens={tokens}
          initialWpm={300}
          introLabel="Chapter 2"
          colors={colors}
          onClose={() => {}}
        />
      );
    });

    press(r, "rsvp-stage"); // "Tap to stay here"

    clock = 5000;
    flushFrame(); // the hold would long since have elapsed

    // Paused on the first word, not playing.
    expect(word(r)).toBe("alpha");
    clock = 9000;
    flushFrame();
    expect(word(r)).toBe("alpha");
  });

  it("says it is fetching the next chapter rather than claiming to be finished", () => {
    // The old behaviour showed "Finished — tap restart" during the async spine
    // walk, and the restart button replayed the chapter just completed.
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <RsvpOverlay
          tokens={tokens}
          initialWpm={300}
          advancing
          colors={colors}
          onClose={() => {}}
        />
      );
    });

    expect(slot(r)).toBe("Next chapter…");
    expect(r.root.findByProps({ testID: "rsvp-playpause" }).props.disabled).toBe(
      true
    );
  });

  it("marks the end of a book in the word slot, with a way back", () => {
    const onBackToChapter = jest.fn();
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <RsvpOverlay
          tokens={tokens}
          initialWpm={300}
          endOfBook
          bookTitle="Dune"
          onBackToChapter={onBackToChapter}
          colors={colors}
          onClose={() => {}}
        />
      );
    });

    expect(slot(r)).toBe("You finished Dune");
    press(r, "rsvp-back-chapter");
    expect(onBackToChapter).toHaveBeenCalled();
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
