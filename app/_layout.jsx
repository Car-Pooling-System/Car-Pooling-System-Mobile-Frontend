import { ClerkProvider } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { Slot } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import tw from "twrnc";

export default function RootLayout() {
    return (
        <ClerkProvider
            publishableKey={Constants.expoConfig?.extra?.clerkPublishableKey}
            tokenCache={tokenCache}
        >
            <SafeAreaView style={tw`flex-1 bg-white`}>
                <Slot />
            </SafeAreaView>
        </ClerkProvider>
    );
}
