import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, useColorScheme, RefreshControl } from "react-native";
import { useState, useEffect, useCallback } from "react";
import { useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import tw from "twrnc";
import { theme } from "../../../constants/Colors";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function Bookings() {
    const { user } = useUser();
    const router = useRouter();
    const scheme = useColorScheme();
    const colors = theme[scheme ?? "light"];

    const [rides, setRides] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchBookings = useCallback(async () => {
        if (!user?.id) return;
        try {
            const res = await fetch(`${BACKEND_URL}/api/rider/rider-rides/${user.id}`);
            const data = await res.json();
            setRides(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error("Bookings fetch error:", e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user?.id]);

    useEffect(() => { fetchBookings(); }, [fetchBookings]);

    const onRefresh = () => { setRefreshing(true); fetchBookings(); };

    const renderItem = ({ item }) => {
        const ride = item.ride || item;
        const dep = new Date(ride.schedule?.departureTime);
        const isPast = dep < new Date() || ride.status === "completed" || ride.status === "cancelled";

        return (
            <TouchableOpacity
                onPress={() => router.push({ pathname: "/my-rides/details", params: { rideId: ride._id, role: "rider" } })}
                activeOpacity={0.85}
                style={[
                    tw`rounded-2xl p-4 mb-4`,
                    { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                ]}
            >
                <View style={tw`flex-row justify-between items-start mb-3`}>
                    <View style={tw`flex-row items-center`}>
                        <View style={[tw`p-2 rounded-full mr-3`, { backgroundColor: isPast ? colors.surfaceMuted : colors.primarySoft }]}>
                            <MaterialCommunityIcons
                                name={isPast ? "calendar-check" : "calendar-clock"}
                                size={18}
                                color={isPast ? colors.textMuted : colors.primary}
                            />
                        </View>
                        <View>
                            <Text style={[tw`text-sm font-bold`, { color: colors.textPrimary }]}>
                                {dep.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" })}
                            </Text>
                            <Text style={[tw`text-xs`, { color: colors.textSecondary }]}>
                                {dep.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}
                            </Text>
                        </View>
                    </View>
                    <View style={[tw`px-3 py-1 rounded-full`, { backgroundColor: isPast ? colors.surfaceMuted : colors.primarySoft }]}>
                        <Text style={[tw`text-xs font-bold`, { color: isPast ? colors.textMuted : colors.primary }]}>
                            ₹{item.farePaid || ride.pricing?.baseFare}
                        </Text>
                    </View>
                </View>
                <View style={tw`flex-row items-center mb-2`}>
                    <Ionicons name="location" size={14} color={colors.primary} style={tw`mr-2`} />
                    <Text style={[tw`text-sm flex-1`, { color: colors.textPrimary }]} numberOfLines={1}>{ride.route?.start?.name}</Text>
                </View>
                <View style={tw`w-px h-3 bg-gray-200 ml-2 mb-2`} />
                <View style={tw`flex-row items-center`}>
                    <Ionicons name="location" size={14} color="#ef4444" style={tw`mr-2`} />
                    <Text style={[tw`text-sm flex-1`, { color: colors.textPrimary }]} numberOfLines={1}>{ride.route?.end?.name}</Text>
                </View>
                {isPast && (
                    <View style={[tw`mt-3 px-2 py-0.5 rounded self-start`, { backgroundColor: colors.surfaceMuted }]}>
                        <Text style={[tw`text-xs font-bold uppercase`, { color: colors.textMuted }]}>{ride.status}</Text>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <View style={[tw`flex-1`, { backgroundColor: colors.background }]}>
            <View style={[tw`pt-12 pb-4 px-6`, { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                <Text style={[tw`text-2xl font-extrabold`, { color: colors.textPrimary }]}>My Bookings</Text>
            </View>

            {loading ? (
                <View style={tw`flex-1 items-center justify-center`}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={rides}
                    keyExtractor={(item, idx) => item._id || String(idx)}
                    renderItem={renderItem}
                    contentContainerStyle={tw`px-6 pt-4 pb-10`}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
                    ListEmptyComponent={
                        <View style={tw`items-center mt-20`}>
                            <Ionicons name="calendar-outline" size={48} color={colors.textMuted} />
                            <Text style={[tw`text-base font-semibold mt-4`, { color: colors.textSecondary }]}>No bookings yet</Text>
                            <Text style={[tw`text-sm mt-1`, { color: colors.textMuted }]}>Find and book a ride to get started</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}
