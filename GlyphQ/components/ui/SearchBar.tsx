import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { t } from "@/theme";
import { IconSymbol } from "@/components/ui/icon-symbol";

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = "Search…",
  onSubmit,
}: SearchBarProps) {
  return (
    <View style={sb.root}>
      <IconSymbol name="magnifyingglass" size={14} color={t.color.text.muted} style={sb.icon} />
      <TextInput
        style={sb.input}
        placeholder={placeholder}
        placeholderTextColor={t.color.text.muted}
        value={value}
        onChangeText={onChangeText}
        returnKeyType="search"
        autoCorrect={false}
        onSubmitEditing={onSubmit}
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText("")} hitSlop={8}>
          <Text style={sb.clear}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}

const sb = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: t.color.bg.raised,
    borderRadius: t.radius.xl,
    borderWidth: 1,
    borderColor: t.color.border.default,
    paddingHorizontal: t.space._3,
    height: 42,
  },
  icon: {
    marginRight: t.space._2,
  },
  input: {
    flex: 1,
    ...t.font.body,
    color: t.color.text.primary,
    paddingVertical: 0,
  },
  clear: {
    color: t.color.text.muted,
    fontSize: 14,
    fontWeight: "600",
    paddingLeft: t.space._2,
  },
});
