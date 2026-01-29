import { useSSO } from "@clerk/clerk-expo";
import * as AuthSession from "expo-auth-session";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useWarmUpBrowser } from "../../hooks/useWarmUpBrowser";
import { useState, useCallback } from "react";
import tw from "twrnc";

export default function SignIn() {
    useWarmUpBrowser();
    const { startSSOFlow } = useSSO();
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const redirectUrl = AuthSession.makeRedirectUri();

    const handleOAuth = useCallback(
        async (strategy) => {
            if (loading) return;
            setLoading(true);

            try {
                const { createdSessionId, setActive } = await startSSOFlow({
                    strategy,
                    redirectUrl,
                });

                if (createdSessionId) {
                    await setActive({ session: createdSessionId });
                    router.replace("/(app)/explore");
                }
            } catch (err) {
                console.error("OAuth error", err);
            } finally {
                setLoading(false);
            }
        },
        [loading]
    );

    return (
        <View style={tw`flex-1 justify-center items-center px-6 bg-white`}>
            <Text style={tw`text-2xl font-semibold mb-8`}>Sign In</Text>

            {loading && <ActivityIndicator style={tw`mb-4`} />}

            <TouchableOpacity
                style={tw`w-full py-3 rounded-xl bg-red-500 mb-4`}
                onPress={() => handleOAuth("oauth_google")}
            >
                <Text style={tw`text-white text-center font-semibold`}>
                    Continue with Google
                </Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={tw`w-full py-3 rounded-xl bg-neutral-900`}
                onPress={() => handleOAuth("oauth_github")}
            >
                <Text style={tw`text-white text-center font-semibold`}>
                    Continue with GitHub
                </Text>
            </TouchableOpacity>
        </View>
    );
}
