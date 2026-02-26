import { View, Text, TouchableOpacity, Image, ScrollView, Alert, useColorScheme, ActivityIndicator } from "react-native";
import { useUser, useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useState, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import tw from "twrnc";
import { theme } from "../../../constants/Colors";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function RiderProfile() {
    const { user } = useUser();
    const { signOut } = useAuth();
    const router = useRouter();
    const scheme = useColorScheme();
    const colors = theme[scheme ?? "light"];
    const [loading, setLoading] = useState(false);
    const [riderVerification, setRiderVerification] = useState({ aadharVerified: false });
    const [aadharVerifying, setAadharVerifying] = useState(false);

    const fetchRiderVerification = async () => {
        if (!user?.id || !BACKEND_URL) return;
        try {
            const res = await fetch(`${BACKEND_URL}/api/rider/rider-verification/${user.id}`);
            if (res.ok) setRiderVerification(await res.json());
        } catch (e) { /* silent */ }
    };

    useEffect(() => { fetchRiderVerification(); }, [user?.id]);

    const handleMockVerifyAadhar = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: '*/*',
                copyToCacheDirectory: false,
            });
            if (result.canceled || !result.assets?.length) return;

            setAadharVerifying(true);
            // Mock: 1.5 s simulated verification — always passes
            await new Promise(r => setTimeout(r, 1500));

            const res = await fetch(`${BACKEND_URL}/api/rider/rider-verification/${user.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ aadharVerified: true }),
            });
            if (res.ok) {
                setRiderVerification(prev => ({ ...prev, aadharVerified: true }));
                Alert.alert('Aadhaar Verified ✓', 'Your Aadhaar has been verified successfully!');
            }
        } catch (e) {
            Alert.alert('Error', 'Verification failed. Please try again.');
        } finally {
            setAadharVerifying(false);
        }
    };

    const handleSwitchToDriver = async () => {
        Alert.alert(
            "Switch to Driver",
            "This will switch your account to driver mode.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Switch",
                    onPress: async () => {
                        try {
                            setLoading(true);
                            await user.update({
                                unsafeMetadata: { ...user.unsafeMetadata, role: "driver" },
                            });
                            router.replace("/(app)/my-rides");
                        } catch (e) {
                            Alert.alert("Error", "Could not switch role.");
                        } finally {
                            setLoading(false);
                        }
                    },
                },
            ]
        );
    };

    const handleSignOut = async () => {
        Alert.alert("Sign Out", "Are you sure you want to sign out?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Sign Out",
                style: "destructive",
                onPress: async () => {
                    try {
                        setLoading(true);
                        await signOut();
                        router.replace("/(auth)/sign-in");
                    } catch (e) {
                        console.error("Sign out error:", e);
                    } finally {
                        setLoading(false);
                    }
                },
            },
        ]);
    };

    return (
        <ScrollView style={[tw`flex-1`, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[tw`pt-12 pb-6 px-6 items-center`, { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                <Image
                    source={{ uri: user?.imageUrl || "https://ui-avatars.com/api/?name=Rider" }}
                    style={tw`w-20 h-20 rounded-full mb-3`}
                />
                <Text style={[tw`text-xl font-extrabold`, { color: colors.textPrimary }]}>
                    {user?.fullName || user?.firstName || "Rider"}
                </Text>
                <Text style={[tw`text-sm mt-1`, { color: colors.textSecondary }]}>
                    {user?.primaryEmailAddress?.emailAddress}
                </Text>
                <View style={[tw`mt-2 px-3 py-1 rounded-full`, { backgroundColor: colors.primarySoft }]}>
                    <Text style={[tw`text-xs font-bold`, { color: colors.primary }]}>Rider</Text>
                </View>
            </View>

            {loading && (
                <View style={tw`items-center py-6`}>
                    <ActivityIndicator size="small" color={colors.primary} />
                </View>
            )}

            {/* Verification Status */}
            <View style={[tw`mx-6 mt-6 rounded-2xl overflow-hidden`, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                <View style={[tw`px-4 py-3 flex-row items-center`, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                    <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
                    <Text style={[tw`text-base font-bold ml-2`, { color: colors.textPrimary }]}>Verification Status</Text>
                </View>

                <View style={tw`px-4 py-1`}>
                    {/* Email - always verified */}
                    <View style={tw`flex-row justify-between items-center py-3 border-b`} >
                        <Text style={[tw`text-sm`, { color: colors.textPrimary }]}>Email</Text>
                        <View style={tw`flex-row items-center gap-1 bg-green-100 px-3 py-1 rounded-full`}>
                            <Ionicons name="checkmark-circle" size={11} color="#15803d" />
                            <Text style={tw`text-xs font-semibold text-green-700`}>Verified</Text>
                        </View>
                    </View>

                    {/* Aadhaar */}
                    <View style={tw`flex-row justify-between items-center py-3`}>
                        <View>
                            <Text style={[tw`text-sm font-medium`, { color: colors.textPrimary }]}>Aadhaar</Text>
                            <Text style={[tw`text-xs mt-0.5`, { color: colors.textMuted }]}>Government ID document</Text>
                        </View>
                        {riderVerification.aadharVerified ? (
                            <View style={tw`flex-row items-center gap-1 bg-green-100 px-3 py-1 rounded-full`}>
                                <Ionicons name="checkmark-circle" size={11} color="#15803d" />
                                <Text style={tw`text-xs font-semibold text-green-700`}>Verified</Text>
                            </View>
                        ) : aadharVerifying ? (
                            <View style={tw`flex-row items-center gap-2`}>
                                <ActivityIndicator size="small" color={colors.primary} />
                                <Text style={[tw`text-xs`, { color: colors.textSecondary }]}>Verifying...</Text>
                            </View>
                        ) : (
                            <TouchableOpacity
                                onPress={handleMockVerifyAadhar}
                                style={[tw`flex-row items-center gap-1 px-3 py-1.5 rounded-xl`, { backgroundColor: colors.primarySoft }]}
                            >
                                <Ionicons name="cloud-upload-outline" size={12} color={colors.primary} />
                                <Text style={[tw`text-xs font-bold`, { color: colors.primary }]}>Upload & Verify</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </View>

            {/* Switch to Driver */}
            <View style={[tw`mx-6 mt-6 rounded-2xl overflow-hidden`, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                <TouchableOpacity
                    onPress={handleSwitchToDriver}
                    disabled={loading}
                    style={tw`flex-row items-center px-4 py-4`}
                >
                    <View style={[tw`w-10 h-10 rounded-xl items-center justify-center mr-4`, { backgroundColor: colors.primarySoft }]}>
                        <Ionicons name="car" size={20} color={colors.primary} />
                    </View>
                    <View style={tw`flex-1`}>
                        <Text style={[tw`font-semibold text-base`, { color: colors.textPrimary }]}>Switch to Driver</Text>
                        <Text style={[tw`text-xs mt-0.5`, { color: colors.textSecondary }]}>Start offering rides</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
            </View>

            {/* Sign Out */}
            <View style={tw`mx-6 mt-4 mb-10`}>
                <TouchableOpacity
                    onPress={handleSignOut}
                    disabled={loading}
                    style={[tw`flex-row items-center justify-center py-4 rounded-2xl`, { backgroundColor: colors.danger }]}
                >
                    <Ionicons name="log-out-outline" size={22} color="white" style={tw`mr-2`} />
                    <Text style={tw`text-white font-bold text-base`}>Sign Out</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}
