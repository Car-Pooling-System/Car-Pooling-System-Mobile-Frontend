import { useSSO } from "@clerk/clerk-expo";
import * as AuthSession from "expo-auth-session";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useWarmUpBrowser } from "../../hooks/useWarmUpBrowser";
import { useCallback, useState } from "react";
import tw from "twrnc";

export default function SignUp() {
    useWarmUpBrowser();

    const { startSSOFlow } = useSSO();
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const redirectUrl = AuthSession.makeRedirectUri();

    const handleOAuth = useCallback(
        async (strategy) => {
            if (loading) return;
            setLoading(true);
            setError("");

            try {
                const { createdSessionId, setActive } = await startSSOFlow({
                    strategy,
                    redirectUrl,
                });

                if (createdSessionId) {
                    await setActive({ session: createdSessionId });
                    router.replace("/(app)/explore");
                } else {
                    setError("Sign up failed. Please try again.");
                }
            } catch (err) {
                console.error("OAuth SignUp Error:", err);
                setError("Something went wrong. Please try again.");
            } finally {
                setLoading(false);
            }
        },
        [loading]
    );

    return (
        <View style={tw`flex-1 justify-center items-center px-6 bg-white`}>
            <Text style={tw`text-2xl font-semibold mb-2`}>
                Create Account
            </Text>

            <Text style={tw`text-gray-500 mb-8 text-center`}>
                Sign up to continue
            </Text>

            {error ? (
                <Text style={tw`text-red-500 mb-4 text-center`}>
                    {error}
                </Text>
            ) : null}

            {loading && (
                <ActivityIndicator size="large" style={tw`mb-4`} />
            )}

            <TouchableOpacity
                style={tw`w-full py-3 rounded-xl bg-red-500 mb-4`}
                onPress={() => handleOAuth("oauth_google")}
                disabled={loading}
            >
                <Text style={tw`text-white text-center font-semibold`}>
                    Sign Up with Google
                </Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={tw`w-full py-3 rounded-xl bg-neutral-900`}
                onPress={() => handleOAuth("oauth_github")}
                disabled={loading}
            >
                <Text style={tw`text-white text-center font-semibold`}>
                    Sign Up with GitHub
                </Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={tw`mt-8`}
                onPress={() => router.push("/(auth)/sign-in")}
            >
                <Text style={tw`text-indigo-500`}>
                    Already have an account? Sign in
                </Text>
            </TouchableOpacity>
        </View>
    );
}
