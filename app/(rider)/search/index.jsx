import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, useColorScheme, TextInput } from "react-native";
import { useState, useCallback } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import tw from "twrnc";
import { theme } from "../../../constants/Colors";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function SearchRides() {
    const router = useRouter();
    const scheme = useColorScheme();
    const colors = theme[scheme ?? "light"];

    const [query, setQuery] = useState("");
    const [rides, setRides] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);

    const searchRides = useCallback(async () => {
        if (!query.trim()) return;
        setLoading(true);
        setSearched(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/rides/search?query=${encodeURIComponent(query)}`);
            const data = await res.json();
            setRides(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error("Search error:", e);
            setRides([]);
        } finally {
            setLoading(false);
        }
    }, [query]);

    const renderRide = ({ item }) => {
        const dep = new Date(item.schedule?.departureTime);
        return (
            <TouchableOpacity
                onPress={() => router.push({ pathname: "/(rider)/search/details", params: { rideId: item._id } })}
                activeOpacity={0.85}
                style={[
                    tw`rounded-2xl p-4 mb-4`,
                    { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                ]}
            >
                <View style={tw`flex-row justify-between items-start mb-3`}>
                    <View>
                        <Text style={[tw`text-sm font-bold`, { color: colors.textPrimary }]}>
                            {dep.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" })}
                        </Text>
                        <Text style={[tw`text-xs`, { color: colors.textSecondary }]}>
                            {dep.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}
                        </Text>
                    </View>
                    <View style={[tw`px-3 py-1 rounded-full`, { backgroundColor: colors.primarySoft }]}>
                        <Text style={[tw`text-xs font-bold`, { color: colors.primary }]}>
                            ₹{item.pricing?.baseFare} · {item.seats?.available} seats
                        </Text>
                    </View>
                </View>
                <View style={tw`flex-row items-center mb-2`}>
                    <Ionicons name="location" size={14} color={colors.primary} style={tw`mr-2`} />
                    <Text style={[tw`text-sm flex-1`, { color: colors.textPrimary }]} numberOfLines={1}>
                        {item.route?.start?.name}
                    </Text>
                </View>
                <View style={tw`w-px h-3 bg-gray-200 ml-2 mb-2`} />
                <View style={tw`flex-row items-center`}>
                    <Ionicons name="location" size={14} color="#ef4444" style={tw`mr-2`} />
                    <Text style={[tw`text-sm flex-1`, { color: colors.textPrimary }]} numberOfLines={1}>
                        {item.route?.end?.name}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[tw`flex-1`, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[tw`pt-12 pb-4 px-6`, { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                <Text style={[tw`text-2xl font-extrabold mb-4`, { color: colors.textPrimary }]}>Find a Ride</Text>
                <View style={[tw`flex-row items-center rounded-xl px-4`, { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border }]}>
                    <Ionicons name="search" size={18} color={colors.textMuted} style={tw`mr-2`} />
                    <TextInput
                        style={[tw`flex-1 py-3 text-sm`, { color: colors.textPrimary }]}
                        placeholder="From, To or area..."
                        placeholderTextColor={colors.textMuted}
                        value={query}
                        onChangeText={setQuery}
                        onSubmitEditing={searchRides}
                        returnKeyType="search"
                    />
                    {query.length > 0 && (
                        <TouchableOpacity onPress={() => { setQuery(""); setRides([]); setSearched(false); }}>
                            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Results */}
            {loading ? (
                <View style={tw`flex-1 items-center justify-center`}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={rides}
                    keyExtractor={(item) => item._id}
                    renderItem={renderRide}
                    contentContainerStyle={tw`px-6 pt-4 pb-10`}
                    ListEmptyComponent={
                        searched ? (
                            <View style={tw`items-center mt-20`}>
                                <Ionicons name="car-outline" size={48} color={colors.textMuted} />
                                <Text style={[tw`text-base font-semibold mt-4`, { color: colors.textSecondary }]}>
                                    No rides found
                                </Text>
                                <Text style={[tw`text-sm mt-1 text-center`, { color: colors.textMuted }]}>
                                    Try a different location or date
                                </Text>
                            </View>
                        ) : (
                            <View style={tw`items-center mt-20`}>
                                <Ionicons name="search-outline" size={48} color={colors.textMuted} />
                                <Text style={[tw`text-base font-semibold mt-4`, { color: colors.textSecondary }]}>
                                    Search for rides
                                </Text>
                                <Text style={[tw`text-sm mt-1 text-center`, { color: colors.textMuted }]}>
                                    Enter a location to find available rides nearby
                                </Text>
                            </View>
                        )
                    }
                />
            )}
        </View>
    );
}
