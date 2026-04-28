import type { ReactNode } from "react";
import { Pressable, Text } from "react-native";
import { colors, spacing } from "@/theme";

type ActionButtonProps = {
  children: ReactNode;
  onPress?: () => void;
  tone?: "primary" | "secondary" | "danger";
  disabled?: boolean;
};

export function ActionButton({ children, onPress, tone = "secondary", disabled = false }: ActionButtonProps) {
  const backgroundColor =
    tone === "primary" ? colors.accent : tone === "danger" ? colors.danger : colors.surfaceAlt;
  const color = tone === "secondary" ? colors.text : "#ffffff";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
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
        opacity: disabled ? 0.45 : pressed ? 0.72 : 1,
      })}
    >
      <Text style={{ color, fontWeight: "700" }}>{children}</Text>
    </Pressable>
  );
}
