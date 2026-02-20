import { Redirect, Stack } from "expo-router";
import { useAuth, useUser } from "@clerk/clerk-expo";

export default function AuthLayout() {
    const { isSignedIn, isLoaded } = useAuth();
    const { user } = useUser();

    if (!isLoaded) return null;

    if (isSignedIn && user?.unsafeMetadata?.role === "driver") {
        return <Redirect href="/(app)/my-rides" />;
    }

    if (isSignedIn && user?.unsafeMetadata?.role === "rider") {
        return <Redirect href="/(rider)/search" />;
    }

    // No role yet — let the Stack render (sign-in useEffect navigates to role-select)
    return <Stack screenOptions={{ headerShown: false }} />;
}
