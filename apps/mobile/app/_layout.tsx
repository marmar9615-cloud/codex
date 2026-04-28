import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ProjectProvider } from "@/project/ProjectContext";

export default function RootLayout() {
  return (
    <ProjectProvider>
      <Stack
        screenOptions={{
          headerLargeTitle: true,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: "#f8fafc" },
        }}
      />
      <StatusBar style="auto" />
    </ProjectProvider>
  );
}
