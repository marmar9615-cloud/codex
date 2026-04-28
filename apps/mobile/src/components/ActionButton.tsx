import type { ReactNode } from "react";
import { Pressable, Text } from "react-native";
import { colors, spacing } from "@/theme";

type ActionButtonProps = {
  children: ReactNode;
  onPress?: () => void;
  tone?: "primary" | "secondary" | "danger";
};

export function ActionButton({ children, onPress, tone = "secondary" }: ActionButtonProps) {
  const backgroundColor =
    tone === "primary" ? colors.accent : tone === "danger" ? colors.danger : colors.surfaceAlt;
  const color = tone === "secondary" ? colors.text : "#ffffff";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        borderRadius: 8,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor,
        borderWidth: tone === "secondary" ? 1 : 0,
        borderColor: colors.border,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <Text style={{ color, fontWeight: "700" }}>{children}</Text>
    </Pressable>
  );
}
