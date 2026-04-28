import { Text, View } from "react-native";
import { colors, spacing } from "@/theme";

type StatusPillProps = {
  label: string;
  tone?: "ready" | "muted" | "warning" | "danger";
};

export function StatusPill({ label, tone = "muted" }: StatusPillProps) {
  const palette =
    tone === "ready"
      ? { backgroundColor: colors.accentSoft, color: colors.accent }
      : tone === "warning"
        ? { backgroundColor: colors.warningSoft, color: colors.warning }
        : tone === "danger"
          ? { backgroundColor: colors.dangerSoft, color: colors.danger }
          : { backgroundColor: colors.surfaceAlt, color: colors.muted };

  return (
    <View
      style={{
        alignSelf: "flex-start",
        borderRadius: 999,
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
        backgroundColor: palette.backgroundColor,
      }}
    >
      <Text style={{ color: palette.color, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}
