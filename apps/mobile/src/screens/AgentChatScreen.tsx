import { Stack } from "expo-router";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { ActionButton } from "@/components/ActionButton";
import { Screen } from "@/components/Screen";
import { StatusPill } from "@/components/StatusPill";
import { colors, spacing } from "@/theme";

type ChatMessage = {
  role: "user" | "agent";
  text: string;
};

export function AgentChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "agent", text: "Runner connection is stubbed. Streaming UI is ready for events." },
  ]);
  const [draft, setDraft] = useState("Summarize the current diff.");

  return (
    <>
      <Stack.Screen options={{ title: "Agent" }} />
      <Screen>
        <StatusPill label="Streaming shell" tone="warning" />
        <View style={{ gap: spacing.sm }}>
          {messages.map((message, index) => (
            <View
              key={`${message.role}-${index}`}
              style={{
                alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "92%",
                backgroundColor: message.role === "user" ? colors.accent : colors.surface,
                borderColor: colors.border,
                borderWidth: message.role === "user" ? 0 : 1,
                borderRadius: 8,
                padding: spacing.md,
              }}
            >
              <Text selectable style={{ color: message.role === "user" ? "#ffffff" : colors.text, lineHeight: 20 }}>
                {message.text}
              </Text>
            </View>
          ))}
        </View>
        <TextInput
          multiline
          value={draft}
          onChangeText={setDraft}
          style={{
            minHeight: 96,
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 8,
            padding: spacing.md,
            color: colors.text,
            textAlignVertical: "top",
          }}
        />
        <ActionButton
          tone="primary"
          onPress={() => {
            setMessages((current) => [
              ...current,
              { role: "user", text: draft },
              { role: "agent", text: "Queued for the remote runner stream." },
            ]);
            setDraft("");
          }}
        >
          Send
        </ActionButton>
      </Screen>
    </>
  );
}
