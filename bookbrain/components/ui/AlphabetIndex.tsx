import { useRef, useCallback } from "react";
import { View, Text, StyleSheet, PanResponder } from "react-native";

interface AlphabetIndexProps {
  letters: string[];
  activeLetter?: string;
  onSelect: (letter: string) => void;
}

export function AlphabetIndex({ letters, activeLetter, onSelect }: AlphabetIndexProps) {
  const containerRef = useRef<View>(null);
  const layoutRef = useRef({ y: 0, height: 0 });

  const getLetterFromY = useCallback(
    (pageY: number) => {
      const { y, height } = layoutRef.current;
      if (height === 0 || letters.length === 0) return null;
      const relY = pageY - y;
      const idx = Math.min(
        letters.length - 1,
        Math.max(0, Math.floor((relY / height) * letters.length))
      );
      return letters[idx];
    },
    [letters]
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const letter = getLetterFromY(e.nativeEvent.pageY);
        if (letter) onSelect(letter);
      },
      onPanResponderMove: (e) => {
        const letter = getLetterFromY(e.nativeEvent.pageY);
        if (letter) onSelect(letter);
      },
    })
  ).current;

  if (letters.length === 0) return null;

  return (
    <View
      ref={containerRef}
      style={ai.container}
      onLayout={(e) => {
        containerRef.current?.measureInWindow((_x, y, _w, h) => {
          layoutRef.current = { y, height: h };
        });
      }}
      {...panResponder.panHandlers}
    >
      {letters.map((letter) => (
        <View key={letter} style={ai.letterWrap}>
          <Text
            style={[
              ai.letter,
              activeLetter === letter && ai.letterActive,
            ]}
          >
            {letter}
          </Text>
        </View>
      ))}
    </View>
  );
}

const ai = StyleSheet.create({
  container: {
    position: "absolute",
    right: 2,
    top: 0,
    bottom: 0,
    width: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    zIndex: 10,
  },
  letterWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 14,
  },
  letter: {
    color: "#555",
    fontSize: 9,
    fontWeight: "700",
    textAlign: "center",
  },
  letterActive: {
    color: "#818cf8",
    fontSize: 10,
    fontWeight: "800",
  },
});
