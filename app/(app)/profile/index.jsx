import { View, Text, TouchableOpacity, Image, ScrollView, Switch, ActivityIndicator } from "react-native";
import { useUser, useAuth } from "@clerk/clerk-expo";
import { useColorScheme } from "react-native";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "expo-router";
import tw from "twrnc";
import { theme } from "../../../constants/Colors";
import { BACKEND_URL } from "../../../constants/Imps";
import { Ionicons } from "@expo/vector-icons";

export default function Profile() {
    const { user, isLoaded } = useUser();
    const { signOut } = useAuth();
    const router = useRouter();
    const scheme = useColorScheme();
    const colors = theme[scheme ?? "light"];

    const [notificationsEnabled, setNotificationsEnabled] = useState(false);
    const [owed, setOwed] = useState(-1);
    const [lent, setLent] = useState(-1);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isLoaded || !user?.id) return;

        const fetchData = async () => {
            try {
                setLoading(true);
                const res = await fetch(`${BACKEND_URL}/api/net/${user.id}`);
                if (!res.ok) throw new Error("Failed to fetch");

                const data = await res.json();
                console.log("Fetched balance:", data);

                setOwed(data.owed ?? 0);
                setLent(data.lent ?? 0);
                setNotificationsEnabled(data.notifications ?? false);
            } catch (err) {
                console.error("Fetch failed:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [isLoaded, user?.id]);

    const updateNotifications = useCallback(
        async (newValue) => {
            const previousValue = notificationsEnabled;
            setNotificationsEnabled(newValue);

            try {
                const res = await fetch(`${BACKEND_URL}/api/net/${user?.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ notifications: newValue }),
                });

                if (!res.ok) {
                    throw new Error(`Server responded ${res.status}`);
                }

                // Optional: you can re-fetch full data here if needed
                // but since we only updated one field → optimistic is fine
            } catch (err) {
                console.error("Failed to update notifications:", err);
                // Rollback on error
                setNotificationsEnabled(previousValue);
                // Optional: show toast/alert
            }
        },
        [notificationsEnabled, user?.id]
    );

    const handleSignOut = async () => {
        try {
            await signOut();
            router.replace("/(auth)/sign-in"); // adjust group if needed
        } catch (err) {
            console.error("Sign out failed:", err);
            router.replace("/(auth)/sign-in"); // force
        }
    };

    if (!isLoaded || loading) {
        return (
            <View
                style={tw`flex-1 justify-center items-center bg-[${colors.background}]`}
            >
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={tw`mt-4 text-[${colors.textSecondary}]`}>Loading...</Text>
            </View>
        );
    }

    if (!user) {
        return (
            <View style={tw`flex-1 justify-center items-center`}>
                <Text>Not signed in</Text>
            </View>
        );
    }

    const displayName =
        `${user.unsafeMetadata?.firstName ?? user.firstName ?? ""} `.trim() + " " +
        `${user.unsafeMetadata?.lastName ?? user.lastName ?? ""}`.trim();

    return (
        <ScrollView
            style={{ backgroundColor: colors.background }}
            contentContainerStyle={tw`pb-12`}
        >
            {/* Header */}
            <View style={tw`items-center pt-6`}>
                <View style={tw`mb-2`}>
                    <Text style={tw`font-medium text-xl`}>Profile</Text>
                </View>
                <Image
                    source={{ uri: user.imageUrl }}
                    style={[tw`w-28 h-28 rounded-full`, { borderWidth: 4, borderColor: colors.primarySoft }]}
                />
                <Text style={[tw`text-xl font-bold mt-4`, { color: colors.textPrimary }]}>
                    {displayName || "User"}
                </Text>
                <Text style={[tw`text-sm`, { color: colors.textSecondary }]}>
                    <Text style={tw`font-bold`}>Email: </Text>{user.primaryEmailAddress?.emailAddress ?? "No email"}
                </Text>
                <Text style={[tw`text-sm`, { color: colors.textSecondary }]}>
                    <Text style={tw`font-bold`}>User Name: </Text>{user?.fullName}
                </Text>

            </View>

            {/* Stats – unchanged */}
            <View style={tw`flex-row gap-4 px-4 mt-6`}>
                <View
                    style={[
                        tw`flex-1 p-4 rounded-xl`,
                        { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                    ]}
                >
                    <Text style={{ color: colors.textSecondary }}>
                        <Ionicons name="arrow-down" color="red" /> Total Owed
                    </Text>
                    <Text style={[tw`text-2xl font-bold mt-1`, { color: colors.danger }]}>
                        ₹{owed === -1 ? "—" : owed}
                    </Text>
                </View>

                <View style={[tw`flex-1 p-4 rounded-xl`, { backgroundColor: colors.primarySoft }]}>
                    <Text style={{ color: colors.textSecondary }}>
                        <Ionicons name="arrow-up" color="green" /> Total Lent
                    </Text>
                    <Text style={[tw`text-2xl font-bold mt-1`, { color: colors.primary }]}>
                        ₹{lent === -1 ? "—" : lent}
                    </Text>
                </View>
            </View>

            {/* Account Settings – unchanged */}
            <Text style={[tw`px-4 mt-8 mb-2 font-bold`, { color: colors.textPrimary }]}>
                Account Settings
            </Text>

            <TouchableOpacity
                onPress={() => router.push("/profile/edit")}
                style={[tw`flex-row items-center justify-between px-4 py-4`, { backgroundColor: colors.surface }]}
            >
                <Text style={{ color: colors.textPrimary }}>Edit Profile</Text>
                <Text style={{ color: colors.textMuted }}>›</Text>
            </TouchableOpacity>

            {["Payment Methods", "Manage Groups"].map((item) => (
                <View
                    key={item}
                    style={[tw`flex-row items-center justify-between px-4 py-4`, { backgroundColor: colors.surface }]}
                >
                    <Text style={{ color: colors.textPrimary }}>{item}</Text>
                    <Text style={{ color: colors.textMuted }}>›</Text>
                </View>
            ))}

            {/* Preferences */}
            <Text style={[tw`px-4 mt-8 mb-2 font-bold`, { color: colors.textPrimary }]}>
                Preferences
            </Text>

            <View>
                <View
                    style={[
                        tw`flex-row items-center justify-between p-4 rounded-xl`,
                        { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                    ]}
                >
                    <View>
                        <Text style={[tw`text-base font-medium`, { color: colors.textPrimary }]}>
                            Notifications
                        </Text>
                        <Text style={[tw`text-xs mt-1`, { color: colors.textSecondary }]}>
                            Get updates about bills & payments
                        </Text>
                    </View>
                    <Switch
                        value={notificationsEnabled}
                        onValueChange={updateNotifications}  // ← now saves to DB
                        trackColor={{ false: colors.surfaceMuted, true: colors.primary }}
                        thumbColor={notificationsEnabled ? "#fff" : "#f4f4f5"}
                    />
                </View>

                {/* Privacy row (placeholder) */}
                <View
                    style={[
                        tw`flex-row items-center justify-between p-4 rounded-xl mt-3`,
                        { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                    ]}
                >
                    <View>
                        <Text style={[tw`text-base font-medium`, { color: colors.textPrimary }]}>
                            Privacy and Security
                        </Text>
                        <Text style={[tw`text-xs mt-1`, { color: colors.textSecondary }]}>
                            Read the policy here
                        </Text>
                    </View>
                </View>

                {/* Sign Out */}
                <View style={tw`items-center mt-8`}>
                    <TouchableOpacity
                        style={[tw`p-4 rounded-2xl w-[80%]`, { backgroundColor: colors.dangerSoft }]}
                        onPress={handleSignOut}
                    >
                        <Text style={[tw`text-center font-bold`, { color: colors.danger }]}>
                            Sign Out
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </ScrollView>
    );
}