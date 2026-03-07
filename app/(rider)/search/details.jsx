import {
    View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator,
    useColorScheme, Alert, StyleSheet, Dimensions, Platform,
} from "react-native";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useUser } from "@clerk/clerk-expo";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import tw from "twrnc";
import { theme } from "../../../constants/Colors";
import { decodePolyline } from "../../../utils/polyline";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const { width: SCREEN_W } = Dimensions.get("window");

export default function RideSearchDetails() {
    const params = useLocalSearchParams();
    const {
        rideId,
        pickupName, pickupLat, pickupLng,
        dropName, dropLat, dropLng,
        estimatedFare,
        isBooked: isBookedParam,
        isDriver: isDriverParam,
    } = params;

    const router = useRouter();
    const { user } = useUser();
    const scheme = useColorScheme();
    const colors = theme[scheme ?? "light"];

    const [ride, setRide] = useState(null);
    const [loading, setLoading] = useState(true);
    const [booking, setBooking] = useState(false);
    const [booked, setBooked] = useState(isBookedParam === "1");
    const [scrollEnabled, setScrollEnabled] = useState(true);

    const isDriver = isDriverParam === "1";

    /* ── Fetch ride details ────────────────────── */
    const fetchRide = useCallback(async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/rides/${rideId}`);
            const data = await res.json();
            if (res.ok) setRide(data.ride);
            else Alert.alert("Error", data.message || "Failed to load ride");
        } catch (e) {
            console.error("Fetch ride error:", e);
            Alert.alert("Error", "Failed to load ride details");
        } finally {
            setLoading(false);
        }
    }, [rideId]);

    useEffect(() => { fetchRide(); }, [fetchRide]);

    /* ── Route polyline ────────────────────────── */
    const routePoints = useMemo(() => {
        if (ride?.route?.encodedPolyline) return decodePolyline(ride.route.encodedPolyline);
        return [];
    }, [ride]);

    const mapRegion = useMemo(() => {
        if (routePoints.length > 0) {
            const lats = routePoints.map((p) => p.latitude);
            const lngs = routePoints.map((p) => p.longitude);
            const minLat = Math.min(...lats);
            const maxLat = Math.max(...lats);
            const minLng = Math.min(...lngs);
            const maxLng = Math.max(...lngs);
            return {
                latitude: (minLat + maxLat) / 2,
                longitude: (minLng + maxLng) / 2,
                latitudeDelta: (maxLat - minLat) * 1.4 + 0.02,
                longitudeDelta: (maxLng - minLng) * 1.4 + 0.02,
            };
        }
        return { latitude: 17.385, longitude: 78.4867, latitudeDelta: 0.2, longitudeDelta: 0.2 };
    }, [routePoints]);

    /* ── Book ride ─────────────────────────────── */
    const handleBook = async () => {
        if (booking || booked || isDriver) return;
        setBooking(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/rides/${rideId}/book`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user: {
                        userId: user.id,
                        name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(),
                        profileImage: user.imageUrl ?? "",
                        email: user.primaryEmailAddress?.emailAddress ?? "",
                        pickupName: pickupName || "",
                        dropName:   dropName   || "",
                    },
                    pickup: { lat: parseFloat(pickupLat), lng: parseFloat(pickupLng) },
                    drop:   { lat: parseFloat(dropLat),   lng: parseFloat(dropLng) },
                }),
            });
            const data = await res.json();
            if (res.ok) {
                setBooked(true);
                Alert.alert(
                    "Ride Booked! 🎉",
                    `Your seat is confirmed. Estimated fare: ₹${data.farePaid || estimatedFare}`,
                    [{ text: "OK", onPress: () => router.back() }]
                );
            } else {
                Alert.alert("Booking failed", data.message || "Please try again.");
            }
        } catch (e) {
            console.error("Book error:", e);
            Alert.alert("Error", "Something went wrong. Please try again.");
        } finally {
            setBooking(false);
        }
    };

    /* ── Helpers ───────────────────────────────── */
    const fmtTime = (d) =>
        new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

    const fmtDate = (d) =>
        new Date(d).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    const fmtDur = (min) => {
        if (!min) return null;
        const h = Math.floor(min / 60);
        const m = Math.round(min % 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    /* ─── Loading ──────────────────────────────── */
    if (loading) {
        return (
            <View style={[tw`flex-1 items-center justify-center`, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    if (!ride) {
        return (
            <View style={[tw`flex-1 items-center justify-center`, { backgroundColor: colors.background }]}>
                <Ionicons name="car-outline" size={48} color={colors.textMuted} />
                <Text style={[tw`text-base mt-4`, { color: colors.textSecondary }]}>Ride not found</Text>
                <TouchableOpacity onPress={() => router.back()} style={tw`mt-4`}>
                    <Text style={[tw`text-sm font-bold`, { color: colors.primary }]}>Go back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const dep = new Date(ride.schedule?.departureTime);
    const driver = ride.driver || {};
    const vehicle = ride.vehicle || {};
    const prefs = ride.preferences || {};
    const isVerified = driver.isVerified;

    /* ─── Render ───────────────────────────────── */
    return (
        <View style={[tw`flex-1`, { backgroundColor: colors.background }]}>
            {/* Back button (floating over map) */}
            <TouchableOpacity
                onPress={() => router.back()}
                style={[
                    tw`absolute top-12 left-4 z-50 w-10 h-10 rounded-full items-center justify-center shadow-md`,
                    { backgroundColor: colors.surface },
                ]}
            >
                <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
            </TouchableOpacity>

            <ScrollView
                scrollEnabled={scrollEnabled}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={tw`pb-36`}
            >
                {/* ── Map ─────────────────────────── */}
                <View style={{ height: 240 }}>
                    <MapView
                        style={StyleSheet.absoluteFillObject}
                        provider={PROVIDER_GOOGLE}
                        region={mapRegion}
                        onTouchStart={() => setScrollEnabled(false)}
                        onTouchEnd={() => setScrollEnabled(true)}
                        onTouchCancel={() => setScrollEnabled(true)}
                    >
                        {routePoints.length > 0 && (
                            <Polyline
                                coordinates={routePoints}
                                strokeColor={colors.primary}
                                strokeWidth={4}
                            />
                        )}
                        {/* Full route start */}
                        {ride.route?.start?.location?.coordinates && (
                            <Marker
                                coordinate={{
                                    latitude: ride.route.start.location.coordinates[1],
                                    longitude: ride.route.start.location.coordinates[0],
                                }}
                                title="Route Start"
                                pinColor={colors.primary}
                            />
                        )}
                        {/* Full route end */}
                        {ride.route?.end?.location?.coordinates && (
                            <Marker
                                coordinate={{
                                    latitude: ride.route.end.location.coordinates[1],
                                    longitude: ride.route.end.location.coordinates[0],
                                }}
                                title="Route End"
                                pinColor="#6b7280"
                            />
                        )}
                        {/* User's pickup */}
                        {pickupLat && pickupLng && (
                            <Marker
                                coordinate={{ latitude: parseFloat(pickupLat), longitude: parseFloat(pickupLng) }}
                                title="Your Pickup"
                            >
                                <View style={[tw`w-5 h-5 rounded-full border-2 border-white`, { backgroundColor: colors.primary }]} />
                            </Marker>
                        )}
                        {/* User's drop */}
                        {dropLat && dropLng && (
                            <Marker
                                coordinate={{ latitude: parseFloat(dropLat), longitude: parseFloat(dropLng) }}
                                title="Your Drop"
                            >
                                <View style={[tw`w-5 h-5 rounded-full border-2 border-white`, { backgroundColor: "#ef4444" }]} />
                            </Marker>
                        )}
                    </MapView>
                </View>

                {/* ── Stats bar ──────────────────── */}
                <View
                    style={[
                        tw`flex-row justify-around py-3`,
                        { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
                    ]}
                >
                    {ride.metrics?.totalDistanceKm > 0 && (
                        <View style={tw`items-center`}>
                            <Ionicons name="resize" size={18} color={colors.primary} />
                            <Text style={[tw`text-xs font-bold mt-1`, { color: colors.textPrimary }]}>
                                {Number(ride.metrics.totalDistanceKm).toFixed(1)} km
                            </Text>
                        </View>
                    )}
                    {ride.metrics?.estimatedDurationMin > 0 && (
                        <View style={tw`items-center`}>
                            <Ionicons name="time" size={18} color={colors.primary} />
                            <Text style={[tw`text-xs font-bold mt-1`, { color: colors.textPrimary }]}>
                                {fmtDur(ride.metrics.estimatedDurationMin)}
                            </Text>
                        </View>
                    )}
                    <View style={tw`items-center`}>
                        <MaterialCommunityIcons name="currency-inr" size={18} color={colors.primary} />
                        <Text style={[tw`text-xs font-bold mt-1`, { color: colors.textPrimary }]}>
                            ₹{estimatedFare || ride.pricing?.baseFare}
                        </Text>
                    </View>
                    <View style={tw`items-center`}>
                        <Ionicons name="people" size={18} color={colors.primary} />
                        <Text style={[tw`text-xs font-bold mt-1`, { color: colors.textPrimary }]}>
                            {ride.seats?.available} left
                        </Text>
                    </View>
                </View>

                <View style={tw`px-5`}>

                    {/* ── Status badge ─────────────── */}
                    {(booked || isDriver) && (
                        <View
                            style={[
                                tw`flex-row items-center gap-2 mt-4 px-4 py-2.5 rounded-xl`,
                                {
                                    backgroundColor: isDriver ? colors.primarySoft : "rgba(7,136,41,0.12)",
                                },
                            ]}
                        >
                            <MaterialCommunityIcons
                                name={isDriver ? "car" : "check-circle"}
                                size={16}
                                color={isDriver ? colors.primary : colors.success}
                            />
                            <Text
                                style={[
                                    tw`text-sm font-bold`,
                                    { color: isDriver ? colors.primary : colors.success },
                                ]}
                            >
                                {isDriver
                                    ? "You are the driver of this ride"
                                    : "You have already booked this ride"}
                            </Text>
                        </View>
                    )}

                    {/* ── Date / time / fare ───────── */}
                    <View
                        style={[
                            tw`mt-4 rounded-2xl p-4`,
                            { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                        ]}
                    >
                        <Text style={[tw`text-base font-bold`, { color: colors.textPrimary }]}>
                            {fmtDate(dep)}
                        </Text>
                        <View style={tw`flex-row items-center gap-4 mt-2`}>
                            <View style={tw`flex-row items-center gap-1.5`}>
                                <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                                <Text style={[tw`text-sm`, { color: colors.textSecondary }]}>{fmtTime(dep)}</Text>
                            </View>
                            {ride.metrics?.estimatedDurationMin && (
                                <View style={tw`flex-row items-center gap-1.5`}>
                                    <Ionicons name="hourglass-outline" size={14} color={colors.textMuted} />
                                    <Text style={[tw`text-sm`, { color: colors.textSecondary }]}>
                                        {fmtDur(ride.metrics.estimatedDurationMin)}
                                    </Text>
                                </View>
                            )}
                            <View style={tw`flex-row items-center gap-1.5`}>
                                <Ionicons name="people-outline" size={14} color={colors.textMuted} />
                                <Text style={[tw`text-sm`, { color: colors.textSecondary }]}>
                                    {ride.seats?.available} seat{ride.seats?.available !== 1 ? "s" : ""} left
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* ── Your journey ─────────────── */}
                    <View
                        style={[
                            tw`mt-4 rounded-2xl p-4`,
                            { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                        ]}
                    >
                        <Text
                            style={[tw`text-xs font-extrabold tracking-widest mb-3`, { color: colors.textSecondary }]}
                        >
                            YOUR JOURNEY
                        </Text>
                        <View style={tw`flex-row items-start`}>
                            <View style={tw`items-center mr-3 mt-1`}>
                                <View style={[tw`w-3 h-3 rounded-full`, { backgroundColor: colors.primary }]} />
                                <View style={[tw`w-px`, { backgroundColor: colors.border, height: 28 }]} />
                                <View style={[tw`w-3 h-3 rounded-full`, { backgroundColor: "#ef4444" }]} />
                            </View>
                            <View style={tw`flex-1`}>
                                <Text style={[tw`text-sm font-semibold mb-4`, { color: colors.textPrimary }]}
                                    numberOfLines={2}>
                                    {pickupName || ride.route?.start?.name}
                                </Text>
                                <Text style={[tw`text-sm font-semibold`, { color: colors.textPrimary }]}
                                    numberOfLines={2}>
                                    {dropName || ride.route?.end?.name}
                                </Text>
                            </View>
                        </View>
                        <View
                            style={[
                                tw`flex-row items-center justify-between mt-4 pt-3`,
                                { borderTopWidth: 1, borderTopColor: colors.border },
                            ]}
                        >
                            <Text style={[tw`text-sm`, { color: colors.textSecondary }]}>Estimated Fare</Text>
                            <View style={[tw`px-3 py-1 rounded-full`, { backgroundColor: colors.primarySoft }]}>
                                <Text style={[tw`text-sm font-extrabold`, { color: colors.primary }]}>
                                    ₹{estimatedFare || ride.pricing?.baseFare}
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* ── Full route ───────────────── */}
                    <View
                        style={[
                            tw`mt-4 rounded-2xl p-4`,
                            { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                        ]}
                    >
                        <Text
                            style={[tw`text-xs font-extrabold tracking-widest mb-3`, { color: colors.textSecondary }]}
                        >
                            FULL ROUTE
                        </Text>
                        <View style={tw`flex-row items-start`}>
                            <View style={tw`items-center mr-3 mt-1`}>
                                <View style={[tw`w-2.5 h-2.5 rounded-full`, { backgroundColor: colors.primary }]} />
                                {(ride.route?.stops || []).length > 0 && (
                                    <View style={[tw`w-px`, { backgroundColor: colors.border, height: 18 }]} />
                                )}
                            </View>
                            <Text style={[tw`text-sm flex-1 mb-1`, { color: colors.textPrimary }]}>
                                {ride.route?.start?.name}
                            </Text>
                        </View>
                        {(ride.route?.stops || []).map((stop, i) => (
                            <View key={i} style={tw`flex-row items-start mt-2`}>
                                <View style={tw`items-center mr-3 mt-1`}>
                                    <View style={[tw`w-px`, { backgroundColor: colors.border, height: 8 }]} />
                                    <View style={[tw`w-2 h-2 rounded-full`, { backgroundColor: colors.border }]} />
                                    <View style={[tw`w-px`, { backgroundColor: colors.border, height: 8 }]} />
                                </View>
                                <Text style={[tw`text-xs`, { color: colors.textSecondary }]}>{stop.name}</Text>
                            </View>
                        ))}
                        <View style={tw`flex-row items-start mt-2`}>
                            <View style={tw`items-center mr-3 mt-1`}>
                                {(ride.route?.stops || []).length > 0 && (
                                    <View style={[tw`w-px`, { backgroundColor: colors.border, height: 18 }]} />
                                )}
                                <View style={[tw`w-2.5 h-2.5 rounded-full`, { backgroundColor: "#ef4444" }]} />
                            </View>
                            <Text style={[tw`text-sm flex-1`, { color: colors.textPrimary }]}>
                                {ride.route?.end?.name}
                            </Text>
                        </View>
                    </View>

                    {/* ── Driver card ──────────────── */}
                    <View
                        style={[
                            tw`mt-4 rounded-2xl overflow-hidden`,
                            { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                        ]}
                    >
                        <View
                            style={[
                                tw`px-5 pt-4 pb-3 flex-row items-center justify-between`,
                                { borderBottomWidth: 1, borderBottomColor: colors.border },
                            ]}
                        >
                            <Text
                                style={[tw`text-xs font-extrabold tracking-widest`, { color: colors.textSecondary }]}
                            >
                                DRIVER
                            </Text>
                            {isVerified && (
                                <View
                                    style={[
                                        tw`flex-row items-center gap-1 px-2.5 py-1 rounded-full`,
                                        { backgroundColor: colors.primarySoft },
                                    ]}
                                >
                                    <Ionicons name="shield-checkmark" size={11} color={colors.primary} />
                                    <Text style={[tw`text-[10px] font-bold`, { color: colors.primary }]}>
                                        Verified
                                    </Text>
                                </View>
                            )}
                        </View>

                        <View style={tw`flex-row items-center px-5 py-4 gap-4`}>
                            {driver.profileImage ? (
                                <Image
                                    source={{ uri: driver.profileImage }}
                                    style={tw`w-14 h-14 rounded-full bg-gray-100`}
                                />
                            ) : (
                                <View
                                    style={[
                                        tw`w-14 h-14 rounded-full items-center justify-center`,
                                        { backgroundColor: colors.surfaceMuted },
                                    ]}
                                >
                                    <Ionicons name="person" size={24} color={colors.textMuted} />
                                </View>
                            )}
                            <View style={tw`flex-1`}>
                                <Text style={[tw`text-base font-bold`, { color: colors.textPrimary }]}>
                                    {isDriver ? "You" : (driver.name || "Driver")}
                                </Text>
                                {driver.rating > 0 && (
                                    <View style={tw`flex-row items-center gap-1 mt-1`}>
                                        <Ionicons name="star" size={13} color="#f59e0b" />
                                        <Text style={[tw`text-sm font-semibold`, { color: colors.textSecondary }]}>
                                            {Number(driver.rating).toFixed(1)}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    </View>

                    {/* ── Vehicle card ─────────────── */}
                    {(vehicle.brand || vehicle.model) && (
                        <View
                            style={[
                                tw`mt-4 rounded-2xl p-4`,
                                { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                            ]}
                        >
                            <Text
                                style={[
                                    tw`text-xs font-extrabold tracking-widest mb-3`,
                                    { color: colors.textSecondary },
                                ]}
                            >
                                VEHICLE
                            </Text>
                            <View style={tw`flex-row flex-wrap gap-4`}>
                                {vehicle.brand && (
                                    <View>
                                        <Text style={[tw`text-[10px] font-bold uppercase mb-0.5`, { color: colors.textMuted }]}>
                                            Make
                                        </Text>
                                        <Text style={[tw`text-sm font-semibold`, { color: colors.textPrimary }]}>
                                            {vehicle.brand}
                                        </Text>
                                    </View>
                                )}
                                {vehicle.model && (
                                    <View>
                                        <Text style={[tw`text-[10px] font-bold uppercase mb-0.5`, { color: colors.textMuted }]}>
                                            Model
                                        </Text>
                                        <Text style={[tw`text-sm font-semibold`, { color: colors.textPrimary }]}>
                                            {vehicle.model}
                                        </Text>
                                    </View>
                                )}
                                {vehicle.color && (
                                    <View>
                                        <Text style={[tw`text-[10px] font-bold uppercase mb-0.5`, { color: colors.textMuted }]}>
                                            Color
                                        </Text>
                                        <Text style={[tw`text-sm font-semibold`, { color: colors.textPrimary }]}>
                                            {vehicle.color}
                                        </Text>
                                    </View>
                                )}
                                {vehicle.year && (
                                    <View>
                                        <Text style={[tw`text-[10px] font-bold uppercase mb-0.5`, { color: colors.textMuted }]}>
                                            Year
                                        </Text>
                                        <Text style={[tw`text-sm font-semibold`, { color: colors.textPrimary }]}>
                                            {vehicle.year}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    )}

                    {/* ── Passengers ───────────────── */}
                    {(() => {
                        const confirmed = (ride.passengers || []).filter((p) => p.status !== "cancelled");
                        if (confirmed.length === 0) return null;
                        return (
                            <View
                                style={[
                                    tw`mt-4 rounded-2xl overflow-hidden`,
                                    { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                                ]}
                            >
                                <View
                                    style={[
                                        tw`px-5 pt-4 pb-3 flex-row items-center justify-between`,
                                        { borderBottomWidth: 1, borderBottomColor: colors.border },
                                    ]}
                                >
                                    <Text
                                        style={[tw`text-xs font-extrabold tracking-widest`, { color: colors.textSecondary }]}
                                    >
                                        PASSENGERS ON BOARD
                                    </Text>
                                    <View style={[tw`px-2.5 py-0.5 rounded-full`, { backgroundColor: colors.primarySoft }]}>
                                        <Text style={[tw`text-[10px] font-bold`, { color: colors.primary }]}>
                                            {confirmed.length} / {(ride.seats?.total || confirmed.length)}
                                        </Text>
                                    </View>
                                </View>
                                <View style={tw`px-5 py-3 gap-3`}>
                                    {confirmed.map((p, i) => (
                                        <View key={i} style={tw`flex-row items-center gap-3`}>
                                            {p.profileImage ? (
                                                <Image
                                                    source={{ uri: p.profileImage }}
                                                    style={tw`w-9 h-9 rounded-full bg-gray-100`}
                                                />
                                            ) : (
                                                <View
                                                    style={[
                                                        tw`w-9 h-9 rounded-full items-center justify-center`,
                                                        { backgroundColor: colors.surfaceMuted },
                                                    ]}
                                                >
                                                    <Ionicons name="person" size={16} color={colors.textMuted} />
                                                </View>
                                            )}
                                            <Text style={[tw`text-sm font-semibold flex-1`, { color: colors.textPrimary }]}>
                                                {p.name || "Passenger"}
                                            </Text>
                                            {p.farePaid > 0 && (
                                                <View style={[tw`px-2.5 py-0.5 rounded-full`, { backgroundColor: colors.primarySoft }]}>
                                                    <Text style={[tw`text-xs font-bold`, { color: colors.primary }]}>
                                                        ₹{p.farePaid}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                    ))}
                                </View>
                            </View>
                        );
                    })()}

                    {/* ── Preferences ──────────────── */}
                    {Object.keys(prefs).length > 0 && (
                        <View
                            style={[
                                tw`mt-4 rounded-2xl p-4`,
                                { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                            ]}
                        >
                            <Text
                                style={[
                                    tw`text-xs font-extrabold tracking-widest mb-3`,
                                    { color: colors.textSecondary },
                                ]}
                            >
                                RIDE PREFERENCES
                            </Text>
                            <View style={tw`flex-row flex-wrap gap-2`}>
                                {prefs.smokingAllowed && (
                                    <View style={[tw`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full`, { backgroundColor: colors.surfaceMuted }]}>
                                        <MaterialCommunityIcons name="smoking" size={13} color={colors.textSecondary} />
                                        <Text style={[tw`text-xs`, { color: colors.textSecondary }]}>Smoking OK</Text>
                                    </View>
                                )}
                                {prefs.petsAllowed && (
                                    <View style={[tw`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full`, { backgroundColor: colors.surfaceMuted }]}>
                                        <MaterialCommunityIcons name="paw" size={13} color={colors.textSecondary} />
                                        <Text style={[tw`text-xs`, { color: colors.textSecondary }]}>Pets OK</Text>
                                    </View>
                                )}
                                {prefs.musicAllowed && (
                                    <View style={[tw`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full`, { backgroundColor: colors.surfaceMuted }]}>
                                        <Ionicons name="musical-notes" size={13} color={colors.textSecondary} />
                                        <Text style={[tw`text-xs`, { color: colors.textSecondary }]}>Music OK</Text>
                                    </View>
                                )}
                                {prefs.luggageAllowed && (
                                    <View style={[tw`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full`, { backgroundColor: colors.surfaceMuted }]}>
                                        <FontAwesome5 name="suitcase" size={11} color={colors.textSecondary} />
                                        <Text style={[tw`text-xs`, { color: colors.textSecondary }]}>Luggage OK</Text>
                                    </View>
                                )}
                                {prefs.ac !== undefined && (
                                    <View style={[tw`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full`, { backgroundColor: colors.surfaceMuted }]}>
                                        <MaterialCommunityIcons name="snowflake" size={13} color={colors.textSecondary} />
                                        <Text style={[tw`text-xs`, { color: colors.textSecondary }]}>{prefs.ac ? "AC" : "No AC"}</Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    )}

                </View>
            </ScrollView>

            {/* ── Bottom CTA ───────────────────────── */}
            <View
                style={[
                    tw`absolute bottom-0 left-0 right-0 px-5 pb-8 pt-4`,
                    { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
                ]}
            >
                {isDriver ? (
                    <View
                        style={[
                            tw`py-3.5 rounded-xl items-center`,
                            { backgroundColor: colors.surfaceMuted },
                        ]}
                    >
                        <Text style={[tw`text-sm font-bold`, { color: colors.textMuted }]}>
                            You are the driver of this ride
                        </Text>
                    </View>
                ) : booked ? (
                    <View
                        style={[
                            tw`flex-row items-center justify-center gap-2 py-3.5 rounded-xl`,
                            { backgroundColor: "rgba(7,136,41,0.12)" },
                        ]}
                    >
                        <MaterialCommunityIcons name="check-circle" size={18} color={colors.success} />
                        <Text style={[tw`text-sm font-bold`, { color: colors.success }]}>
                            Ride Booked
                        </Text>
                    </View>
                ) : (
                    <TouchableOpacity
                        onPress={handleBook}
                        disabled={booking}
                        activeOpacity={0.85}
                        style={[tw`py-3.5 rounded-xl items-center`, { backgroundColor: colors.primary }]}
                    >
                        {booking ? (
                            <ActivityIndicator size="small" color={colors.primaryText} />
                        ) : (
                            <Text style={[tw`text-sm font-extrabold`, { color: colors.primaryText }]}>
                                Book Ride · ₹{estimatedFare}
                            </Text>
                        )}
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}
