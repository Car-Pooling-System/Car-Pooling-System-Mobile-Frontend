import { Redirect } from "expo-router";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { ActivityIndicator, View } from "react-native";

export default function Index() {
    const { isSignedIn, isLoaded } = useAuth();
    const { user } = useUser();

    if (!isLoaded) {
        return (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    if (isSignedIn && user?.unsafeMetadata?.role === "driver") {
        return <Redirect href="/(app)/my-rides" />;
    }

    if (isSignedIn && user?.unsafeMetadata?.role === "rider") {
        return <Redirect href="/(rider)/search" />;
    }

    return <Redirect href="/(auth)/sign-in" />;
}
