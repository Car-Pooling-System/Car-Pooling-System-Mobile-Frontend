import { Stack } from "expo-router";

export default function RiderChatLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="room" />
        </Stack>
    );
}
