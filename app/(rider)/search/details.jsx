import {
    View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator,
    useColorScheme, Alert, StyleSheet, Dimensions, Platform, TextInput, Modal,
} from "react-native";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useUser } from "@clerk/clerk-expo";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "../../../components/common/MapWrapper";
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
        isRequested: isRequestedParam,
        isDriver: isDriverParam,
        seatsRequested: seatsRequestedParam,
    } = params;

    const router = useRouter();
    const { user } = useUser();
    const scheme = useColorScheme();
    const colors = theme[scheme ?? "light"];

    const totalSeatsWanted = Math.max(1, parseInt(seatsRequestedParam) || 1);

    const [ride, setRide] = useState(null);
    const [loading, setLoading] = useState(true);
    const [booking, setBooking] = useState(false);
    const [booked, setBooked] = useState(isBookedParam === "1");
    const [requested, setRequested] = useState(isRequestedParam === "1");
    const [scrollEnabled, setScrollEnabled] = useState(true);
    // Multi-passenger booking state
    const [showBookingForm, setShowBookingForm] = useState(false);
    const [bookingStep, setBookingStep] = useState(1); // 1 = rider details, 2 = seat assignment
    const [riderIsPartOfRide, setRiderIsPartOfRide] = useState(true);
    const [additionalPassengers, setAdditionalPassengers] = useState([]);
    const [seatSelections, setSeatSelections] = useState({}); // { "self": seatType, 0: seatType, 1: seatType }

    const SEAT_TYPES_LIST = [
        { type: "front", label: "Front Seat" },
        { type: "backWindow", label: "Back Window Seat" },
        { type: "backMiddle", label: "Back Middle Seat" },
        { type: "backArmrest", label: "Back Seat w/ Armrest" },
        { type: "thirdRow", label: "Third Row Seat" },
        { type: "any", label: "Any Seat" },
    ];

    /** Compute remaining seats per type, excluding one rider's own selection */
    const computeAvailableSeats = (excludeKey) => {
        const remaining = {};
        (ride?.seats?.seatTypes || []).forEach(st => {
            if (st.count > 0) remaining[st.type] = st.count;
        });
        // Subtract already confirmed/requested passengers on the ride
        (ride?.passengers || []).forEach(p => {
            if ((p.status === 'confirmed' || p.status === 'requested') && p.seatType && p.seatType !== 'any') {
                if (remaining[p.seatType] !== undefined) {
                    remaining[p.seatType] = Math.max(0, remaining[p.seatType] - 1);
                }
            }
        });
        // Subtract other riders' picks in this booking
        Object.entries(seatSelections).forEach(([key, type]) => {
            if (String(key) !== String(excludeKey) && type && type !== 'any') {
                if (remaining[type] !== undefined) {
                    remaining[type] = Math.max(0, remaining[type] - 1);
                }
            }
        });
        return remaining;
    };

    const isDriver = isDriverParam === "1";

    /* ── Chat helpers ── */
    const openDriverChat = async () => {
        const driverData = ride?.driver;
        if (!driverData) return;
        try {
            console.log("[Chat] openDriverChat →", driverData.name, driverData.userId);
            const res = await fetch(`${BACKEND_URL}/api/chat/conversations/direct`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    participants: [
                        { userId: user.id, name: user.fullName || "Rider", profileImage: user.imageUrl, role: "rider" },
                        { userId: driverData.userId, name: driverData.name, profileImage: driverData.profileImage, role: "driver" },
                    ],
                }),
            });
            const data = await res.json();
            console.log("[Chat] DM response:", JSON.stringify(data).slice(0, 200));
            if (!res.ok) throw new Error(data.message);
            const convo = data.conversation || data;
            router.push({
                pathname: "/(rider)/chat/room",
                params: {
                    conversationId: convo._id,
                    title: driverData.name || "Driver",
                    image: driverData.profileImage || "",
                    type: "direct",
                },
            });
        } catch (e) {
            Alert.alert("Error", e.message || "Could not open chat");
        }
    };

    const openGroupChat = async () => {
        try {
            console.log("[Chat] openGroupChat → ride", rideId);
            const res = await fetch(`${BACKEND_URL}/api/chat/conversations/group`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rideId }),
            });
            const data = await res.json();
            console.log("[Chat] Group response:", JSON.stringify(data).slice(0, 200));
            if (!res.ok) throw new Error(data.message);
            const convo = data.conversation || data;
            router.push({
                pathname: "/(rider)/chat/room",
                params: {
                    conversationId: convo._id,
                    title: convo.title || "Group Chat",
                    image: "",
                    type: "group",
                },
            });
        } catch (e) {
            Alert.alert("Error", e.message || "Could not open group chat");
        }
    };

    /* ── Fetch ride details ────────────────────── */
    const fetchRide = useCallback(async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/rides/${rideId}`);
            const data = await res.json();
            if (res.ok) {
                setRide(data.ride);
                // Check current user's passenger status
                const myPassenger = (data.ride.passengers || []).find(
                    (p) => p.userId === user?.id && p.status !== "cancelled"
                );
                if (myPassenger) {
                    if (myPassenger.status === "confirmed") setBooked(true);
                    else if (myPassenger.status === "requested") setRequested(true);
                }
            }
            else Alert.alert("Error", data.message || "Failed to load ride");
        } catch (e) {
            console.error("Fetch ride error:", e);
            Alert.alert("Error", "Failed to load ride details");
        } finally {
            setLoading(false);
        }
    }, [rideId, user?.id]);

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

    /* ── Open booking form ─────────────────────────── */
    const openBookingForm = () => {
        const extraSeats = riderIsPartOfRide ? totalSeatsWanted - 1 : totalSeatsWanted;
        const initialPassengers = Array.from({ length: Math.max(0, extraSeats) }, () => ({
            name: "",
            age: "",
            sex: "",
            email: "",
        }));
        setAdditionalPassengers(initialPassengers);
        setSeatSelections({});
        setBookingStep(1);
        setShowBookingForm(true);
    };

    const updateGuest = (index, field, value) => {
        setAdditionalPassengers((prev) => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    };

    const addGuestSlot = () => {
        setAdditionalPassengers((prev) => [
            ...prev,
            { name: "", age: "", sex: "", email: "" },
        ]);
    };

    const removeGuestSlot = (index) => {
        setAdditionalPassengers((prev) => prev.filter((_, i) => i !== index));
    };

    /* ── Request ride (multi-passenger aware) ──────── */
    const handleRequest = async () => {
        if (booking || booked || requested || isDriver) return;

        // Validate guests
        for (let i = 0; i < additionalPassengers.length; i++) {
            const g = additionalPassengers[i];
            if (!g.name.trim()) {
                Alert.alert("Missing info", `Please enter a name for Rider ${i + 1}.`);
                return;
            }
            if (!g.email.trim()) {
                Alert.alert("Missing info", `Please enter an email for ${g.name || `Rider ${i + 1}`}.`);
                return;
            }
        }

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
                        dropName: dropName || "",
                    },
                    pickup: { lat: parseFloat(pickupLat), lng: parseFloat(pickupLng) },
                    drop: { lat: parseFloat(dropLat), lng: parseFloat(dropLng) },
                    seatPreference: riderIsPartOfRide ? (seatSelections["self"] || "any") : "any",
                    riderIsPartOfRide,
                    additionalPassengers: additionalPassengers.map((g, idx) => ({
                        name: g.name.trim(),
                        age: g.age ? parseInt(g.age) : null,
                        sex: g.sex || "",
                        email: g.email.trim(),
                        seatPreference: seatSelections[idx] || "any",
                    })),
                }),
            });
            const data = await res.json();
            if (res.ok) {
                setRequested(true);
                setShowBookingForm(false);
                Alert.alert(
                    "Ride Requested! 🙌",
                    `Your request for ${data.seatsBooked || 1} seat(s) has been sent to the driver. Total fare: ₹${data.totalFare || data.farePaid || estimatedFare}. You'll be confirmed once the driver approves.`,
                    [{ text: "OK" }]
                );
            } else {
                Alert.alert("Request failed", data.message || "Please try again.");
            }
        } catch (e) {
            console.error("Request error:", e);
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
                    {(booked || requested || isDriver) && (
                        <View
                            style={[
                                tw`flex-row items-center gap-2 mt-4 px-4 py-2.5 rounded-xl`,
                                {
                                    backgroundColor: isDriver
                                        ? colors.primarySoft
                                        : booked
                                            ? "rgba(7,136,41,0.12)"
                                            : "rgba(245,158,11,0.12)",
                                },
                            ]}
                        >
                            <MaterialCommunityIcons
                                name={isDriver ? "car" : booked ? "check-circle" : "clock-outline"}
                                size={16}
                                color={isDriver ? colors.primary : booked ? colors.success : "#f59e0b"}
                            />
                            <Text
                                style={[
                                    tw`text-sm font-bold`,
                                    { color: isDriver ? colors.primary : booked ? colors.success : "#f59e0b" },
                                ]}
                            >
                                {isDriver
                                    ? "You are the driver of this ride"
                                    : booked
                                        ? "Your ride is confirmed ✓"
                                        : "Ride requested — waiting for driver approval"}
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
                    <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                            router.push({
                                pathname: "/(rider)/search/driver-details",
                                params: {
                                    rideId,
                                    driverName: driver.name || "Driver",
                                    driverImage: driver.profileImage || "",
                                    driverRating: String(driver.rating || 0),
                                    driverReviews: String(driver.reviewsCount || 0),
                                    driverRidesHosted: String(driver.ridesHosted || 0),
                                    driverRidesCompleted: String(driver.ridesCompleted || 0),
                                    driverTrustScore: String(driver.trustScore || 0),
                                    driverPhone: driver.phoneNumber || "",
                                    driverHoursDriven: String(driver.hoursDriven || 0),
                                    driverDistanceKm: String(driver.distanceDrivenKm || 0),
                                    isVerified: isVerified ? "1" : "0",
                                    verEmail: driver.verificationDetails?.email ? "1" : "0",
                                    verPhone: driver.verificationDetails?.phone ? "1" : "0",
                                    verLicense: driver.verificationDetails?.license ? "1" : "0",
                                    verVehicle: driver.verificationDetails?.vehicle ? "1" : "0",
                                },
                            });
                        }}
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
                            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                        </View>
                    </TouchableOpacity>

                    {/* ── Chat buttons ──────────────── */}
                    {(booked || requested) && !isDriver && (
                        <View style={tw`flex-row gap-3 mt-4`}>
                            <TouchableOpacity
                                onPress={openDriverChat}
                                style={[
                                    tw`flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl`,
                                    { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary },
                                ]}
                            >
                                <Ionicons name="chatbubble" size={16} color={colors.primary} />
                                <Text style={[tw`font-bold text-sm`, { color: colors.primary }]}>Message Driver</Text>
                            </TouchableOpacity>
                            {booked && (
                                <TouchableOpacity
                                    onPress={openGroupChat}
                                    style={[
                                        tw`flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl`,
                                        { backgroundColor: colors.primary },
                                    ]}
                                >
                                    <Ionicons name="chatbubbles" size={16} color="white" />
                                    <Text style={tw`text-white font-bold text-sm`}>Group Chat</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

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

                    {/* ── Seat Preference Picker (old single-seat — only when not using form) ── */}
                    {/* This is now handled inside the booking form modal */}

                </View>
            </ScrollView>

            {/* ── Booking Form Modal ─────────────────── */}
            <Modal
                visible={showBookingForm}
                animationType="slide"
                onRequestClose={() => setShowBookingForm(false)}
            >
                <View style={[tw`flex-1`, { backgroundColor: colors.background }]}>
                    {/* Modal Header */}
                    <View style={[tw`flex-row items-center px-5 pt-12 pb-4 border-b`, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <TouchableOpacity onPress={() => { if (bookingStep > 1) setBookingStep(bookingStep - 1); else setShowBookingForm(false); }} style={tw`mr-4`}>
                            <Ionicons name={bookingStep > 1 ? "arrow-back" : "close"} size={24} color={colors.textPrimary} />
                        </TouchableOpacity>
                        <View style={tw`flex-1`}>
                            <Text style={[tw`text-lg font-bold`, { color: colors.textPrimary }]}>
                                {bookingStep === 1 ? "Book Ride" : "Choose Seats"}
                            </Text>
                            <Text style={[tw`text-xs`, { color: colors.textMuted }]}>
                                Step {bookingStep} of 2 · ₹{estimatedFare || ride?.pricing?.baseFare} per person
                            </Text>
                        </View>
                        <View style={tw`flex-row items-center gap-1.5`}>
                            <View style={[tw`w-2 h-2 rounded-full`, { backgroundColor: colors.primary }]} />
                            <View style={[tw`w-2 h-2 rounded-full`, { backgroundColor: bookingStep >= 2 ? colors.primary : colors.border }]} />
                        </View>
                    </View>

                    <ScrollView contentContainerStyle={tw`px-5 pt-4 pb-32`} showsVerticalScrollIndicator={false}>
                        {bookingStep === 1 ? (
                            <>
                                {/* ── Step 1: Rider Details ── */}
                                <Text style={[tw`text-xs font-extrabold tracking-widest mb-3`, { color: colors.textSecondary }]}>ARE YOU RIDING?</Text>
                                <View style={tw`flex-row gap-3 mb-5`}>
                                    <TouchableOpacity
                                        onPress={() => {
                                            setRiderIsPartOfRide(true);
                                            // Adjust additional passengers count
                                            const extra = totalSeatsWanted - 1;
                                            setAdditionalPassengers((prev) => {
                                                if (prev.length > extra) return prev.slice(0, extra);
                                                const toAdd = extra - prev.length;
                                                return [...prev, ...Array.from({ length: toAdd }, () => ({ name: "", age: "", sex: "", email: "" }))];
                                            });
                                        }}
                                        activeOpacity={0.8}
                                        style={[
                                            tw`flex-1 py-4 rounded-2xl items-center border-2`,
                                            {
                                                borderColor: riderIsPartOfRide ? colors.primary : colors.border,
                                                backgroundColor: riderIsPartOfRide ? colors.primarySoft : colors.surface,
                                            },
                                        ]}
                                    >
                                        <Ionicons name="person" size={24} color={riderIsPartOfRide ? colors.primary : colors.textMuted} />
                                        <Text style={[tw`text-sm font-bold mt-1`, { color: riderIsPartOfRide ? colors.primary : colors.textPrimary }]}>Yes, I'm riding</Text>
                                        <Text style={[tw`text-[10px] mt-0.5`, { color: colors.textMuted }]}>Use my account details</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => {
                                            setRiderIsPartOfRide(false);
                                            // Need at least 1 guest when rider is not part
                                            setAdditionalPassengers((prev) => {
                                                const needed = Math.max(1, totalSeatsWanted);
                                                if (prev.length >= needed) return prev.slice(0, needed);
                                                const toAdd = needed - prev.length;
                                                return [...prev, ...Array.from({ length: toAdd }, () => ({ name: "", age: "", sex: "", email: "" }))];
                                            });
                                        }}
                                        activeOpacity={0.8}
                                        style={[
                                            tw`flex-1 py-4 rounded-2xl items-center border-2`,
                                            {
                                                borderColor: !riderIsPartOfRide ? colors.primary : colors.border,
                                                backgroundColor: !riderIsPartOfRide ? colors.primarySoft : colors.surface,
                                            },
                                        ]}
                                    >
                                        <Ionicons name="people" size={24} color={!riderIsPartOfRide ? colors.primary : colors.textMuted} />
                                        <Text style={[tw`text-sm font-bold mt-1`, { color: !riderIsPartOfRide ? colors.primary : colors.textPrimary }]}>No, booking for others</Text>
                                        <Text style={[tw`text-[10px] mt-0.5`, { color: colors.textMuted }]}>Enter rider details</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* ── You (when rider is part) ── */}
                                {riderIsPartOfRide && (
                                    <View style={[tw`rounded-2xl border mb-5 overflow-hidden`, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                                        <View style={[tw`px-4 py-3 flex-row items-center justify-between`]}>
                                            <View style={tw`flex-row items-center gap-2`}>
                                                <View style={[tw`w-8 h-8 rounded-full items-center justify-center`, { backgroundColor: colors.primarySoft }]}>
                                                    <Ionicons name="person" size={16} color={colors.primary} />
                                                </View>
                                                <View>
                                                    <Text style={[tw`text-sm font-bold`, { color: colors.textPrimary }]}>{user?.fullName || "You"}</Text>
                                                    <Text style={[tw`text-[10px]`, { color: colors.textMuted }]}>Your account</Text>
                                                </View>
                                            </View>
                                            <View style={[tw`px-2.5 py-1 rounded-full`, { backgroundColor: colors.successSoft || "rgba(7,136,41,0.1)" }]}>
                                                <Text style={[tw`text-[10px] font-bold`, { color: colors.success }]}>YOUR ACCOUNT</Text>
                                            </View>
                                        </View>
                                    </View>
                                )}

                                {/* ── Additional Passengers ── */}
                                {additionalPassengers.length > 0 && (
                                    <Text style={[tw`text-xs font-extrabold tracking-widest mb-3`, { color: colors.textSecondary }]}>
                                        {riderIsPartOfRide ? "CO-RIDERS" : "RIDER DETAILS"}
                                    </Text>
                                )}

                                {additionalPassengers.map((guest, idx) => (
                                    <View
                                        key={idx}
                                        style={[tw`rounded-2xl border mb-4 overflow-hidden`, { borderColor: colors.border, backgroundColor: colors.surface }]}
                                    >
                                        {/* Guest header */}
                                        <View style={[tw`px-4 py-3 flex-row items-center justify-between`, { borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
                                            <View style={tw`flex-row items-center gap-2`}>
                                                <View style={[tw`w-7 h-7 rounded-full items-center justify-center`, { backgroundColor: colors.primary }]}>
                                                    <Text style={tw`text-white text-xs font-bold`}>{idx + 1}</Text>
                                                </View>
                                                <Text style={[tw`text-sm font-bold`, { color: colors.textPrimary }]}>
                                                    {guest.name.trim() || `Rider ${idx + 1}`}
                                                </Text>
                                            </View>
                                            {additionalPassengers.length > (riderIsPartOfRide ? 0 : 1) && (
                                                <TouchableOpacity onPress={() => removeGuestSlot(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                                    <Ionicons name="close-circle" size={22} color="#ef4444" />
                                                </TouchableOpacity>
                                            )}
                                        </View>

                                        <View style={tw`px-4 py-3 gap-3`}>
                                            {/* Name */}
                                            <View>
                                                <Text style={[tw`text-[10px] font-bold uppercase mb-1`, { color: colors.textMuted }]}>Full Name *</Text>
                                                <TextInput
                                                    value={guest.name}
                                                    onChangeText={(v) => updateGuest(idx, "name", v)}
                                                    placeholder="Enter full name"
                                                    placeholderTextColor={colors.textMuted}
                                                    style={[tw`text-sm px-3 py-2.5 rounded-xl border`, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.textPrimary }]}
                                                />
                                            </View>

                                            {/* Age + Sex row */}
                                            <View style={tw`flex-row gap-3`}>
                                                <View style={tw`flex-1`}>
                                                    <Text style={[tw`text-[10px] font-bold uppercase mb-1`, { color: colors.textMuted }]}>Age</Text>
                                                    <TextInput
                                                        value={guest.age}
                                                        onChangeText={(v) => updateGuest(idx, "age", v.replace(/[^0-9]/g, ""))}
                                                        placeholder="Age"
                                                        keyboardType="numeric"
                                                        placeholderTextColor={colors.textMuted}
                                                        style={[tw`text-sm px-3 py-2.5 rounded-xl border`, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.textPrimary }]}
                                                    />
                                                </View>
                                                <View style={tw`flex-1`}>
                                                    <Text style={[tw`text-[10px] font-bold uppercase mb-1`, { color: colors.textMuted }]}>Sex</Text>
                                                    <View style={tw`flex-row gap-2`}>
                                                        {["male", "female", "other"].map((s) => {
                                                            const sel = guest.sex === s;
                                                            return (
                                                                <TouchableOpacity
                                                                    key={s}
                                                                    onPress={() => updateGuest(idx, "sex", s)}
                                                                    style={[tw`flex-1 py-2.5 rounded-xl items-center border`, { borderColor: sel ? colors.primary : colors.border, backgroundColor: sel ? colors.primarySoft : colors.surfaceMuted }]}
                                                                >
                                                                    <Text style={[tw`text-[10px] font-bold capitalize`, { color: sel ? colors.primary : colors.textSecondary }]}>{s}</Text>
                                                                </TouchableOpacity>
                                                            );
                                                        })}
                                                    </View>
                                                </View>
                                            </View>

                                            {/* Email */}
                                            <View>
                                                <Text style={[tw`text-[10px] font-bold uppercase mb-1`, { color: colors.textMuted }]}>Email *</Text>
                                                <TextInput
                                                    value={guest.email}
                                                    onChangeText={(v) => updateGuest(idx, "email", v)}
                                                    placeholder="Email for contact"
                                                    keyboardType="email-address"
                                                    autoCapitalize="none"
                                                    placeholderTextColor={colors.textMuted}
                                                    style={[tw`text-sm px-3 py-2.5 rounded-xl border`, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.textPrimary }]}
                                                />
                                            </View>
                                        </View>
                                    </View>
                                ))}

                                {/* ── Add more riders ── */}
                                {((riderIsPartOfRide ? 1 : 0) + additionalPassengers.length) < (ride?.seats?.available || 8) && (
                                    <TouchableOpacity
                                        onPress={addGuestSlot}
                                        style={[tw`flex-row items-center justify-center py-3 rounded-xl border-2 border-dashed mb-4`, { borderColor: colors.primary }]}
                                    >
                                        <Ionicons name="add-circle-outline" size={20} color={colors.primary} style={tw`mr-2`} />
                                        <Text style={[tw`text-sm font-bold`, { color: colors.primary }]}>Add Another Rider</Text>
                                    </TouchableOpacity>
                                )}

                                {/* ── Summary ── */}
                                <View style={[tw`rounded-2xl border p-4 mt-2`, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
                                    <Text style={[tw`text-xs font-extrabold tracking-widest mb-2`, { color: colors.textSecondary }]}>BOOKING SUMMARY</Text>
                                    <View style={tw`flex-row justify-between items-center mb-1`}>
                                        <Text style={[tw`text-sm`, { color: colors.textSecondary }]}>Total riders</Text>
                                        <Text style={[tw`text-sm font-bold`, { color: colors.textPrimary }]}>{(riderIsPartOfRide ? 1 : 0) + additionalPassengers.length}</Text>
                                    </View>
                                    <View style={tw`flex-row justify-between items-center mb-1`}>
                                        <Text style={[tw`text-sm`, { color: colors.textSecondary }]}>Fare per person</Text>
                                        <Text style={[tw`text-sm font-bold`, { color: colors.textPrimary }]}>₹{estimatedFare || ride?.pricing?.baseFare}</Text>
                                    </View>
                                    <View style={[tw`flex-row justify-between items-center pt-2 mt-1 border-t`, { borderColor: colors.border }]}>
                                        <Text style={[tw`text-sm font-bold`, { color: colors.textPrimary }]}>Estimated Total</Text>
                                        <Text style={[tw`text-lg font-extrabold`, { color: colors.primary }]}>
                                            ₹{((parseInt(estimatedFare) || ride?.pricing?.baseFare || 0) * ((riderIsPartOfRide ? 1 : 0) + additionalPassengers.length))}
                                        </Text>
                                    </View>
                                </View>
                            </>
                        ) : (
                            <>
                                {/* ── Step 2: Seat Assignment ── */}
                                <Text style={[tw`text-xs font-extrabold tracking-widest mb-1`, { color: colors.textSecondary }]}>ASSIGN SEATS</Text>
                                <Text style={[tw`text-xs mb-5`, { color: colors.textMuted }]}>
                                    Choose a seat for each rider. Already-taken seats are greyed out.
                                </Text>

                                {/* Self seat assignment */}
                                {riderIsPartOfRide && (() => {
                                    const avail = computeAvailableSeats("self");
                                    const hasSeatTypes = (ride?.seats?.seatTypes || []).some(st => st.count > 0 && st.type !== 'any');
                                    return (
                                        <View style={[tw`rounded-2xl border mb-4 overflow-hidden`, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                                            <View style={[tw`px-4 py-3 flex-row items-center gap-2`, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                                                <View style={[tw`w-8 h-8 rounded-full items-center justify-center`, { backgroundColor: colors.primarySoft }]}>
                                                    <Ionicons name="person" size={16} color={colors.primary} />
                                                </View>
                                                <Text style={[tw`text-sm font-bold flex-1`, { color: colors.textPrimary }]}>{user?.fullName || "You"}</Text>
                                                {seatSelections["self"] && seatSelections["self"] !== "any" && (
                                                    <View style={[tw`px-2 py-1 rounded-full`, { backgroundColor: colors.primarySoft }]}>
                                                        <Text style={[tw`text-[10px] font-bold`, { color: colors.primary }]}>
                                                            {SEAT_TYPES_LIST.find(s => s.type === seatSelections["self"])?.label || seatSelections["self"]}
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>
                                            <View style={tw`px-4 py-3 flex-row flex-wrap gap-2`}>
                                                {hasSeatTypes && (ride.seats?.seatTypes || []).filter(st => st.count > 0 && st.type !== 'any').map((st) => {
                                                    const sel = seatSelections["self"] === st.type;
                                                    const remaining = avail[st.type] ?? 0;
                                                    const disabled = !sel && remaining <= 0;
                                                    return (
                                                        <TouchableOpacity
                                                            key={st.type}
                                                            disabled={disabled}
                                                            onPress={() => setSeatSelections(prev => ({ ...prev, "self": st.type }))}
                                                            style={[tw`px-3 py-2 rounded-xl border`, {
                                                                borderColor: sel ? colors.primary : disabled ? colors.border : colors.border,
                                                                backgroundColor: sel ? colors.primarySoft : disabled ? colors.surfaceMuted : 'transparent',
                                                                opacity: disabled ? 0.4 : 1,
                                                            }]}
                                                        >
                                                            <Text style={[tw`text-xs`, { color: sel ? colors.primary : disabled ? colors.textMuted : colors.textPrimary, fontWeight: sel ? '700' : '500' }]}>
                                                                {st.label || st.type}
                                                            </Text>
                                                            <Text style={[tw`text-[9px] mt-0.5`, { color: sel ? colors.primary : colors.textMuted }]}>
                                                                {remaining} left
                                                            </Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                                <TouchableOpacity
                                                    onPress={() => setSeatSelections(prev => ({ ...prev, "self": "any" }))}
                                                    style={[tw`px-3 py-2 rounded-xl border`, {
                                                        borderColor: (!seatSelections["self"] || seatSelections["self"] === "any") ? colors.primary : colors.border,
                                                        backgroundColor: (!seatSelections["self"] || seatSelections["self"] === "any") ? colors.primarySoft : 'transparent',
                                                    }]}
                                                >
                                                    <Text style={[tw`text-xs`, { color: (!seatSelections["self"] || seatSelections["self"] === "any") ? colors.primary : colors.textPrimary, fontWeight: (!seatSelections["self"] || seatSelections["self"] === "any") ? '700' : '500' }]}>Any Seat</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    );
                                })()}

                                {/* Guest seat assignments */}
                                {additionalPassengers.map((guest, idx) => {
                                    const avail = computeAvailableSeats(idx);
                                    const hasSeatTypes = (ride?.seats?.seatTypes || []).some(st => st.count > 0 && st.type !== 'any');
                                    return (
                                        <View
                                            key={idx}
                                            style={[tw`rounded-2xl border mb-4 overflow-hidden`, { borderColor: colors.border, backgroundColor: colors.surface }]}
                                        >
                                            <View style={[tw`px-4 py-3 flex-row items-center gap-2`, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                                                <View style={[tw`w-7 h-7 rounded-full items-center justify-center`, { backgroundColor: colors.primary }]}>
                                                    <Text style={tw`text-white text-xs font-bold`}>{idx + 1}</Text>
                                                </View>
                                                <Text style={[tw`text-sm font-bold flex-1`, { color: colors.textPrimary }]}>
                                                    {guest.name.trim() || `Rider ${idx + 1}`}
                                                </Text>
                                                {seatSelections[idx] && seatSelections[idx] !== "any" && (
                                                    <View style={[tw`px-2 py-1 rounded-full`, { backgroundColor: colors.primarySoft }]}>
                                                        <Text style={[tw`text-[10px] font-bold`, { color: colors.primary }]}>
                                                            {SEAT_TYPES_LIST.find(s => s.type === seatSelections[idx])?.label || seatSelections[idx]}
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>
                                            <View style={tw`px-4 py-3 flex-row flex-wrap gap-2`}>
                                                {hasSeatTypes && (ride.seats?.seatTypes || []).filter(st => st.count > 0 && st.type !== 'any').map((st) => {
                                                    const sel = seatSelections[idx] === st.type;
                                                    const remaining = avail[st.type] ?? 0;
                                                    const disabled = !sel && remaining <= 0;
                                                    return (
                                                        <TouchableOpacity
                                                            key={st.type}
                                                            disabled={disabled}
                                                            onPress={() => setSeatSelections(prev => ({ ...prev, [idx]: st.type }))}
                                                            style={[tw`px-3 py-2 rounded-xl border`, {
                                                                borderColor: sel ? colors.primary : disabled ? colors.border : colors.border,
                                                                backgroundColor: sel ? colors.primarySoft : disabled ? colors.surfaceMuted : 'transparent',
                                                                opacity: disabled ? 0.4 : 1,
                                                            }]}
                                                        >
                                                            <Text style={[tw`text-xs`, { color: sel ? colors.primary : disabled ? colors.textMuted : colors.textPrimary, fontWeight: sel ? '700' : '500' }]}>
                                                                {st.label || st.type}
                                                            </Text>
                                                            <Text style={[tw`text-[9px] mt-0.5`, { color: sel ? colors.primary : colors.textMuted }]}>
                                                                {remaining} left
                                                            </Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                                <TouchableOpacity
                                                    onPress={() => setSeatSelections(prev => ({ ...prev, [idx]: "any" }))}
                                                    style={[tw`px-3 py-2 rounded-xl border`, {
                                                        borderColor: (!seatSelections[idx] || seatSelections[idx] === "any") ? colors.primary : colors.border,
                                                        backgroundColor: (!seatSelections[idx] || seatSelections[idx] === "any") ? colors.primarySoft : 'transparent',
                                                    }]}
                                                >
                                                    <Text style={[tw`text-xs`, { color: (!seatSelections[idx] || seatSelections[idx] === "any") ? colors.primary : colors.textPrimary, fontWeight: (!seatSelections[idx] || seatSelections[idx] === "any") ? '700' : '500' }]}>Any Seat</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    );
                                })}
                            </>
                        )}
                    </ScrollView>

                    {/* Modal Footer */}
                    <View style={[tw`absolute bottom-0 left-0 right-0 px-5 pb-8 pt-4`, { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }]}>
                        {bookingStep === 1 ? (
                            <TouchableOpacity
                                onPress={() => {
                                    for (let i = 0; i < additionalPassengers.length; i++) {
                                        const g = additionalPassengers[i];
                                        if (!g.name.trim()) { Alert.alert("Missing info", `Please enter a name for Rider ${i + 1}.`); return; }
                                        if (!g.email.trim()) { Alert.alert("Missing info", `Please enter an email for ${g.name || `Rider ${i + 1}`}.`); return; }
                                    }
                                    if ((riderIsPartOfRide ? 1 : 0) + additionalPassengers.length === 0) {
                                        Alert.alert("No riders", "Please add at least one rider.");
                                        return;
                                    }
                                    setBookingStep(2);
                                }}
                                activeOpacity={0.85}
                                style={[tw`py-3.5 rounded-xl items-center flex-row justify-center gap-2`, { backgroundColor: colors.primary }]}
                            >
                                <Text style={[tw`text-sm font-extrabold`, { color: "#fff" }]}>
                                    Next: Choose Seats →
                                </Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                onPress={handleRequest}
                                disabled={booking}
                                activeOpacity={0.85}
                                style={[tw`py-3.5 rounded-xl items-center flex-row justify-center gap-2`, { backgroundColor: colors.primary }]}
                            >
                                {booking ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <>
                                        <Ionicons name="checkmark-circle" size={18} color="#fff" />
                                        <Text style={[tw`text-sm font-extrabold`, { color: "#fff" }]}>
                                            Request {(riderIsPartOfRide ? 1 : 0) + additionalPassengers.length} Seat{((riderIsPartOfRide ? 1 : 0) + additionalPassengers.length) !== 1 ? "s" : ""} · ₹{((parseInt(estimatedFare) || ride?.pricing?.baseFare || 0) * ((riderIsPartOfRide ? 1 : 0) + additionalPassengers.length))}
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </Modal>

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
                    <View style={tw`gap-2`}>
                        <View
                            style={[
                                tw`flex-row items-center justify-center gap-2 py-3 rounded-xl`,
                                { backgroundColor: "rgba(7,136,41,0.12)" },
                            ]}
                        >
                            <MaterialCommunityIcons name="check-circle" size={18} color={colors.success} />
                            <Text style={[tw`text-sm font-bold`, { color: colors.success }]}>
                                Ride Confirmed
                            </Text>
                        </View>
                        {(ride?.seats?.available || 0) > 0 && (
                            <TouchableOpacity
                                onPress={openBookingForm}
                                disabled={booking}
                                activeOpacity={0.85}
                                style={[tw`py-3 rounded-xl items-center flex-row justify-center gap-2 border`, { borderColor: colors.primary }]}
                            >
                                <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                                <Text style={[tw`text-sm font-bold`, { color: colors.primary }]}>
                                    Book More Seats ({ride.seats.available} left)
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ) : requested ? (
                    <View style={tw`gap-2`}>
                        <View
                            style={[
                                tw`flex-row items-center justify-center gap-2 py-3 rounded-xl`,
                                { backgroundColor: "rgba(245,158,11,0.12)" },
                            ]}
                        >
                            <MaterialCommunityIcons name="clock-outline" size={18} color="#f59e0b" />
                            <Text style={[tw`text-sm font-bold`, { color: "#f59e0b" }]}>
                                Requested — Waiting for Driver
                            </Text>
                        </View>
                        {(ride?.seats?.available || 0) > 0 && (
                            <TouchableOpacity
                                onPress={openBookingForm}
                                disabled={booking}
                                activeOpacity={0.85}
                                style={[tw`py-3 rounded-xl items-center flex-row justify-center gap-2 border`, { borderColor: colors.primary }]}
                            >
                                <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                                <Text style={[tw`text-sm font-bold`, { color: colors.primary }]}>
                                    Book More Seats ({ride.seats.available} left)
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ) : (
                    <TouchableOpacity
                        onPress={openBookingForm}
                        disabled={booking}
                        activeOpacity={0.85}
                        style={[tw`py-3.5 rounded-xl items-center`, { backgroundColor: colors.primary }]}
                    >
                        {booking ? (
                            <ActivityIndicator size="small" color={colors.primaryText} />
                        ) : (
                            <Text style={[tw`text-sm font-extrabold`, { color: colors.primaryText }]}>
                                Book {totalSeatsWanted} Seat{totalSeatsWanted !== 1 ? "s" : ""} · ₹{estimatedFare}
                            </Text>
                        )}
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}
