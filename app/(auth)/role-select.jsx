import { View, Text, TouchableOpacity, ActivityIndicator, Alert, useColorScheme, Image } from "react-native";
import { useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useState } from "react";
import tw from "twrnc";
import { theme } from "../../constants/Colors";
import { Ionicons } from "@expo/vector-icons";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function RoleSelect() {
    const { user } = useUser();
    const router = useRouter();
    const scheme = useColorScheme();
    const colors = theme[scheme ?? "light"];
    const [loading, setLoading] = useState(false);

    const handleSelectDriver = async () => {
        setLoading(true);
        try {
            await user.update({ unsafeMetadata: { ...user.unsafeMetadata, role: "driver" } });

            const response = await fetch(`${BACKEND_URL}/api/driver-register/${user.id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });
            if (!response.ok) console.error("Driver registration failed:", response.status);

            router.replace("/(app)/my-rides");
        } catch (error) {
            console.error("Error setting up driver:", error);
            Alert.alert("Error", "Failed to set up driver account.");
        } finally {
            setLoading(false);
        }
    };

    const handleSelectRider = async () => {
        setLoading(true);
        try {
            await user.update({ unsafeMetadata: { ...user.unsafeMetadata, role: "rider" } });
            router.replace("/(rider)/search");
        } catch (error) {
            console.error("Error setting up rider:", error);
            Alert.alert("Error", "Failed to set up rider account.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={[tw`flex-1 px-6 pt-16 pb-10`, { backgroundColor: colors.background }]}>
            <View style={tw`items-center mb-12`}>
                <Image
                    source={require("../../assets/icon.png")}
                    style={tw`w-20 h-20 rounded-2xl mb-5`}
                />
                <Text style={[tw`text-3xl font-extrabold mb-2`, { color: colors.textPrimary }]}>
                    How will you use
                </Text>
                <Text style={[tw`text-3xl font-extrabold`, { color: colors.primary }]}>
                    Swiftly?
                </Text>
                <Text style={[tw`text-base text-center mt-3`, { color: colors.textSecondary }]}>
                    You can always switch later from your profile.
                </Text>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color={colors.primary} />
            ) : (
                <View style={tw`gap-4`}>
                    {/* Driver Card */}
                    <TouchableOpacity
                        onPress={handleSelectDriver}
                        activeOpacity={0.85}
                        style={[
                            tw`rounded-3xl p-6 flex-row items-center`,
                            {
                                backgroundColor: colors.surface,
                                borderWidth: 2,
                                borderColor: colors.primary,
                                shadowColor: colors.primary,
                                shadowOpacity: 0.15,
                                shadowRadius: 12,
                                elevation: 4,
                            },
                        ]}
                    >
                        <View
                            style={[
                                tw`w-14 h-14 rounded-2xl items-center justify-center mr-4`,
                                { backgroundColor: colors.primarySoft },
                            ]}
                        >
                            <Ionicons name="car" size={28} color={colors.primary} />
                        </View>
                        <View style={tw`flex-1`}>
                            <Text style={[tw`text-lg font-extrabold`, { color: colors.textPrimary }]}>
                                I'm a Driver
                            </Text>
                            <Text style={[tw`text-sm mt-1`, { color: colors.textSecondary }]}>
                                Offer rides, earn money, meet commuters
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={colors.primary} />
                    </TouchableOpacity>

                    {/* Rider Card */}
                    <TouchableOpacity
                        onPress={handleSelectRider}
                        activeOpacity={0.85}
                        style={[
                            tw`rounded-3xl p-6 flex-row items-center`,
                            {
                                backgroundColor: colors.surface,
                                borderWidth: 2,
                                borderColor: colors.border,
                                shadowColor: "#000",
                                shadowOpacity: 0.06,
                                shadowRadius: 10,
                                elevation: 2,
                            },
                        ]}
                    >
                        <View
                            style={[
                                tw`w-14 h-14 rounded-2xl items-center justify-center mr-4`,
                                { backgroundColor: colors.surfaceMuted },
                            ]}
                        >
                            <Ionicons name="person" size={28} color={colors.textSecondary} />
                        </View>
                        <View style={tw`flex-1`}>
                            <Text style={[tw`text-lg font-extrabold`, { color: colors.textPrimary }]}>
                                I'm a Rider
                            </Text>
                            <Text style={[tw`text-sm mt-1`, { color: colors.textSecondary }]}>
                                Find rides, save money, go green
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}
