import {
    View, Text, TouchableOpacity, ActivityIndicator,
    useColorScheme, Alert, Platform, ScrollView,
    Modal, Pressable, PanResponder,
    Animated, Dimensions, StyleSheet, Image,
} from "react-native";
import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "expo-router";
import { useUser } from "@clerk/clerk-expo";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Location from "expo-location";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import tw from "twrnc";
import { theme } from "../../../constants/Colors";
import { decodePolyline } from "../../../utils/polyline";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SNAP_BOTTOM = SCREEN_HEIGHT * 0.55;   // collapsed
const SNAP_TOP = 60;                         // expanded: nearly full-screen

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

/* ─── helpers ─────────────────────────────────────── */
const fmtTime = (d) =>
    d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

/** Haversine distance between two {lat,lng} points → km */
function haversineKm(a, b) {
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);
    const h = sinLat * sinLat +
        Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLng * sinLng;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/* ─── PlaceInput ──────────────────────────────────── */
/**
 * When `inline` is true the autocomplete opens as an absolute-positioned
 * overlay instead of a nested <Modal>.  This avoids the "nested-modal"
 * problem on Android where the inner modal's text-input & suggestions
 * list stop responding to touches.
 */
function PlaceInput({ placeholder, value, onSelect, colors, icon, iconColor, inline = false }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    const trigger = (
        <TouchableOpacity
            onPress={() => {
                setOpen(true);
                setTimeout(() => ref.current?.focus(), 300);
            }}
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
    );

    const autocompleteContent = (
        <View style={[tw`flex-1`, { backgroundColor: colors.background }]}>
            <View
                style={[
                    tw`flex-row items-center px-4 pt-12 pb-4 gap-3`,
                    { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
            >
                <TouchableOpacity onPress={() => setOpen(false)}>
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
                    setOpen(false);
                }}
                keyboardShouldPersistTaps="always"
                styles={{
                    container: { flex: 1 },
                    textInputContainer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.background },
                    textInput: {
                        backgroundColor: colors.surfaceMuted, borderRadius: 12, fontSize: 14,
                        color: colors.textPrimary, paddingHorizontal: 14, height: 46,
                        borderWidth: 1, borderColor: colors.border,
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
    );

    /* ── inline mode: absolute overlay instead of nested Modal ── */
    if (inline) {
        return (
            <>
                {trigger}
                {open && (
                    <View
                        style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: Dimensions.get("window").width,
                            height: Dimensions.get("window").height,
                            zIndex: 999,
                            elevation: 999,
                            backgroundColor: colors.background,
                        }}
                    >
                        {autocompleteContent}
                    </View>
                )}
            </>
        );
    }

    /* ── default mode: separate Modal ── */
    return (
        <>
            {trigger}
            <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
                {autocompleteContent}
            </Modal>
        </>
    );
}

/* ─── FilterToggle ──────────────────────────────────── */
function FilterToggle({ colors, icon, label, subtitle, value, onToggle }) {
    return (
        <TouchableOpacity
            onPress={onToggle}
            activeOpacity={0.7}
            style={[
                tw`flex-row items-center justify-between p-4 rounded-2xl mb-3`,
                {
                    backgroundColor: value ? colors.primarySoft : colors.surfaceMuted,
                    borderWidth: 1,
                    borderColor: value ? colors.primary : colors.border,
                },
            ]}
        >
            <View style={[tw`flex-row items-center`, { gap: 12 }]}>
                <View
                    style={[
                        tw`w-9 h-9 rounded-xl items-center justify-center`,
                        { backgroundColor: value ? colors.primary + "22" : colors.background },
                    ]}
                >
                    <Ionicons name={icon} size={18} color={value ? colors.primary : colors.textSecondary} />
                </View>
                <View>
                    <Text style={[tw`text-sm font-bold`, { color: value ? colors.primary : colors.textPrimary }]}>
                        {label}
                    </Text>
                    {subtitle && (
                        <Text style={[tw`text-xs mt-0.5`, { color: colors.textMuted }]}>{subtitle}</Text>
                    )}
                </View>
            </View>
            <View
                style={[
                    tw`w-6 h-6 rounded-full items-center justify-center`,
                    {
                        backgroundColor: value ? colors.primary : "transparent",
                        borderWidth: value ? 0 : 2,
                        borderColor: colors.border,
                    },
                ]}
            >
                {value && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
        </TouchableOpacity>
    );
}

/* ══════════════════════════════════════════════════════
   Main Page
   ══════════════════════════════════════════════════════ */
export default function SearchRides() {
    const router = useRouter();
    const { user } = useUser();
    const scheme = useColorScheme();
    const colors = theme[scheme ?? "light"];

    /* ── form state ──────────────────────────────── */
    const [pickup, setPickup] = useState(null);
    const [drop, setDrop] = useState(null);
    const [date, setDate] = useState(new Date());
    const [seats, setSeats] = useState(1);
    const [showDatePicker, setShowDatePicker] = useState(false);

    /* ── filter state ────────────────────────────── */
    const [petFriendly, setPetFriendly] = useState(false);
    const [noSmoking, setNoSmoking] = useState(false);
    const [acRequired, setAcRequired] = useState(false);
    const [ladiesOnly, setLadiesOnly] = useState(false);
    const [musicAllowed, setMusicAllowed] = useState(false);
    const [minRating, setMinRating] = useState(null);
    const [vehicleType, setVehicleType] = useState(null);

    /* ── results state ───────────────────────────── */
    const [rides, setRides] = useState([]);
    const [bookedRideIds, setBookedRideIds] = useState(new Set());
    const [requestedRideIds, setRequestedRideIds] = useState(new Set());
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);

    /* ── nearby rides ────────────────────────────── */
    const [nearbyRides, setNearbyRides] = useState([]);
    const [nearbyLoading, setNearbyLoading] = useState(false);
    const [locationDenied, setLocationDenied] = useState(false);
    const [nearbyRadius, setNearbyRadius] = useState(50);
    const userLocationRef = useRef(null);
    const [userLocation, setUserLocation] = useState(null);
    const [mapRegion, setMapRegion] = useState({
        latitude: 20.5937,
        longitude: 78.9629,
        latitudeDelta: 0.15,
        longitudeDelta: 0.15,
    });

    /* ── booking modal state ─────────────────────── */
    const [selectedNearbyRide, setSelectedNearbyRide] = useState(null);
    const [bookingPickup, setBookingPickup] = useState(null);
    const [bookingDrop, setBookingDrop] = useState(null);

    /* ── bottom sheet animation ──────────────────── */
    const sheetY = useRef(new Animated.Value(SNAP_BOTTOM)).current;
    const lastSnap = useRef(SNAP_BOTTOM);
    const [isExpanded, setIsExpanded] = useState(false);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 10,
            onPanResponderGrant: () => {
                sheetY.setOffset(lastSnap.current);
                sheetY.setValue(0);
            },
            onPanResponderMove: (_, g) => {
                const next = lastSnap.current + g.dy;
                if (next >= SNAP_TOP && next <= SNAP_BOTTOM) {
                    sheetY.setOffset(0);
                    sheetY.setValue(next);
                }
            },
            onPanResponderRelease: (_, g) => {
                sheetY.flattenOffset();
                const swipedUp = g.dy < -60 || g.vy < -0.5;
                const swipedDown = g.dy > 60 || g.vy > 0.5;
                let dest = lastSnap.current;
                if (swipedUp) dest = SNAP_TOP;
                else if (swipedDown) dest = SNAP_BOTTOM;
                lastSnap.current = dest;
                setIsExpanded(dest === SNAP_TOP);
                Animated.spring(sheetY, { toValue: dest, useNativeDriver: false, bounciness: 4, speed: 16 }).start();
            },
        })
    ).current;

    const collapseSheet = useCallback(() => {
        lastSnap.current = SNAP_BOTTOM;
        setIsExpanded(false);
        Animated.spring(sheetY, { toValue: SNAP_BOTTOM, useNativeDriver: false, bounciness: 4, speed: 16 }).start();
    }, [sheetY]);

    const expandSheet = useCallback(() => {
        lastSnap.current = SNAP_TOP;
        setIsExpanded(true);
        Animated.spring(sheetY, { toValue: SNAP_TOP, useNativeDriver: false, bounciness: 4, speed: 16 }).start();
    }, [sheetY]);

    /* search box opacity + scale driven by sheet position */
    const searchBoxOpacity = sheetY.interpolate({
        inputRange: [SNAP_TOP, SNAP_TOP + (SNAP_BOTTOM - SNAP_TOP) * 0.3, SNAP_BOTTOM],
        outputRange: [0, 0, 1],
        extrapolate: "clamp",
    });
    const searchBoxScale = sheetY.interpolate({
        inputRange: [SNAP_TOP, SNAP_BOTTOM],
        outputRange: [0.85, 1],
        extrapolate: "clamp",
    });
    const searchBoxTranslateY = sheetY.interpolate({
        inputRange: [SNAP_TOP, SNAP_BOTTOM],
        outputRange: [-80, 0],
        extrapolate: "clamp",
    });

    /* ── fetch nearby rides on mount ─────────────── */
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== "granted") { if (!cancelled) setLocationDenied(true); return; }
                setNearbyLoading(true);
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                const { latitude, longitude } = loc.coords;
                userLocationRef.current = { latitude, longitude };
                setUserLocation({ latitude, longitude });
                setMapRegion({ latitude, longitude, latitudeDelta: 0.1, longitudeDelta: 0.1 });

                const [nearbyRes, bookingsRes] = await Promise.all([
                    fetch(`${BACKEND_URL}/api/rides/nearby?lat=${latitude}&lng=${longitude}&radiusKm=${nearbyRadius}&limit=15`),
                    user?.id ? fetch(`${BACKEND_URL}/api/rider/rider-rides/${user.id}`) : Promise.resolve(null),
                ]);
                const nearbyData = await nearbyRes.json();
                if (bookingsRes) {
                    const bookingsData = await bookingsRes.json();
                    const booked = new Set(
                        (Array.isArray(bookingsData) ? bookingsData : [])
                            .filter((b) => b.status === "confirmed")
                            .map((b) => b.ride?._id?.toString()).filter(Boolean),
                    );
                    const requested = new Set(
                        (Array.isArray(bookingsData) ? bookingsData : [])
                            .filter((b) => b.status === "requested")
                            .map((b) => b.ride?._id?.toString()).filter(Boolean),
                    );
                    if (!cancelled) {
                        setBookedRideIds((prev) => new Set([...prev, ...booked]));
                        setRequestedRideIds((prev) => new Set([...prev, ...requested]));
                    }
                }
                if (!cancelled && nearbyRes.ok && Array.isArray(nearbyData)) {
                    const now = new Date();
                    const filtered = nearbyData.filter((r) => new Date(r.schedule?.departureTime) >= now);
                    // Log km-wise ride distances from user
                    console.log(`[Nearby] Fetched ${nearbyData.length} rides, ${filtered.length} upcoming (radius=${nearbyRadius}km):`);
                    filtered.forEach((r, i) => {
                        const dist = r.estimate?.userToStartKm;
                        const dep = r.schedule?.departureTime;
                        console.log(`  #${i + 1} "${r.route?.start?.name}" → "${r.route?.end?.name}"  |  ${dist ?? '?'} km from start  |  departs: ${dep}`);
                    });
                    setNearbyRides(filtered);
                }
            } catch (e) { console.log("Nearby rides fetch failed:", e.message); }
            finally { if (!cancelled) setNearbyLoading(false); }
        })();
        return () => { cancelled = true; };
    }, [user?.id]);

    /* ── re-fetch nearby when radius changes ──────── */
    const fetchNearbyWithRadius = useCallback(async (radius) => {
        const loc = pickup
            ? { latitude: pickup.lat, longitude: pickup.lng }
            : userLocationRef.current;
        if (!loc || searched) return;
        setNearbyLoading(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/rides/nearby?lat=${loc.latitude}&lng=${loc.longitude}&radiusKm=${radius}&limit=30`);
            const data = await res.json();
            if (res.ok && Array.isArray(data)) {
                const now = new Date();
                const filtered = data.filter((r) => new Date(r.schedule?.departureTime) >= now);
                console.log(`[Nearby] Radius ${radius}km → ${data.length} rides, ${filtered.length} upcoming:`);
                filtered.forEach((r, i) => {
                    console.log(`  #${i + 1} "${r.route?.start?.name}" → "${r.route?.end?.name}"  |  ${r.estimate?.userToStartKm ?? '?'} km from start`);
                });
                setNearbyRides(filtered);
            }
        } catch (e) { console.log("Radius re-fetch failed:", e.message); }
        finally { setNearbyLoading(false); }
    }, [searched, pickup]);

    /* ── re-fetch nearby when pickup changes ──────── */
    useEffect(() => {
        if (pickup && !searched) {
            setMapRegion({ latitude: pickup.lat, longitude: pickup.lng, latitudeDelta: 0.1, longitudeDelta: 0.1 });
            fetchNearbyWithRadius(nearbyRadius);
        }
    }, [pickup]);

    /* ── search ─────────────────────────────────── */
    const searchRides = useCallback(async () => {
        if (!pickup || !drop) { Alert.alert("Missing info", "Please select both a pickup and a drop location."); return; }
        setLoading(true);
        setSearched(true);
        try {
            const dateStr = date.toISOString();
            const [searchRes, bookingsRes] = await Promise.all([
                fetch(`${BACKEND_URL}/api/rides/search?pickupLat=${pickup.lat}&pickupLng=${pickup.lng}&dropLat=${drop.lat}&dropLng=${drop.lng}&date=${encodeURIComponent(dateStr)}&minSeats=${seats}`),
                fetch(`${BACKEND_URL}/api/rider/rider-rides/${user?.id}`),
            ]);
            const searchData = await searchRes.json();
            const bookingsData = await bookingsRes.json();
            const booked = new Set(
                (Array.isArray(bookingsData) ? bookingsData : [])
                    .filter((b) => b.status === "confirmed")
                    .map((b) => b.ride?._id?.toString()).filter(Boolean),
            );
            const requested = new Set(
                (Array.isArray(bookingsData) ? bookingsData : [])
                    .filter((b) => b.status === "requested")
                    .map((b) => b.ride?._id?.toString()).filter(Boolean),
            );
            setBookedRideIds(booked);
            setRequestedRideIds(requested);
            const now = new Date();
            setRides(
                (Array.isArray(searchData) ? searchData : [])
                    .filter((r) => r.seatsAvailable >= seats)
                    .filter((r) => new Date(r.schedule?.departureTime) >= now),
            );
        } catch (e) { console.error("Search error:", e); setRides([]); }
        finally { setLoading(false); }
    }, [pickup, drop, date, seats, user?.id]);

    /* ── sort: booked first ─────────────────────── */
    const { pinnedRides, otherRides } = useMemo(() => {
        const pinned = rides.filter((r) => bookedRideIds.has(r._id?.toString()) || requestedRideIds.has(r._id?.toString()));
        const other  = rides.filter((r) => !bookedRideIds.has(r._id?.toString()) && !requestedRideIds.has(r._id?.toString()));
        return { pinnedRides: pinned, otherRides: other };
    }, [rides, bookedRideIds, requestedRideIds]);

    /* ── booking modal map region ────────────────── */
    const bookingMapRegion = useMemo(() => {
        if (!selectedNearbyRide) return mapRegion;
        const points = [];
        const s = selectedNearbyRide.route?.start?.location?.coordinates;
        const e = selectedNearbyRide.route?.end?.location?.coordinates;
        if (s) points.push({ lat: s[1], lng: s[0] });
        if (e) points.push({ lat: e[1], lng: e[0] });
        if (bookingPickup) points.push(bookingPickup);
        if (bookingDrop) points.push(bookingDrop);
        if (points.length === 0) return mapRegion;
        const lats = points.map((p) => p.lat);
        const lngs = points.map((p) => p.lng);
        return {
            latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
            longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
            latitudeDelta: Math.max((Math.max(...lats) - Math.min(...lats)) * 1.6, 0.02),
            longitudeDelta: Math.max((Math.max(...lngs) - Math.min(...lngs)) * 1.6, 0.02),
        };
    }, [selectedNearbyRide, bookingPickup, bookingDrop, mapRegion]);

    const bookingRoutePoints = useMemo(() => {
        if (!selectedNearbyRide?.route?.encodedPolyline) return [];
        try { return decodePolyline(selectedNearbyRide.route.encodedPolyline); }
        catch { return []; }
    }, [selectedNearbyRide]);

    const closeBookingModal = useCallback(() => {
        setSelectedNearbyRide(null);
        setBookingPickup(null);
        setBookingDrop(null);
    }, []);

    /* ── ride card ────────────────────────────────── */
    const renderRide = useCallback(
        (item) => {
            const rideId   = item._id?.toString();
            const isBooked = bookedRideIds.has(rideId);
            const isRequested = requestedRideIds.has(rideId);
            const isDriver = item.driver?.userId === user?.id;
            const dep      = new Date(item.schedule?.departureTime);
            const isUpcoming = dep > new Date();

            let badge = null;
            if (isDriver) {
                badge = { label: "YOU'RE THE DRIVER", bg: colors.primarySoft, color: colors.primary, icon: "car" };
            } else if (isBooked) {
                badge = {
                    label: isUpcoming ? "CONFIRMED" : "BOOKED",
                    bg: "rgba(7,136,41,0.12)", color: colors.success,
                    icon: isUpcoming ? "check-circle" : "check-circle",
                };
            } else if (isRequested) {
                badge = {
                    label: "REQUESTED — PENDING",
                    bg: "rgba(245,158,11,0.12)", color: "#f59e0b",
                    icon: "clock-outline",
                };
            }

            return (
                <TouchableOpacity
                    key={rideId}
                    onPress={() => {
                        if (!searched) {
                            setSelectedNearbyRide(item);
                            setBookingPickup(pickup || null);
                            setBookingDrop(drop || null);
                            return;
                        }
                        router.push({
                            pathname: "/(rider)/search/details",
                            params: {
                                rideId,
                                pickupName: pickup?.name, pickupLat: String(pickup?.lat), pickupLng: String(pickup?.lng),
                                dropName: drop?.name, dropLat: String(drop?.lat), dropLng: String(drop?.lng),
                                estimatedFare: String(item.estimate?.fare ?? ""),
                                isBooked: isBooked ? "1" : "0",
                                isRequested: isRequested ? "1" : "0",
                                isDriver: isDriver ? "1" : "0",
                                seatsRequested: String(seats),
                            },
                        });
                    }}
                    activeOpacity={0.85}
                    style={[
                        tw`rounded-2xl mb-3 overflow-hidden`,
                        {
                            backgroundColor: colors.surface, borderWidth: 1,
                            borderColor: isDriver ? colors.primary : isBooked ? "rgba(19,236,91,0.4)" : isRequested ? "rgba(245,158,11,0.4)" : colors.border,
                        },
                    ]}
                >
                    {badge && (
                        <View style={[tw`flex-row items-center px-4 py-2`, { backgroundColor: badge.bg, gap: 6 }]}>
                            <MaterialCommunityIcons name={badge.icon} size={12} color={badge.color} />
                            <Text style={[tw`text-xs font-extrabold tracking-widest`, { color: badge.color }]}>{badge.label}</Text>
                        </View>
                    )}
                    <View style={tw`p-4`}>
                        {/* Time + Price */}
                        <View style={tw`flex-row justify-between items-start mb-3`}>
                            <Text style={[tw`text-xs font-bold uppercase tracking-wider`, { color: colors.primary }]}>
                                {dep.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}, {fmtTime(dep)}
                            </Text>
                            <View style={[tw`px-3 py-1 rounded-full items-center`, { backgroundColor: colors.primarySoft }]}>
                                <Text style={[tw`text-sm font-bold`, { color: colors.primary }]}>₹{item.estimate?.fare}</Text>
                                <Text style={[tw`text-[10px]`, { color: colors.primary }]}>
                                    {item.seatsAvailable} seat{item.seatsAvailable !== 1 ? "s" : ""} left
                                </Text>
                            </View>
                        </View>

                        {/* Route */}
                        <View style={tw`flex-row items-start mb-1`}>
                            <View style={tw`items-center mr-3 mt-1`}>
                                <View style={[tw`w-2.5 h-2.5 rounded-full`, { backgroundColor: colors.primary }]} />
                                <View style={[tw`w-0.5`, { backgroundColor: colors.border, height: 24 }]} />
                                <View style={[tw`w-2.5 h-2.5 rounded-full border-2`, { borderColor: colors.primary }]} />
                            </View>
                            <View style={tw`flex-1`}>
                                <Text style={[tw`text-sm font-semibold`, { color: colors.textPrimary }]} numberOfLines={1}>
                                    {pickup?.name || item.route?.start?.name || "Origin"}
                                </Text>
                                <Text style={[tw`text-sm font-semibold mt-3`, { color: colors.textPrimary }]} numberOfLines={1}>
                                    {drop?.name || item.route?.end?.name || "Destination"}
                                </Text>
                            </View>
                        </View>

                        {/* Driver footer */}
                        <View style={[tw`flex-row items-center mt-3 pt-3`, { borderTopWidth: 1, borderTopColor: colors.border }]}>
                            <View style={[tw`w-8 h-8 rounded-full items-center justify-center mr-2`, { backgroundColor: colors.surfaceMuted }]}>
                                <Ionicons name="person" size={14} color={colors.textMuted} />
                            </View>
                            <View style={tw`flex-1`}>
                                <Text style={[tw`text-sm font-bold`, { color: colors.textPrimary }]}>
                                    {isDriver ? "You" : (item.driver?.name || "Driver")}
                                </Text>
                                {item.driver?.rating > 0 && (
                                    <View style={[tw`flex-row items-center`, { gap: 3 }]}>
                                        <Ionicons name="star" size={10} color="#f59e0b" />
                                        <Text style={[tw`text-[10px]`, { color: colors.textMuted }]}>
                                            {Number(item.driver.rating).toFixed(1)}
                                        </Text>
                                    </View>
                                )}
                            </View>
                            <Text style={[tw`text-xs font-bold`, { color: colors.textMuted }]}>
                                {Number(item.estimate?.userToStartKm ?? 0).toFixed(1)} km from start
                            </Text>
                        </View>
                    </View>
                </TouchableOpacity>
            );
        },
        [bookedRideIds, requestedRideIds, user?.id, colors, pickup, drop, router, searched],
    );

    /* ── date picker handler ─────────────────────── */
    const onDateChange = (event, selected) => {
        if (Platform.OS === "android") setShowDatePicker(false);
        if (selected) setDate(selected);
    };

    const canSearch = !!pickup && !!drop;

    /* ══════════════════════════════════════════════
       RENDER
       ══════════════════════════════════════════════ */
    return (
        <View style={[tw`flex-1`, { backgroundColor: colors.background }]}>

            {/* ── Map Background ───────────────────── */}
            <MapView
                provider={PROVIDER_DEFAULT}
                style={StyleSheet.absoluteFill}
                region={mapRegion}
                showsUserLocation={false}
                showsMyLocationButton={false}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                userInterfaceStyle={scheme === "dark" ? "dark" : "light"}
            >
                {/* Custom user profile pin */}
                {userLocation && (
                    <Marker
                        coordinate={{
                            latitude: userLocation.latitude,
                            longitude: userLocation.longitude,
                        }}
                        anchor={{ x: 0.5, y: 1 }}
                    >
                        <View style={styles.pinContainer}>
                            <View style={[styles.pinBubble, { borderColor: colors.primary }]}>
                                {user?.imageUrl ? (
                                    <Image source={{ uri: user.imageUrl }} style={styles.pinImage} />
                                ) : (
                                    <View style={[styles.pinImage, { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }]}>
                                        <Ionicons name="person" size={16} color="#fff" />
                                    </View>
                                )}
                            </View>
                            <View style={[styles.pinArrow, { borderTopColor: colors.primary }]} />
                        </View>
                    </Marker>
                )}
            </MapView>

            {/* ── Top Search Overlay ───────────────── */}
            <Animated.View
                style={[
                    tw`absolute top-0 left-0 right-0 z-20 pt-12 px-4 pb-3`,
                    {
                        opacity: searchBoxOpacity,
                        transform: [{ scale: searchBoxScale }, { translateY: searchBoxTranslateY }],
                    },
                ]}
                pointerEvents={isExpanded ? "none" : "auto"}
            >
                <View
                    style={[
                        tw`rounded-2xl p-4`,
                        {
                            backgroundColor: colors.surface,
                            borderWidth: 1,
                            borderColor: colors.border,
                            shadowColor: "#000",
                            shadowOpacity: 0.1,
                            shadowRadius: 16,
                            shadowOffset: { width: 0, height: 4 },
                            elevation: 8,
                        },
                    ]}
                >
                    {/* From / To */}
                    <View style={{ gap: 8 }}>
                        <PlaceInput placeholder="From: Current Location" value={pickup} onSelect={setPickup} colors={colors} icon="radio-button-on" iconColor={colors.primary} />
                        {/* Connecting line */}
                        <View style={[tw`absolute`, { left: 28, top: 42, width: 2, height: 12, backgroundColor: colors.border }]} />
                        <PlaceInput placeholder="To: Destination" value={drop} onSelect={setDrop} colors={colors} icon="location" iconColor={colors.primary} />
                    </View>

                    {/* Date + Seats row */}
                    <View style={[tw`flex-row mt-3`, { gap: 8 }]}>
                        <TouchableOpacity
                            onPress={() => setShowDatePicker(true)}
                            style={[
                                tw`flex-1 flex-row items-center px-3 py-2.5 rounded-xl`,
                                { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
                            ]}
                        >
                            <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} style={tw`mr-2`} />
                            <Text style={[tw`text-sm font-medium`, { color: colors.textPrimary }]} numberOfLines={1}>
                                {date.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
                            </Text>
                        </TouchableOpacity>

                        <View style={[tw`flex-row items-center rounded-xl px-2`, { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border, gap: 6 }]}>
                            <TouchableOpacity
                                onPress={() => setSeats((s) => Math.max(1, s - 1))}
                                style={[tw`w-7 h-7 rounded-full items-center justify-center`, { backgroundColor: colors.background }]}
                            >
                                <Ionicons name="remove" size={16} color={colors.textSecondary} />
                            </TouchableOpacity>
                            <Text style={[tw`text-sm font-bold`, { color: colors.textPrimary, minWidth: 18, textAlign: "center" }]}>
                                {seats}
                            </Text>
                            <TouchableOpacity
                                onPress={() => setSeats((s) => Math.min(8, s + 1))}
                                style={[tw`w-7 h-7 rounded-full items-center justify-center`, { backgroundColor: colors.primary }]}
                            >
                                <Ionicons name="add" size={16} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Search button */}
                    <TouchableOpacity
                        onPress={searchRides}
                        disabled={!canSearch || loading}
                        activeOpacity={0.8}
                        style={[
                            tw`mt-3 py-3.5 rounded-xl flex-row items-center justify-center`,
                            {
                                backgroundColor: canSearch ? colors.primary : colors.surfaceMuted,
                                gap: 8,
                                shadowColor: colors.primary,
                                shadowOpacity: canSearch ? 0.3 : 0,
                                shadowRadius: 12,
                                shadowOffset: { width: 0, height: 4 },
                                elevation: canSearch ? 6 : 0,
                            },
                        ]}
                    >
                        {loading ? (
                            <ActivityIndicator size="small" color={canSearch ? "#fff" : colors.textMuted} />
                        ) : (
                            <>
                                <Ionicons name="search" size={20} color={canSearch ? "#fff" : colors.textMuted} />
                                <Text style={[tw`text-sm font-extrabold`, { color: canSearch ? "#fff" : colors.textMuted }]}>
                                    Search Rides
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </Animated.View>

            {/* ── Bottom Sheet ─────────────────────── */}
            <Animated.View
                style={[
                    styles.sheet,
                    {
                        top: sheetY,
                        backgroundColor: colors.surface,
                        borderTopLeftRadius: 28,
                        borderTopRightRadius: 28,
                        borderTopWidth: 1,
                        borderTopColor: colors.border,
                        shadowColor: "#000",
                        shadowOpacity: 0.15,
                        shadowRadius: 20,
                        shadowOffset: { width: 0, height: -4 },
                        elevation: 16,
                    },
                ]}
            >
                {/* Drag Handle */}
                <View {...panResponder.panHandlers} style={tw`w-full items-center pt-3 pb-2`}>
                    <View style={[tw`w-10 h-1 rounded-full`, { backgroundColor: colors.textMuted + "60" }]} />
                </View>

                {/* Back button when expanded */}
                {isExpanded && (
                    <View style={[tw`flex-row items-center px-5 pb-2`, { gap: 10 }]}>
                        <TouchableOpacity
                            onPress={collapseSheet}
                            style={[tw`flex-row items-center px-3 py-2 rounded-full`, { backgroundColor: colors.surfaceMuted, gap: 6 }]}
                        >
                            <Ionicons name="chevron-down" size={18} color={colors.textPrimary} />
                            <Text style={[tw`text-sm font-bold`, { color: colors.textPrimary }]}>Back</Text>
                        </TouchableOpacity>
                    </View>
                )}

                    {/* ── Rides list ────────────────── */}
                    <ScrollView contentContainerStyle={tw`px-5 pt-1 pb-24`} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" bounces>
                        {/* Header */}
                        <View style={tw`mb-4`}>
                            <Text style={[tw`text-lg font-bold`, { color: colors.textPrimary }]}>Available Rides</Text>
                            <Text style={[tw`text-sm mt-0.5`, { color: colors.textMuted }]}>
                                {searched
                                    ? `${rides.length} ride${rides.length !== 1 ? "s" : ""} found`
                                    : `${nearbyRides.length} driver${nearbyRides.length !== 1 ? "s" : ""} found nearby`}
                            </Text>
                        </View>

                        {loading && (
                            <View style={tw`items-center py-8`}>
                                <ActivityIndicator size="large" color={colors.primary} />
                            </View>
                        )}

                        {!loading && pinnedRides.length > 0 && (
                            <>
                                <View style={[tw`flex-row items-center mb-3`, { gap: 6 }]}>
                                    <MaterialCommunityIcons name="bookmark-check" size={14} color={colors.success} />
                                    <Text style={[tw`text-xs font-extrabold tracking-widest`, { color: colors.success }]}>YOUR RIDES</Text>
                                </View>
                                {pinnedRides.map((r) => renderRide(r))}
                                {otherRides.length > 0 && (
                                    <View style={[tw`flex-row items-center mb-3 mt-1`, { gap: 10, opacity: 0.45 }]}>
                                        <View style={[tw`flex-1 h-px`, { backgroundColor: colors.border }]} />
                                        <Text style={[tw`text-[10px] font-bold`, { color: colors.textMuted }]}>MORE RIDES</Text>
                                        <View style={[tw`flex-1 h-px`, { backgroundColor: colors.border }]} />
                                    </View>
                                )}
                            </>
                        )}

                        {!loading && otherRides.map((r) => renderRide(r))}

                        {!loading && searched && rides.length === 0 && (
                            <View style={tw`items-center mt-10`}>
                                <Ionicons name="car-outline" size={48} color={colors.textMuted} />
                                <Text style={[tw`text-base font-semibold mt-4`, { color: colors.textSecondary }]}>No rides found</Text>
                                <Text style={[tw`text-sm mt-1 text-center`, { color: colors.textMuted }]}>Try a different date or location</Text>
                            </View>
                        )}

                        {!loading && !searched && (
                            <>
                                {locationDenied && (
                                    <View style={[tw`flex-row items-center px-3 py-2.5 rounded-xl mb-3`, { backgroundColor: "rgba(239,68,68,0.08)", borderWidth: 1, borderColor: "rgba(239,68,68,0.2)", gap: 8 }]}>
                                        <Ionicons name="location-outline" size={16} color="#ef4444" />
                                        <Text style={[tw`text-xs flex-1`, { color: "#ef4444" }]}>Location access denied — search manually above.</Text>
                                    </View>
                                )}

                                {/* Radius header + pills — ALWAYS visible */}
                                <View style={[tw`flex-row items-center mb-3`, { gap: 6 }]}>
                                    <Ionicons name="location" size={14} color={colors.primary} />
                                    <Text style={[tw`text-xs font-extrabold tracking-widest`, { color: colors.primary }]}>WITHIN {nearbyRadius} KM</Text>
                                </View>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`mb-3`} contentContainerStyle={{ gap: 8 }}>
                                    {[25, 50, 100, 200, 500].map((km) => (
                                        <TouchableOpacity
                                            key={km}
                                            onPress={() => { setNearbyRadius(km); fetchNearbyWithRadius(km); }}
                                            style={[
                                                tw`py-1.5 px-3 rounded-full`,
                                                {
                                                    backgroundColor: nearbyRadius === km ? colors.primary : colors.surfaceMuted,
                                                    borderWidth: 1,
                                                    borderColor: nearbyRadius === km ? colors.primary : colors.border,
                                                },
                                            ]}
                                        >
                                            <Text style={[tw`text-xs font-bold`, { color: nearbyRadius === km ? "#fff" : colors.textSecondary }]}>
                                                {km} km
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>

                                {nearbyLoading && (
                                    <View style={tw`items-center py-8`}>
                                        <ActivityIndicator size="small" color={colors.primary} />
                                        <Text style={[tw`text-xs mt-2`, { color: colors.textMuted }]}>Finding rides near you…</Text>
                                    </View>
                                )}
                                {!nearbyLoading && nearbyRides.length > 0 && nearbyRides.map((r) => renderRide(r))}
                                {!nearbyLoading && nearbyRides.length === 0 && !locationDenied && (
                                    <View style={tw`items-center mt-6`}>
                                        <Ionicons name="search-outline" size={48} color={colors.textMuted} />
                                        <Text style={[tw`text-base font-semibold mt-4`, { color: colors.textSecondary }]}>No rides within {nearbyRadius} km</Text>
                                        <Text style={[tw`text-sm mt-1 text-center`, { color: colors.textMuted }]}>Try increasing the radius or search a specific route</Text>
                                    </View>
                                )}
                            </>
                        )}
                    </ScrollView>
            </Animated.View>

            {/* ── Expand hint FAB (only when collapsed & not expanded) ── */}

            {/* ── Booking Modal for Nearby Rides ─── */}
            <Modal
                visible={!!selectedNearbyRide}
                animationType="slide"
                onRequestClose={closeBookingModal}
            >
                <View style={[tw`flex-1`, { backgroundColor: colors.background }]}>
                    {/* Header */}
                    <View
                        style={[
                            tw`flex-row items-center px-4 pt-12 pb-4`,
                            { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
                        ]}
                    >
                        <TouchableOpacity onPress={closeBookingModal}>
                            <Ionicons name="close" size={24} color={colors.textPrimary} />
                        </TouchableOpacity>
                        <Text style={[tw`text-lg font-bold ml-4 flex-1`, { color: colors.textPrimary }]}>
                            Enter Your Route
                        </Text>
                    </View>

                    {/* Ride info bar */}
                    {selectedNearbyRide && (
                        <View
                            style={[
                                tw`flex-row items-center px-5 py-3`,
                                { backgroundColor: colors.primarySoft, borderBottomWidth: 1, borderBottomColor: colors.border },
                            ]}
                        >
                            <View style={tw`flex-1`}>
                                <Text style={[tw`text-xs font-bold uppercase tracking-wider`, { color: colors.primary }]}>
                                    {new Date(selectedNearbyRide.schedule?.departureTime).toLocaleDateString("en-IN", {
                                        weekday: "short", day: "numeric", month: "short",
                                    })}{" "}
                                    {fmtTime(new Date(selectedNearbyRide.schedule?.departureTime))}
                                </Text>
                                <View style={[tw`flex-row items-center mt-1`, { gap: 6 }]}>
                                    <Text style={[tw`text-sm`, { color: colors.textPrimary }]} numberOfLines={1}>
                                        {selectedNearbyRide.route?.start?.name || "Origin"}
                                    </Text>
                                    <Ionicons name="arrow-forward" size={12} color={colors.textMuted} />
                                    <Text style={[tw`text-sm flex-1`, { color: colors.textPrimary }]} numberOfLines={1}>
                                        {selectedNearbyRide.route?.end?.name || "Destination"}
                                    </Text>
                                </View>
                            </View>
                            <View style={[tw`px-3 py-1.5 rounded-full`, { backgroundColor: colors.primary + "22" }]}>
                                <Text style={[tw`text-sm font-bold`, { color: colors.primary }]}>
                                    ₹{selectedNearbyRide.estimate?.fare ?? "—"}
                                </Text>
                            </View>
                        </View>
                    )}

                    {/* Map */}
                    <View style={{ height: 240 }}>
                        <MapView
                            style={StyleSheet.absoluteFillObject}
                            provider={PROVIDER_DEFAULT}
                            region={bookingMapRegion}
                            showsUserLocation
                            userInterfaceStyle={scheme === "dark" ? "dark" : "light"}
                        >
                            {/* Ride route polyline */}
                            {bookingRoutePoints.length > 0 && (
                                <Polyline
                                    coordinates={bookingRoutePoints}
                                    strokeColor={colors.textMuted}
                                    strokeWidth={3}
                                    lineDashPattern={[6, 4]}
                                />
                            )}
                            {/* Ride start marker */}
                            {selectedNearbyRide?.route?.start?.location?.coordinates && (
                                <Marker
                                    coordinate={{
                                        latitude: selectedNearbyRide.route.start.location.coordinates[1],
                                        longitude: selectedNearbyRide.route.start.location.coordinates[0],
                                    }}
                                    title="Route Start"
                                    opacity={0.5}
                                    pinColor="#6b7280"
                                />
                            )}
                            {/* Ride end marker */}
                            {selectedNearbyRide?.route?.end?.location?.coordinates && (
                                <Marker
                                    coordinate={{
                                        latitude: selectedNearbyRide.route.end.location.coordinates[1],
                                        longitude: selectedNearbyRide.route.end.location.coordinates[0],
                                    }}
                                    title="Route End"
                                    opacity={0.5}
                                    pinColor="#6b7280"
                                />
                            )}
                            {/* User pickup marker */}
                            {bookingPickup && (
                                <Marker
                                    coordinate={{ latitude: bookingPickup.lat, longitude: bookingPickup.lng }}
                                    title="Your Pickup"
                                >
                                    <View style={tw`items-center`}>
                                        <View
                                            style={[
                                                tw`w-8 h-8 rounded-full items-center justify-center`,
                                                { backgroundColor: colors.primary, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 4, elevation: 5 },
                                            ]}
                                        >
                                            <Ionicons name="radio-button-on" size={14} color="#fff" />
                                        </View>
                                        <View style={[tw`px-2 py-0.5 rounded mt-1`, { backgroundColor: colors.primary }]}>
                                            <Text style={[tw`text-[9px] font-bold`, { color: "#fff" }]}>PICKUP</Text>
                                        </View>
                                    </View>
                                </Marker>
                            )}
                            {/* User drop marker */}
                            {bookingDrop && (
                                <Marker
                                    coordinate={{ latitude: bookingDrop.lat, longitude: bookingDrop.lng }}
                                    title="Your Drop"
                                >
                                    <View style={tw`items-center`}>
                                        <View
                                            style={[
                                                tw`w-8 h-8 rounded-full items-center justify-center`,
                                                { backgroundColor: "#ef4444", shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 4, elevation: 5 },
                                            ]}
                                        >
                                            <Ionicons name="location" size={14} color="#fff" />
                                        </View>
                                        <View style={[tw`px-2 py-0.5 rounded mt-1`, { backgroundColor: "#ef4444" }]}>
                                            <Text style={[tw`text-[9px] font-bold`, { color: "#fff" }]}>DROP</Text>
                                        </View>
                                    </View>
                                </Marker>
                            )}
                        </MapView>
                    </View>

                    {/* Autocomplete inputs */}
                    <View style={tw`px-5 pt-5`}>
                        <Text style={[tw`text-sm font-bold mb-3`, { color: colors.textPrimary }]}>
                            Where are you going?
                        </Text>
                        <View style={{ gap: 10 }}>
                            <PlaceInput
                                placeholder="Your Pickup Point"
                                value={bookingPickup}
                                onSelect={setBookingPickup}
                                colors={colors}
                                icon="radio-button-on"
                                iconColor={colors.primary}
                                inline
                            />
                            <View style={[tw`absolute`, { left: 28, top: 42, width: 2, height: 12, backgroundColor: colors.border }]} />
                            <PlaceInput
                                placeholder="Your Drop Point"
                                value={bookingDrop}
                                onSelect={setBookingDrop}
                                colors={colors}
                                icon="location"
                                iconColor="#ef4444"
                                inline
                            />
                        </View>

                        {/* Validation confirmations */}
                        {bookingPickup && (
                            <View style={[tw`flex-row items-center mt-3`, { gap: 6 }]}>
                                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                                <Text style={[tw`text-xs`, { color: colors.success }]} numberOfLines={1}>
                                    Pickup: {bookingPickup.name}
                                </Text>
                            </View>
                        )}
                        {bookingDrop && (
                            <View style={[tw`flex-row items-center mt-1`, { gap: 6 }]}>
                                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                                <Text style={[tw`text-xs`, { color: colors.success }]} numberOfLines={1}>
                                    Drop: {bookingDrop.name}
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* Confirm button */}
                    <View style={[tw`absolute bottom-0 left-0 right-0 px-5 pb-8 pt-4`, { backgroundColor: colors.background }]}>
                        <TouchableOpacity
                            onPress={() => {
                                if (!bookingPickup || !bookingDrop) {
                                    Alert.alert("Missing info", "Please select both pickup and drop locations.");
                                    return;
                                }
                                const rid = selectedNearbyRide._id?.toString();
                                const isDrv = selectedNearbyRide.driver?.userId === user?.id;
                                const isBkd = bookedRideIds.has(rid);
                                const isReq = requestedRideIds.has(rid);
                                closeBookingModal();
                                router.push({
                                    pathname: "/(rider)/search/details",
                                    params: {
                                        rideId: rid,
                                        pickupName: bookingPickup.name,
                                        pickupLat: String(bookingPickup.lat),
                                        pickupLng: String(bookingPickup.lng),
                                        dropName: bookingDrop.name,
                                        dropLat: String(bookingDrop.lat),
                                        dropLng: String(bookingDrop.lng),
                                        estimatedFare: String(selectedNearbyRide.estimate?.fare ?? ""),
                                        isBooked: isBkd ? "1" : "0",
                                        isRequested: isReq ? "1" : "0",
                                        isDriver: isDrv ? "1" : "0",
                                        seatsRequested: String(seats),
                                    },
                                });
                            }}
                            disabled={!bookingPickup || !bookingDrop}
                            activeOpacity={0.8}
                            style={[
                                tw`py-4 rounded-2xl flex-row items-center justify-center`,
                                {
                                    backgroundColor: bookingPickup && bookingDrop ? colors.primary : colors.surfaceMuted,
                                    gap: 8,
                                    shadowColor: colors.primary,
                                    shadowOpacity: bookingPickup && bookingDrop ? 0.3 : 0,
                                    shadowRadius: 12,
                                    shadowOffset: { width: 0, height: 4 },
                                    elevation: bookingPickup && bookingDrop ? 6 : 0,
                                },
                            ]}
                        >
                            <Ionicons
                                name="checkmark-circle"
                                size={20}
                                color={bookingPickup && bookingDrop ? "#fff" : colors.textMuted}
                            />
                            <Text
                                style={[
                                    tw`text-base font-bold`,
                                    { color: bookingPickup && bookingDrop ? "#fff" : colors.textMuted },
                                ]}
                            >
                                View Details & Book
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ── Date Picker ─────────────────────── */}
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
                                <DateTimePicker value={date} mode="date" display="spinner" minimumDate={new Date()} onChange={onDateChange} themeVariant={scheme} />
                            </View>
                        </Pressable>
                    </Modal>
                ) : (
                    <DateTimePicker value={date} mode="date" display="default" minimumDate={new Date()} onChange={onDateChange} />
                )
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    sheet: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 30,
    },
    pinContainer: {
        alignItems: "center",
    },
    pinBubble: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 3,
        overflow: "hidden",
        backgroundColor: "#fff",
        elevation: 5,
        shadowColor: "#000",
        shadowOpacity: 0.25,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    pinImage: {
        width: "100%",
        height: "100%",
        borderRadius: 17,
    },
    pinArrow: {
        width: 0,
        height: 0,
        borderLeftWidth: 8,
        borderRightWidth: 8,
        borderTopWidth: 10,
        borderLeftColor: "transparent",
        borderRightColor: "transparent",
        marginTop: -2,
    },
});
