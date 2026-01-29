import { Redirect, Stack } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";

export default function AuthLayout() {
    const { isSignedIn, isLoaded } = useAuth();

    if (!isLoaded) return null;

    if (isSignedIn) {
        return <Redirect href="/(app)/explore" />;
    }

    return <Stack screenOptions={{ headerShown: false }} />;
}
