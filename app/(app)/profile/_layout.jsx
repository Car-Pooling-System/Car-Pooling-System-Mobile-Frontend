import { Stack } from "expo-router";
import { useColorScheme } from "react-native";
import { theme } from "../../../constants/Colors";

export default function ProfileLayout() {
    const scheme = useColorScheme();
    const colors = theme[scheme ?? "light"];

    return (
        <Stack
            screenOptions={{
                headerShown: false,
            }}
        >
            {/* Profile main page – NO header */}
            <Stack.Screen
                name="index"
                options={{
                    headerShown: false,
                }}
            />

            {/* Edit page – HEADER + BACK BUTTON */}
            <Stack.Screen
                name="edit"
                options={{
                    headerShown: false,

                }}
            />
        </Stack>
    );
}
