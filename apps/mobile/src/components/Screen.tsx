import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { spacing } from "@/theme";

type ScreenProps = {
  children: ReactNode;
};

export function Screen({ children }: ScreenProps) {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
    >
      <View style={{ gap: spacing.lg }}>{children}</View>
    </ScrollView>
  );
}
