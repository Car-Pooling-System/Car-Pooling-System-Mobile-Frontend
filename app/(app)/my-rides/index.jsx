import { View, Text, FlatList, TouchableOpacity, Image, ActivityIndicator, RefreshControl, useColorScheme, TextInput, ScrollView } from "react-native";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import tw from "twrnc";
import { theme } from "../../../constants/Colors";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function MyRides() {
    const { user } = useUser();
    const router = useRouter();
    const scheme = useColorScheme();
    const colors = theme[scheme ?? "light"];

    const isDriverRole = user?.unsafeMetadata?.role === "driver";
    const [activeTab, setActiveTab] = useState(isDriverRole ? "driver" : "rider");
    const [historyTab, setHistoryTab] = useState("upcoming"); // "upcoming" or "past"
    const [dateFilter, setDateFilter] = useState("all"); // "all", "today", "tomorrow"
    const [searchQuery, setSearchQuery] = useState("");

    const [rides, setRides] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchRides = useCallback(async () => {
        if (!user?.id) return;

        setLoading(true);
        try {
            const endpoint = activeTab === "driver"
                ? `${BACKEND_URL}/api/driver-rides/${user.id}`
                : `${BACKEND_URL}/api/rider/rider-rides/${user.id}`;

            const response = await fetch(endpoint);
            const data = await response.json();

            if (response.ok) {
                setRides(data);
            } else {
                console.error("Failed to fetch rides:", data.message);
            }
        } catch (error) {
            console.error("Error fetching rides:", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user?.id, activeTab]);

    useEffect(() => {
        fetchRides();
    }, [fetchRides]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchRides();
    };

    const filteredRides = useMemo(() => {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfTomorrow = new Date(startOfToday.getTime() + 86400000);
        const endOfTomorrow = new Date(startOfTomorrow.getTime() + 86400000);

        return rides.filter((item) => {
            const ride = item.ride || item;
            const departureTime = new Date(ride.schedule?.departureTime);
            const isPast = departureTime < now || ride.status === "completed" || ride.status === "cancelled";

            // 1. History Filter (Upcoming vs Past)
            if (historyTab === "upcoming" && isPast) return false;
            if (historyTab === "past" && !isPast) return false;

            // 2. Date Filter
            if (dateFilter === "today") {
                if (departureTime < startOfToday || departureTime >= startOfTomorrow) return false;
            } else if (dateFilter === "tomorrow") {
                if (departureTime < startOfTomorrow || departureTime >= endOfTomorrow) return false;
            }

            // 3. Search Filter (Location, Stops)
            if (searchQuery.trim()) {
                const query = searchQuery.toLowerCase();
                const startMatch = ride.route?.start?.name?.toLowerCase().includes(query);
                const endMatch = ride.route?.end?.name?.toLowerCase().includes(query);
                const stopMatch = ride.route?.stops?.some(s => s.name?.toLowerCase().includes(query));
                if (!startMatch && !endMatch && !stopMatch) return false;
            }

            return true;
        });

        // Latest to oldest sorting (Descending)
        return result.sort((a, b) => {
            const dateA = new Date(a.ride?.schedule?.departureTime || a.schedule?.departureTime);
            const dateB = new Date(b.ride?.schedule?.departureTime || b.schedule?.departureTime);
            return dateB - dateA;
        });
    }, [rides, historyTab, dateFilter, searchQuery]);

    const renderRideCard = ({ item }) => {
        const ride = item.ride || item;
        const isDriverMode = activeTab === "driver";
        const departureTime = new Date(ride.schedule?.departureTime);
        const isPast = departureTime < new Date() || ride.status === "completed" || ride.status === "cancelled";

        return (
            <TouchableOpacity
                style={[tw`bg-white rounded-2xl p-4 mb-4 shadow-sm border`, { borderColor: colors.border }]}
                onPress={() => router.push({
                    pathname: "/my-rides/details",
                    params: { rideId: ride._id, role: activeTab }
                })}
            >
                <View style={tw`flex-row justify-between items-start mb-3`}>
                    <View style={tw`flex-row items-center`}>
                        <View style={[tw`p-2 rounded-full mr-3`, { backgroundColor: isPast ? colors.surfaceMuted : colors.primarySoft }]}>
                            <MaterialCommunityIcons
                                name={isPast ? "calendar-check" : "calendar-clock"}
                                size={20}
                                color={isPast ? colors.textMuted : colors.primary}
                            />
                        </View>
                        <View>
                            <Text style={[tw`text-sm font-bold`, { color: colors.textPrimary }]}>
                                {departureTime.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </Text>
                            <Text style={[tw`text-xs`, { color: colors.textSecondary }]}>
                                {departureTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                            </Text>
                        </View>
                    </View>
                    <View style={[tw`px-3 py-1 rounded-full`, { backgroundColor: colors.primarySoft }]}>
                        <Text style={[tw`text-xs font-bold`, { color: colors.primary }]}>
                            {isDriverMode ? `${ride.seats?.available}/${ride.seats?.total} Seats` : `₹${item.farePaid || ride.pricing?.baseFare}`}
                        </Text>
                    </View>
                </View>

                <View style={tw`mb-4`}>
                    <View style={tw`flex-row items-center mb-2`}>
                        <Ionicons name="location" size={16} color={colors.primary} style={tw`mr-2`} />
                        <Text style={[tw`text-sm flex-1`, { color: colors.textPrimary }]} numberOfLines={1}>
                            {ride.route?.start?.name}
                        </Text>
                    </View>
                    <View style={tw`w-px h-4 bg-gray-200 ml-2 mb-2`} />
                    <View style={tw`flex-row items-center`}>
                        <Ionicons name="location" size={16} color="#ef4444" style={tw`mr-2`} />
                        <Text style={[tw`text-sm flex-1`, { color: colors.textPrimary }]} numberOfLines={1}>
                            {ride.route?.end?.name}
                        </Text>
                    </View>
                </View>

                <View style={[tw`pt-3 border-t flex-row justify-between items-center`, { borderColor: colors.border }]}>
                    <View style={tw`flex-row items-center`}>
                        <Image
                            source={{ uri: isDriverMode ? user?.imageUrl : ride.driver?.profileImage }}
                            style={tw`w-8 h-8 rounded-full mr-2`}
                        />
                        <Text style={[tw`text-sm font-semibold`, { color: colors.textPrimary }]}>
                            {isDriverMode ? "You (Driver)" : ride.driver?.name}
                        </Text>
                    </View>
                    <View style={tw`flex-row items-center`}>
                        {isPast && (
                            <View style={[tw`mr-2 px-2 py-0.5 rounded bg-gray-100`]}>
                                <Text style={[tw`text-[10px] font-bold uppercase`, { color: colors.textMuted }]}>{ride.status}</Text>
                            </View>
                        )}
                        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[tw`flex-1`, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[tw`pt-4 pb-4 px-6 bg-white border-b`, { borderColor: colors.border }]}>
                <View style={tw`flex-row justify-between items-center mb-4`}>
                    <Text style={[tw`text-2xl font-bold`, { color: colors.textPrimary }]}>My Rides</Text>
                    {!isDriverRole && (
                        <View style={tw`flex-row bg-gray-100 rounded-lg p-0.5`}>
                            <TouchableOpacity
                                style={[tw`px-3 py-1.5 rounded-md`, activeTab === "rider" && tw`bg-white shadow-sm`]}
                                onPress={() => setActiveTab("rider")}
                            >
                                <Text style={[tw`text-xs font-bold`, { color: activeTab === "rider" ? colors.primary : colors.textSecondary }]}>Riding</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[tw`px-3 py-1.5 rounded-md`, activeTab === "driver" && tw`bg-white shadow-sm`]}
                                onPress={() => setActiveTab("driver")}
                            >
                                <Text style={[tw`text-xs font-bold`, { color: activeTab === "driver" ? colors.primary : colors.textSecondary }]}>Driving</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {/* History Tabs */}
                <View style={tw`flex-row mb-4`}>
                    <TouchableOpacity
                        style={[tw`mr-6 pb-2`, historyTab === "upcoming" && { borderBottomWidth: 3, borderBottomColor: colors.primary }]}
                        onPress={() => setHistoryTab("upcoming")}
                    >
                        <Text style={[tw`text-sm font-bold`, { color: historyTab === "upcoming" ? colors.textPrimary : colors.textSecondary }]}>Upcoming</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[tw`pb-2`, historyTab === "past" && { borderBottomWidth: 3, borderBottomColor: colors.primary }]}
                        onPress={() => setHistoryTab("past")}
                    >
                        <Text style={[tw`text-sm font-bold`, { color: historyTab === "past" ? colors.textPrimary : colors.textSecondary }]}>Past Rides</Text>
                    </TouchableOpacity>
                </View>

                <View style={tw`flex-row items-center mb-4`}>
                    <View style={[tw`flex-1 flex-row items-center bg-gray-50 border rounded-2xl px-4 mr-2`, { height: 52, borderColor: colors.border }]}>
                        <Ionicons name="search" size={22} color={colors.primary} style={tw`mr-3`} />
                        <TextInput
                            placeholder="Search by city or stop..."
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            style={[tw`flex-1 text-base font-medium`, { color: colors.textPrimary, height: '100%' }]}
                            placeholderTextColor={colors.textSecondary}
                        />
                    </View>
                    <TouchableOpacity
                        style={[tw`bg-gray-50 border rounded-2xl items-center justify-center`, { height: 52, width: 52, borderColor: colors.border }]}
                        onPress={() => {
                            setSearchQuery("");
                            setDateFilter("all");
                        }}
                    >
                        <Ionicons name={searchQuery || dateFilter !== "all" ? "close-circle" : "options-outline"} size={24} color={colors.primary} />
                    </TouchableOpacity>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tw`pb-2`}>
                    {["all", "today", "tomorrow"].map((f) => (
                        <TouchableOpacity
                            key={f}
                            style={[tw`px-5 py-2.5 rounded-full mr-2 border`,
                            dateFilter === f ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.white, borderColor: colors.border }
                            ]}
                            onPress={() => setDateFilter(f)}
                        >
                            <Text style={[tw`text-xs font-bold capitalize`, { color: dateFilter === f ? "white" : colors.textSecondary }]}>{f}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {loading && !refreshing ? (
                <View style={tw`flex-1 justify-center items-center`}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={filteredRides}
                    renderItem={renderRideCard}
                    keyExtractor={(item) => (item._id || item.bookingId || Math.random().toString())}
                    contentContainerStyle={tw`p-6 pt-4`}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
                    }
                    ListEmptyComponent={
                        <View style={tw`flex-1 justify-center items-center pt-20`}>
                            <MaterialCommunityIcons name="car-off" size={64} color={colors.textMuted} />
                            <Text style={[tw`text-lg font-bold mt-4`, { color: colors.textPrimary }]}>No {historyTab} rides found</Text>
                            <Text style={[tw`text-sm text-center mt-2 px-10`, { color: colors.textSecondary }]}>
                                {searchQuery || dateFilter !== "all"
                                    ? "Try adjusting your filters or search query."
                                    : activeTab === "rider"
                                        ? "Any rides you book will appear here."
                                        : "Any rides you create will appear here."}
                            </Text>
                            {historyTab === "upcoming" && !searchQuery && dateFilter === "all" && (
                                <TouchableOpacity
                                    style={[tw`mt-6 px-8 py-3 rounded-full`, { backgroundColor: colors.primary }]}
                                    onPress={() => router.push(activeTab === "rider" ? "/" : "/hosting")}
                                >
                                    <Text style={tw`text-white font-bold`}>
                                        {activeTab === "rider" ? "Search Rides" : "Create a Ride"}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    }
                />
            )}
        </View>
    );
}

