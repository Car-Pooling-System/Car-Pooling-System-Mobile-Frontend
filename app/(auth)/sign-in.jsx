import { useSSO, useUser } from "@clerk/clerk-expo";
import * as AuthSession from "expo-auth-session";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, ImageBackground, useColorScheme } from "react-native";
import { useWarmUpBrowser } from "../../hooks/useWarmUpBrowser";
import { useRouter } from "expo-router";
import { useState, useCallback, useEffect } from "react";
import tw from "twrnc";
import { theme } from "../../constants/Colors";
import { FontAwesome, MaterialCommunityIcons } from "@expo/vector-icons";

const BACKEND_URL = process.env.EXPO_BACKEND_URL;

export default function SignIn() {
    useWarmUpBrowser();
    const { startSSOFlow } = useSSO();
    const { user, isSignedIn } = useUser();
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const scheme = useColorScheme();
    const colors = theme[scheme ?? "light"];

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
        let sessionCreated = false;

        try {
            const { createdSessionId, setActive } = await startSSOFlow({
                strategy,
                redirectUrl,
            });

            if (createdSessionId) {
                sessionCreated = true;
                await setActive({ session: createdSessionId });
                // The useEffect will handle the rest once 'user' is populated
            } else {
                setLoading(false);
            }
        } catch (err) {
            console.error("Login error:", err);
            // Alert.alert("Login failed", "Please try again.");
            setLoading(false);
        } finally {
            if (!sessionCreated) {
                setLoading(false);
            }
        }
    }, [loading]);

    return (
        <View style={[tw`flex-1`, { backgroundColor: colors.background }]}> 
            <ImageBackground
                source={require("../../assets/login-image.png")}
                style={[tw`h-72 w-full`, { marginTop: 56 }]}
                resizeMode="cover"
            >
                <View style={tw`flex-1`} />
            </ImageBackground>

            <View
                style={[
                    tw`absolute top-0 left-0 right-0`,
                    { backgroundColor: colors.primary, paddingTop: 16, paddingBottom: 12, paddingHorizontal: 16 },
                ]}
            >
                <Text style={[tw`text-lg font-extrabold tracking-wide`, { color: colors.primaryText }]}>SWIFTLY</Text>
                <View
                    pointerEvents="none"
                    style={[
                        tw`absolute left-0 right-0`,
                        {
                            bottom: -56,
                            height: 80,
                        },
                    ]}
                >
                    <View
                        style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            top: 0,
                            height: 22,
                            backgroundColor: "rgba(19, 236, 91, 0.30)",
                        }}
                    />
                    <View
                        style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            top: 18,
                            height: 22,
                            backgroundColor: "rgba(19, 236, 91, 0.22)",
                        }}
                    />
                    <View
                        style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            top: 36,
                            height: 22,
                            backgroundColor: "rgba(19, 236, 91, 0.15)",
                        }}
                    />
                    <View
                        style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            top: 54,
                            height: 22,
                            backgroundColor: "rgba(19, 236, 91, 0.08)",
                        }}
                    />
                </View>
            </View>

            <View style={[tw`flex-1 -mt-6 rounded-t-3xl px-6 pt-8 pb-10`, { backgroundColor: colors.surface }]}> 
                <Text style={[tw`text-2xl font-bold text-center mb-2`, { color: colors.textPrimary }]}>
                    Share the Ride, Save the Planet.
                </Text>
                <Text style={[tw`text-center mb-8`, { color: colors.textSecondary }]}>
                    Join thousands of commuters making travel more social and sustainable.
                </Text>

                {loading && <ActivityIndicator size="large" style={tw`mb-6`} />}

                <TouchableOpacity
                    style={[
                        tw`w-full py-4 rounded-2xl mb-4 flex-row items-center justify-center`,
                        { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                    ]}
                    onPress={() => handleOAuth("oauth_google")}
                    disabled={loading}
                >
                    <MaterialCommunityIcons name="car" size={18} color="#EA4335" style={tw`mr-3`} />
                    <Text style={[tw`font-semibold text-base`, { color: colors.textPrimary }]}>
                        Continue with Google
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        tw`w-full py-4 rounded-2xl mb-4 flex-row items-center justify-center`,
                        { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                    ]}
                    onPress={() => handleOAuth("oauth_facebook")}
                    disabled={loading}
                >
                    <MaterialCommunityIcons name="car" size={18} color="#1877F2" style={tw`mr-3`} />
                    <Text style={[tw`font-semibold text-base`, { color: colors.textPrimary }]}>
                        Continue with Facebook
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        tw`w-full py-4 rounded-2xl flex-row items-center justify-center`,
                        { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                    ]}
                    onPress={() => handleOAuth("oauth_microsoft")}
                    disabled={loading}
                >
                    <MaterialCommunityIcons name="car" size={18} color="#737373" style={tw`mr-3`} />
                    <Text style={[tw`font-semibold text-base`, { color: colors.textPrimary }]}>
                        Continue with Microsoft
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}
