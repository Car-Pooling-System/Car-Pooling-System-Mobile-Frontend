import { useSSO, useUser } from "@clerk/clerk-expo";
import * as AuthSession from "expo-auth-session";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useWarmUpBrowser } from "../../hooks/useWarmUpBrowser";
import { useState, useCallback, useEffect } from "react";
import tw from "twrnc";
import { Ionicons } from "@expo/vector-icons";

const BACKEND_URL = process.env.EXPO_BACKEND_URL;

export default function SignIn() {
    useWarmUpBrowser();
    const { startSSOFlow } = useSSO();
    const { user, isSignedIn } = useUser();
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const redirectUrl = AuthSession.makeRedirectUri();

    useEffect(() => {
        const setupDriver = async () => {
            if (isSignedIn && user) {
                try {
                    setLoading(true);
                    // 1. Assign Role if missing
                    if (user.unsafeMetadata?.role !== "driver") {
                        await user.update({
                            unsafeMetadata: {
                                role: "driver",
                            },
                        });
                    }

                    // 2. Register Driver in Backend
                    console.log("Registering driver at:", `${BACKEND_URL}/api/driver-register/${user.id}`);
                    const response = await fetch(`${BACKEND_URL}/api/driver-register/${user.id}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                    });

                    if (!response.ok) {
                        console.error("Driver registration failed:", response.status);
                    } else {
                        console.log("Driver registered successfully");
                    }

                    // 3. Redirect to Driver Home
                    router.replace("/(app)/hosting");
                } catch (error) {
                    console.error("Error setting up driver:", error);
                    Alert.alert("Error", "Failed to setup driver account.");
                } finally {
                    setLoading(false);
                }
            }
        };

        setupDriver();
    }, [isSignedIn, user]);

    const handleOAuth = useCallback(async (strategy) => {
        if (loading) return;
        setLoading(true);

        try {
            const { createdSessionId, setActive } = await startSSOFlow({
                strategy,
                redirectUrl,
            });

            if (createdSessionId) {
                await setActive({ session: createdSessionId });
                // The useEffect will handle the rest once 'user' is populated
            }
        } catch (err) {
            console.error("Login error:", err);
            // Alert.alert("Login failed", "Please try again.");
            setLoading(false);
        }
    }, [loading]);

    return (
        <View style={tw`flex-1 justify-center items-center px-6 bg-white`}>
            <Text style={tw`text-3xl font-bold mb-2`}>Driver App</Text>
            <Text style={tw`text-gray-500 mb-10`}>
                Sign in to continue as a driver
            </Text>

            {loading && <ActivityIndicator size="large" style={tw`mb-6`} />}

            {/* Google */}
            <TouchableOpacity
                style={tw`w-full py-4 rounded-xl bg-red-500 mb-4 flex-row justify-center items-center`}
                onPress={() => handleOAuth("oauth_google")}
                disabled={loading}
            >
                <Ionicons name="logo-google" size={24} color="white" style={tw`mr-3`} />
                <Text style={tw`text-white font-semibold text-lg`}>
                    Continue with Google
                </Text>
            </TouchableOpacity>

            {/* Facebook */}
            <TouchableOpacity
                style={tw`w-full py-4 rounded-xl bg-blue-600 mb-4 flex-row justify-center items-center`}
                onPress={() => handleOAuth("oauth_facebook")}
                disabled={loading}
            >
                <Ionicons name="logo-facebook" size={24} color="white" style={tw`mr-3`} />
                <Text style={tw`text-white font-semibold text-lg`}>
                    Continue with Facebook
                </Text>
            </TouchableOpacity>

            {/* Microsoft */}
            <TouchableOpacity
                style={tw`w-full py-4 rounded-xl bg-gray-800 flex-row justify-center items-center`}
                onPress={() => handleOAuth("oauth_microsoft")}
                disabled={loading}
            >
                <Ionicons name="logo-microsoft" size={24} color="white" style={tw`mr-3`} />
                <Text style={tw`text-white font-semibold text-lg`}>
                    Continue with Microsoft
                </Text>
            </TouchableOpacity>
        </View>
    );
}
