import { Stack } from "expo-router";

export default function MyRidesLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="details" />
        </Stack>
    );
}
