import {
    View, Text, TouchableOpacity, FlatList, ActivityIndicator,
    useColorScheme, Alert, Platform, ScrollView,
    KeyboardAvoidingView, Modal, Pressable,
} from "react-native";
import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "expo-router";
import { useUser } from "@clerk/clerk-expo";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Location from "expo-location";
import tw from "twrnc";
import { theme } from "../../../constants/Colors";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

/* ─── helpers ─────────────────────────────────────── */
const fmtDate = (d) =>
    d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

const fmtTime = (d) =>
    d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

/* ─── PlaceInput ──────────────────────────────────────
   A trigger row that opens a full-screen Google Places
   autocomplete modal. Avoids dropdown clipping issues.  */
function PlaceInput({ placeholder, value, onSelect, colors, icon, iconColor }) {
    const [modalVisible, setModalVisible] = useState(false);
    const ref = useRef(null);

    const handleOpen = () => {
        setModalVisible(true);
        setTimeout(() => ref.current?.focus(), 300);
    };

    return (
        <>
            <TouchableOpacity
                onPress={handleOpen}
                activeOpacity={0.75}
                style={[
                    tw`flex-row items-center px-4 py-3 rounded-xl`,
                    { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
                ]}
            >
                <Ionicons name={icon} size={16} color={iconColor} style={tw`mr-3`} />
                <Text
                    numberOfLines={1}
                    style={[tw`flex-1 text-sm`, { color: value ? colors.textPrimary : colors.textMuted }]}
                >
                    {value?.name || placeholder}
                </Text>
                {value && (
                    <TouchableOpacity
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={() => onSelect(null)}
                    >
                        <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                )}
            </TouchableOpacity>

            <Modal
                visible={modalVisible}
                animationType="slide"
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={[tw`flex-1`, { backgroundColor: colors.background }]}>
                    <View
                        style={[
                            tw`flex-row items-center px-4 pt-12 pb-4 gap-3`,
                            { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
                        ]}
                    >
                        <TouchableOpacity onPress={() => setModalVisible(false)}>
                            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
                        </TouchableOpacity>
                        <Text style={[tw`text-base font-bold flex-1`, { color: colors.textPrimary }]}>
                            {placeholder}
                        </Text>
                    </View>

                    <GooglePlacesAutocomplete
                        ref={ref}
                        placeholder={`Search for ${placeholder.toLowerCase()}…`}
                        fetchDetails
                        autoFocus
                        enablePoweredByContainer={false}
                        query={{ key: GOOGLE_API_KEY, language: "en", components: "country:in" }}
                        onPress={(data, details) => {
                            const loc = details?.geometry?.location;
                            if (!loc) return;
                            onSelect({ name: data.description, lat: loc.lat, lng: loc.lng });
                            setModalVisible(false);
                        }}
                        styles={{
                            container: { flex: 0 },
                            textInputContainer: {
                                paddingHorizontal: 16,
                                paddingTop: 12,
                                backgroundColor: colors.background,
                            },
                            textInput: {
                                backgroundColor: colors.surfaceMuted,
                                borderRadius: 12,
                                fontSize: 14,
                                color: colors.textPrimary,
                                paddingHorizontal: 14,
                                height: 46,
                                borderWidth: 1,
                                borderColor: colors.border,
                            },
                            listView: { backgroundColor: colors.background },
                            row: { backgroundColor: colors.surface, paddingVertical: 14, paddingHorizontal: 16 },
                            separator: { height: 1, backgroundColor: colors.border },
                            description: { fontSize: 13, color: colors.textPrimary },
                        }}
                        renderLeftButton={() => (
                            <View style={tw`pl-4 justify-center`}>
                                <Ionicons name={icon} size={16} color={iconColor} />
                            </View>
                        )}
                    />
                </View>
            </Modal>
        </>
    );
}

/* ─── Main Page ───────────────────────────────────── */
export default function SearchRides() {
    const router = useRouter();
    const { user } = useUser();
    const scheme = useColorScheme();
    const colors = theme[scheme ?? "light"];

    /* form state */
    const [pickup, setPickup] = useState(null);   // { name, lat, lng }
    const [drop, setDrop] = useState(null);
    const [date, setDate] = useState(new Date());
    const [seats, setSeats] = useState(1);
    const [showDatePicker, setShowDatePicker] = useState(false);

    /* results state */
    const [rides, setRides] = useState([]);
    const [bookedRideIds, setBookedRideIds] = useState(new Set());
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);

    /* nearby rides (pre-search) */
    const [nearbyRides, setNearbyRides] = useState([]);
    const [nearbyLoading, setNearbyLoading] = useState(false);
    const [locationDenied, setLocationDenied] = useState(false);
    const [nearbyRadius, setNearbyRadius] = useState(50); // km
    const userLocationRef = useRef(null); // { latitude, longitude }

    /* ── fetch nearby rides on mount ─────────────── */
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== "granted") {
                    if (!cancelled) setLocationDenied(true);
                    return;
                }
                setNearbyLoading(true);
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                const { latitude, longitude } = loc.coords;
                userLocationRef.current = { latitude, longitude };

                const [nearbyRes, bookingsRes] = await Promise.all([
                    fetch(`${BACKEND_URL}/api/rides/nearby?lat=${latitude}&lng=${longitude}&radiusKm=${nearbyRadius}&limit=15`),
                    user?.id ? fetch(`${BACKEND_URL}/api/rider/rider-rides/${user.id}`) : Promise.resolve(null),
                ]);

                const nearbyData = await nearbyRes.json();

                if (bookingsRes) {
                    const bookingsData = await bookingsRes.json();
                    const booked = new Set(
                        (Array.isArray(bookingsData) ? bookingsData : [])
                            .filter((b) => b.status !== "cancelled")
                            .map((b) => b.ride?._id?.toString())
                            .filter(Boolean)
                    );
                    if (!cancelled) setBookedRideIds((prev) => new Set([...prev, ...booked]));
                }

                if (!cancelled && nearbyRes.ok && Array.isArray(nearbyData)) {
                    setNearbyRides(nearbyData);
                }
            } catch (e) {
                console.log("Nearby rides fetch failed:", e.message);
            } finally {
                if (!cancelled) setNearbyLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [user?.id]); // only on mount — radius re-fetch handled by separate effect

    /* ── re-fetch nearby when radius changes ──────── */
    const fetchNearbyWithRadius = useCallback(async (radius) => {
        const loc = userLocationRef.current;
        if (!loc || searched) return; // don't overwrite active search results
        setNearbyLoading(true);
        try {
            const res = await fetch(
                `${BACKEND_URL}/api/rides/nearby?lat=${loc.latitude}&lng=${loc.longitude}&radiusKm=${radius}&limit=15`
            );
            const data = await res.json();
            if (res.ok && Array.isArray(data)) setNearbyRides(data);
        } catch (e) {
            console.log("Radius re-fetch failed:", e.message);
        } finally {
            setNearbyLoading(false);
        }
    }, [searched]);

    /* ── search ─────────────────────────────────── */
    const searchRides = useCallback(async () => {
        if (!pickup || !drop) {
            Alert.alert("Missing info", "Please select both a pickup and a drop location.");
            return;
        }
        setLoading(true);
        setSearched(true);
        try {
            const [searchRes, bookingsRes] = await Promise.all([
                fetch(
                    `${BACKEND_URL}/api/rides/search` +
                    `?pickupLat=${pickup.lat}&pickupLng=${pickup.lng}` +
                    `&dropLat=${drop.lat}&dropLng=${drop.lng}`
                ),
                fetch(`${BACKEND_URL}/api/rider/rider-rides/${user?.id}`),
            ]);

            const searchData = await searchRes.json();
            const bookingsData = await bookingsRes.json();

            const booked = new Set(
                (Array.isArray(bookingsData) ? bookingsData : [])
                    .filter((b) => b.status !== "cancelled")
                    .map((b) => b.ride?._id?.toString())
                    .filter(Boolean)
            );
            setBookedRideIds(booked);

            // Filter by enough seats (date filter is informational only for test data)
            const filtered = (Array.isArray(searchData) ? searchData : []).filter((r) => {
                return r.seatsAvailable >= seats;
            });

            setRides(filtered);
        } catch (e) {
            console.error("Search error:", e);
            setRides([]);
        } finally {
            setLoading(false);
        }
    }, [pickup, drop, date, seats, user?.id]);

    /* ── sort: booked first ─────────────────────── */
    const { pinnedRides, otherRides } = useMemo(() => {
        const pinned = rides.filter((r) => bookedRideIds.has(r._id?.toString()));
        const other  = rides.filter((r) => !bookedRideIds.has(r._id?.toString()));
        return { pinnedRides: pinned, otherRides: other };
    }, [rides, bookedRideIds]);

    /* ── ride card ────────────────────────────────── */
    const renderRide = useCallback(
        (item) => {
            const rideId   = item._id?.toString();
            const isBooked = bookedRideIds.has(rideId);
            const isDriver = item.driver?.userId === user?.id;
            const dep      = new Date(item.schedule?.departureTime);
            const isUpcoming = dep > new Date();

            let badge = null;
            if (isDriver) {
                badge = { label: "YOU'RE THE DRIVER", bg: colors.primarySoft, color: colors.primary, icon: "car" };
            } else if (isBooked) {
                badge = {
                    label: isUpcoming ? "UPCOMING RIDE" : "BOOKED",
                    bg: "rgba(7,136,41,0.12)",
                    color: colors.success,
                    icon: isUpcoming ? "calendar-clock" : "check-circle",
                };
            }

            return (
                <TouchableOpacity
                    key={rideId}
                    onPress={() =>
                        router.push({
                            pathname: "/(rider)/search/details",
                            params: {
                                rideId,
                                pickupName: pickup?.name,
                                pickupLat: String(pickup?.lat),
                                pickupLng: String(pickup?.lng),
                                dropName: drop?.name,
                                dropLat: String(drop?.lat),
                                dropLng: String(drop?.lng),
                                estimatedFare: String(item.estimate?.fare ?? ""),
                                isBooked: isBooked ? "1" : "0",
                                isDriver: isDriver ? "1" : "0",
                            },
                        })
                    }
                    activeOpacity={0.85}
                    style={[
                        tw`rounded-2xl mb-4 overflow-hidden`,
                        {
                            backgroundColor: colors.surface,
                            borderWidth: 1,
                            borderColor: isDriver
                                ? colors.primary
                                : isBooked
                                ? "rgba(19,236,91,0.4)"
                                : colors.border,
                        },
                    ]}
                >
                    {/* Badge strip */}
                    {badge && (
                        <View style={[tw`flex-row items-center gap-1.5 px-4 py-2`, { backgroundColor: badge.bg }]}>
                            <MaterialCommunityIcons name={badge.icon} size={12} color={badge.color} />
                            <Text style={[tw`text-xs font-extrabold tracking-widest`, { color: badge.color }]}>
                                {badge.label}
                            </Text>
                        </View>
                    )}

                    <View style={tw`p-4`}>
                        {/* Time + fare */}
                        <View style={tw`flex-row justify-between items-start mb-3`}>
                            <View>
                                <Text style={[tw`text-sm font-bold`, { color: colors.textPrimary }]}>
                                    {dep.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                                </Text>
                                <Text style={[tw`text-xs mt-0.5`, { color: colors.textSecondary }]}>
                                    {fmtTime(dep)}
                                </Text>
                            </View>
                            <View style={[tw`px-3 py-1 rounded-full`, { backgroundColor: colors.primarySoft }]}>
                                <Text style={[tw`text-xs font-bold`, { color: colors.primary }]}>
                                    ₹{item.estimate?.fare} · {item.seatsAvailable} seat{item.seatsAvailable !== 1 ? "s" : ""}
                                </Text>
                            </View>
                        </View>

                        {/* Route visual */}
                        <View style={tw`flex-row items-start mb-1`}>
                            <View style={tw`items-center mr-3 mt-1`}>
                                <View style={[tw`w-2.5 h-2.5 rounded-full`, { backgroundColor: colors.primary }]} />
                                <View style={[tw`w-px`, { backgroundColor: colors.border, height: 20 }]} />
                                <View style={[tw`w-2.5 h-2.5 rounded-full`, { backgroundColor: "#ef4444" }]} />
                            </View>
                            <View style={tw`flex-1`}>
                                <Text style={[tw`text-sm mb-3`, { color: colors.textPrimary }]} numberOfLines={1}>
                                    {pickup?.name || item.route?.start?.name}
                                </Text>
                                <Text style={[tw`text-sm`, { color: colors.textPrimary }]} numberOfLines={1}>
                                    {drop?.name || item.route?.end?.name}
                                </Text>
                            </View>
                        </View>

                        {/* Driver footer */}
                        <View style={[tw`flex-row items-center mt-3 pt-3`, { borderTopWidth: 1, borderTopColor: colors.border }]}>
                            <View style={[tw`w-7 h-7 rounded-full items-center justify-center mr-2`, { backgroundColor: colors.surfaceMuted }]}>
                                <Ionicons name="person" size={14} color={colors.textMuted} />
                            </View>
                            <Text style={[tw`text-xs flex-1`, { color: colors.textSecondary }]}>
                                {isDriver ? "You" : (item.driver?.name || "Driver")}
                            </Text>
                            {item.driver?.rating > 0 && (
                                <View style={tw`flex-row items-center gap-1`}>
                                    <Ionicons name="star" size={11} color="#f59e0b" />
                                    <Text style={[tw`text-xs font-bold`, { color: colors.textSecondary }]}>
                                        {Number(item.driver.rating).toFixed(1)}
                                    </Text>
                                </View>
                            )}
                            <Text style={[tw`text-xs ml-3`, { color: colors.textMuted }]}>
                                {Number(item.estimate?.distanceKm || 0).toFixed(1)} km
                            </Text>
                        </View>
                    </View>
                </TouchableOpacity>
            );
        },
        [bookedRideIds, user?.id, colors, pickup, drop, router]
    );

    /* ── date picker handler ─────────────────────── */
    const onDateChange = (event, selected) => {
        if (Platform.OS === "android") setShowDatePicker(false);
        if (selected) setDate(selected);
    };

    const canSearch = !!pickup && !!drop;

    /* ─── RENDER ─────────────────────────────────── */
    return (
        <View style={[tw`flex-1`, { backgroundColor: colors.background }]}>

            {/* ── Search Form ──────────────────────── */}
            <View style={[tw`pt-12 pb-4 px-5`, { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                <Text style={[tw`text-2xl font-extrabold mb-4`, { color: colors.textPrimary }]}>
                    Find a Ride
                </Text>

                {/* From / To */}
                <View style={tw`gap-2 mb-3`}>
                    <PlaceInput
                        placeholder="From"
                        value={pickup}
                        onSelect={setPickup}
                        colors={colors}
                        icon="navigate"
                        iconColor={colors.primary}
                    />
                    <View style={tw`w-px h-2 ml-5`} />
                    <PlaceInput
                        placeholder="To"
                        value={drop}
                        onSelect={setDrop}
                        colors={colors}
                        icon="location"
                        iconColor="#ef4444"
                    />
                </View>

                {/* Date + Seats */}
                <View style={tw`flex-row gap-3 mb-3`}>
                    <TouchableOpacity
                        onPress={() => setShowDatePicker(true)}
                        style={[
                            tw`flex-1 flex-row items-center px-4 py-3 rounded-xl`,
                            { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
                        ]}
                    >
                        <Ionicons name="calendar-outline" size={15} color={colors.textSecondary} style={tw`mr-2`} />
                        <Text style={[tw`text-sm`, { color: colors.textPrimary }]} numberOfLines={1}>
                            {fmtDate(date)}
                        </Text>
                    </TouchableOpacity>

                    <View style={[tw`flex-row items-center px-3 py-2 rounded-xl`, { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border }]}>
                        <TouchableOpacity onPress={() => setSeats((s) => Math.max(1, s - 1))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="remove-circle-outline" size={22} color={colors.textSecondary} />
                        </TouchableOpacity>
                        <View style={tw`items-center mx-3`}>
                            <Text style={[tw`text-base font-bold`, { color: colors.textPrimary }]}>{seats}</Text>
                            <Text style={[tw`text-[9px]`, { color: colors.textMuted }]}>SEATS</Text>
                        </View>
                        <TouchableOpacity onPress={() => setSeats((s) => Math.min(8, s + 1))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="add-circle-outline" size={22} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Radius selector */}
                {!searched && (
                    <View style={tw`mb-4`}>
                        <View style={tw`flex-row items-center gap-2 mb-2`}>
                            <Ionicons name="radio-outline" size={13} color={colors.textMuted} />
                            <Text style={[tw`text-xs font-bold`, { color: colors.textMuted }]}>
                                SEARCH RADIUS
                            </Text>
                        </View>
                        <View style={tw`flex-row gap-2`}>
                            {[25, 50, 100, 200, 500].map((km) => (
                                <TouchableOpacity
                                    key={km}
                                    onPress={() => {
                                        setNearbyRadius(km);
                                        fetchNearbyWithRadius(km);
                                    }}
                                    style={[
                                        tw`flex-1 py-2 rounded-xl items-center`,
                                        {
                                            backgroundColor: nearbyRadius === km ? colors.primary : colors.surfaceMuted,
                                            borderWidth: 1,
                                            borderColor: nearbyRadius === km ? colors.primary : colors.border,
                                        },
                                    ]}
                                >
                                    <Text
                                        style={[
                                            tw`text-xs font-bold`,
                                            { color: nearbyRadius === km ? colors.primaryText : colors.textSecondary },
                                        ]}
                                    >
                                        {km < 1000 ? `${km}km` : `${km / 1000}k`}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                )}

                {/* Search button */}
                <TouchableOpacity
                    onPress={searchRides}
                    disabled={!canSearch || loading}
                    activeOpacity={0.8}
                    style={[
                        tw`py-3.5 rounded-xl items-center`,
                        { backgroundColor: canSearch ? colors.primary : colors.surfaceMuted },
                    ]}
                >
                    {loading ? (
                        <ActivityIndicator size="small" color={canSearch ? colors.primaryText : colors.textMuted} />
                    ) : (
                        <Text style={[tw`text-sm font-extrabold`, { color: canSearch ? colors.primaryText : colors.textMuted }]}>
                            Search Rides
                        </Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* ── Results ──────────────────────────── */}
            {loading ? (
                <View style={tw`flex-1 items-center justify-center`}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={tw`px-5 pt-4 pb-10`}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* Booked / pinned */}
                    {pinnedRides.length > 0 && (
                        <>
                            <View style={tw`flex-row items-center mb-3 gap-2`}>
                                <MaterialCommunityIcons name="bookmark-check" size={16} color={colors.success} />
                                <Text style={[tw`text-xs font-extrabold tracking-widest`, { color: colors.success }]}>
                                    YOUR BOOKED RIDES
                                </Text>
                            </View>
                            {pinnedRides.map((r) => renderRide(r))}

                            {otherRides.length > 0 && (
                                <View style={[tw`flex-row items-center mb-4 mt-1 gap-3`, { opacity: 0.5 }]}>
                                    <View style={[tw`flex-1 h-px`, { backgroundColor: colors.border }]} />
                                    <Text style={[tw`text-xs font-bold`, { color: colors.textMuted }]}>MORE RIDES</Text>
                                    <View style={[tw`flex-1 h-px`, { backgroundColor: colors.border }]} />
                                </View>
                            )}
                        </>
                    )}

                    {/* Other rides */}
                    {otherRides.map((r) => renderRide(r))}

                    {/* Empty state */}
                    {searched && rides.length === 0 && !loading && (
                        <View style={tw`items-center mt-16`}>
                            <Ionicons name="car-outline" size={52} color={colors.textMuted} />
                            <Text style={[tw`text-base font-semibold mt-4`, { color: colors.textSecondary }]}>
                                No rides found
                            </Text>
                            <Text style={[tw`text-sm mt-1 text-center`, { color: colors.textMuted }]}>
                                Try a different date or location
                            </Text>
                        </View>
                    )}

                    {!searched && (
                        <>
                            {/* Location denied banner */}
                            {locationDenied && (
                                <View
                                    style={[
                                        tw`flex-row items-center gap-3 px-4 py-3 rounded-xl mb-4`,
                                        { backgroundColor: "rgba(239,68,68,0.1)", borderWidth: 1, borderColor: "rgba(239,68,68,0.25)" },
                                    ]}
                                >
                                    <Ionicons name="location-outline" size={18} color="#ef4444" />
                                    <Text style={[tw`text-xs flex-1`, { color: "#ef4444" }]}>
                                        Location access denied — nearby rides can't be detected. Search manually above.
                                    </Text>
                                </View>
                            )}

                            {/* Nearby rides loading */}
                            {nearbyLoading && (
                                <View style={tw`items-center py-8`}>
                                    <ActivityIndicator size="small" color={colors.primary} />
                                    <Text style={[tw`text-xs mt-2`, { color: colors.textMuted }]}>
                                        Finding rides near you…
                                    </Text>
                                </View>
                            )}

                            {/* Nearby rides list */}
                            {!nearbyLoading && nearbyRides.length > 0 && (
                                <>
                                    <View style={tw`flex-row items-center mb-3 gap-2`}>
                                        <Ionicons name="location" size={16} color={colors.primary} />
                                        <Text style={[tw`text-xs font-extrabold tracking-widest`, { color: colors.primary }]}>
                                            AVAILABLE RIDES · {nearbyRadius} KM RADIUS
                                        </Text>
                                    </View>
                                    {nearbyRides.map((r) => renderRide(r))}
                                </>
                            )}

                            {/* Nothing at all */}
                            {!nearbyLoading && nearbyRides.length === 0 && !locationDenied && (
                                <View style={tw`items-center mt-16`}>
                                    <Ionicons name="search-outline" size={52} color={colors.textMuted} />
                                    <Text style={[tw`text-base font-semibold mt-4`, { color: colors.textSecondary }]}>
                                        No rides available
                                    </Text>
                                    <Text style={[tw`text-sm mt-1 text-center`, { color: colors.textMuted }]}>
                                        Try searching a specific route above
                                    </Text>
                                </View>
                            )}
                        </>
                    )}
                </ScrollView>
            )}

            {/* ── Date picker ──────────────────────── */}
            {showDatePicker && (
                Platform.OS === "ios" ? (
                    <Modal transparent animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
                        <Pressable style={tw`flex-1 bg-black/40 justify-end`} onPress={() => setShowDatePicker(false)}>
                            <View style={[tw`rounded-t-3xl pb-8 pt-4 px-5`, { backgroundColor: colors.surface }]}>
                                <View style={tw`flex-row justify-between items-center mb-2`}>
                                    <Text style={[tw`text-base font-bold`, { color: colors.textPrimary }]}>Select Date</Text>
                                    <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                                        <Text style={[tw`text-sm font-bold`, { color: colors.primary }]}>Done</Text>
                                    </TouchableOpacity>
                                </View>
                                <DateTimePicker
                                    value={date}
                                    mode="date"
                                    display="spinner"
                                    minimumDate={new Date()}
                                    onChange={onDateChange}
                                    themeVariant={scheme}
                                />
                            </View>
                        </Pressable>
                    </Modal>
                ) : (
                    <DateTimePicker
                        value={date}
                        mode="date"
                        display="default"
                        minimumDate={new Date()}
                        onChange={onDateChange}
                    />
                )
            )}
        </View>
    );
}