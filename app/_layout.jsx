import { ClerkProvider } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { Slot } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { useFonts } from "expo-font";
import tw from "twrnc";
import { SocketProvider } from "../context/SocketContext";

export default function RootLayout() {
    const [fontsLoaded] = useFonts({
        ionicons: require("../assets/fonts/Ionicons.ttf"),
    });

    if (!fontsLoaded) return null;

    return (
        <ClerkProvider
            publishableKey={Constants.expoConfig?.extra?.clerkPublishableKey}
            tokenCache={tokenCache}
        >
            <SocketProvider>
                <SafeAreaView style={tw`flex-1 bg-white`}>
                    <Slot />
                </SafeAreaView>
            </SocketProvider>
        </ClerkProvider>
    );
}
