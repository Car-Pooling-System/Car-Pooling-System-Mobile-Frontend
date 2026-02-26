import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, useColorScheme, Alert, StyleSheet, Dimensions, Switch, Linking, Platform, Modal } from "react-native";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useUser } from "@clerk/clerk-expo";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import * as Location from "expo-location";
import tw from "twrnc";
import { theme } from "../../../constants/Colors";
import { decodePolyline } from "../../../utils/polyline";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

/**
 * Builds a 2D array of seat rows for the top-view car diagram.
 * seatTypes: [{ type, label, count }]  (from ride.seats.seatTypes)
 * confirmedPassengers: array of passenger objects
 * driver: { name, profileImage }
 *
 * Returns: [ [seatSlot, ...], ... ]  where each seatSlot = { type, label, passenger | null }
 */
function buildCarLayout(seatTypes = [], confirmedPassengers = [], driver = {}) {
    const pq = [...confirmedPassengers];
    const take = () => pq.shift() || null;

    // Expand seat types into individual slots
    const expanded = seatTypes.flatMap(st =>
        Array.from({ length: st.count || 0 }, () => ({ type: st.type, label: st.label || st.type }))
    );
    if (expanded.length === 0) return [];

    // Assign passengers sequentially to slots
    const assigned = expanded.map(s => ({ ...s, passenger: take() }));

    // 'front' type goes in the front row alongside driver
    const frontSeats = assigned.filter(s => s.type === 'front');
    let backSeats = assigned.filter(s => s.type !== 'front');

    // If no explicit 'front' type, promote first back seat to front row
    if (frontSeats.length === 0 && backSeats.length > 0) {
        frontSeats.push(backSeats.shift());
    }

    const driverSlot = {
        type: 'driver',
        label: 'Driver',
        passenger: { name: driver.name, profileImage: driver.profileImage, isDriver: true },
    };

    const rows = [[driverSlot, ...frontSeats]];

    // thirdRow seats get their own row(s) at the back
    const thirdRow = backSeats.filter(s => s.type === 'thirdRow');
    const midSeats = backSeats.filter(s => s.type !== 'thirdRow');

    for (let i = 0; i < midSeats.length; i += 3) rows.push(midSeats.slice(i, i + 3));
    for (let i = 0; i < thirdRow.length; i += 3) rows.push(thirdRow.slice(i, i + 3));

    return rows;
}

export default function RideDetails() {
    const { rideId, role } = useLocalSearchParams();
    const { user } = useUser();
    const router = useRouter();
    const scheme = useColorScheme();
    const colors = theme[scheme ?? "light"];

    const [ride, setRide] = useState(null);
    const [loading, setLoading] = useState(true);
    const [cancelling, setCancelling] = useState(false);
    const [updatingPrefs, setUpdatingPrefs] = useState(false);
    const [distanceToPickup, setDistanceToPickup] = useState(null);
    const [scrollEnabled, setScrollEnabled] = useState(true);
    const [showSeatMap, setShowSeatMap] = useState(false);
    const [activeSeat, setActiveSeat] = useState(null);

    const haversineKm = (lat1, lon1, lat2, lon2) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const handleNavigate = () => {
        if (!ride?.route?.start?.location?.coordinates) return;
        const [lng, lat] = ride.route.start.location.coordinates;
        const label = encodeURIComponent(ride.route.start.name || 'Pickup Point');
        const url = Platform.OS === 'ios'
            ? `maps://?daddr=${lat},${lng}&dirflg=d`
            : `google.navigation:q=${lat},${lng}`;
        Linking.canOpenURL(url).then(supported => {
            Linking.openURL(supported ? url : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${label}`);
        });
    };

    const fetchRideDetails = useCallback(async () => {
        try {
            const response = await fetch(`${BACKEND_URL}/api/rides/${rideId}`);
            console.log(rideId);
            const data = await response.json();
            if (response.ok) {
                setRide(data.ride);
            } else {
                Alert.alert("Error", data.message || "Failed to fetch ride details");
            }
        } catch (error) {
            console.error("Error fetching ride details:", error);
            Alert.alert("Error", "Something went wrong while fetching ride details");
        } finally {
            setLoading(false);
        }
    }, [rideId]);

    useEffect(() => {
        if (rideId) fetchRideDetails();
    }, [fetchRideDetails]);

    useEffect(() => {
        if (role !== 'driver' || !ride) return;
        (async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return;
            const loc = await Location.getCurrentPositionAsync({});
            const coords = ride.route?.start?.location?.coordinates;
            if (coords) {
                setDistanceToPickup(haversineKm(loc.coords.latitude, loc.coords.longitude, coords[1], coords[0]));
            }
        })();
    }, [role, ride]);

    const routePoints = useMemo(() => {
        if (ride?.route?.encodedPolyline) {
            return decodePolyline(ride.route.encodedPolyline);
        }
        return [];
    }, [ride]);

    const initialRegion = useMemo(() => {
        if (routePoints.length > 0) {
            const firstPoint = routePoints[0];
            return {
                latitude: firstPoint.latitude,
                longitude: firstPoint.longitude,
                latitudeDelta: 0.1,
                longitudeDelta: 0.1,
            };
        }
        return {
            latitude: 12.9716, // Default to Bangalore if no route
            longitude: 77.5946,
            latitudeDelta: 0.1,
            longitudeDelta: 0.1,
        };
    }, [routePoints]);

    const formatDuration = (minutes) => {
        if (!minutes) return "0m";
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const handleUpdatePreference = async (key, value) => {
        if (updatingPrefs) return;

        try {
            setUpdatingPrefs(true);
            const response = await fetch(`${BACKEND_URL}/api/rides/${rideId}/preferences`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    driverUserId: user.id,
                    preferences: { [key]: value }
                }),
            });

            const data = await response.json();
            if (response.ok) {
                setRide(prev => ({
                    ...prev,
                    preferences: {
                        ...prev.preferences,
                        [key]: value
                    }
                }));
            } else {
                Alert.alert("Error", data.message || "Failed to update preferences");
            }
        } catch (error) {
            console.error("Error updating preference:", error);
            Alert.alert("Error", "Failed to update preference. Please try again.");
        } finally {
            setUpdatingPrefs(false);
        }
    };

    const handleCancel = async () => {
        const confirmCancel = await new Promise((resolve) => {
            Alert.alert(
                "Cancel Ride",
                `Are you sure you want to cancel this ${role === "driver" ? "ride" : "booking"}?`,
                [
                    { text: "No", onPress: () => resolve(false), style: "cancel" },
                    { text: "Yes", onPress: () => resolve(true), style: "destructive" },
                ]
            );
        });

        if (!confirmCancel) return;

        try {
            setCancelling(true);
            const endpoint = `${BACKEND_URL}/api/rides/${rideId}/cancel`;

            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.id }),
            });

            const data = await response.json();
            if (response.ok) {
                Alert.alert("Success", data.message || "Cancelled successfully");
                router.back();
            } else {
                Alert.alert("Error", data.message || "Failed to cancel");
            }
        } catch (error) {
            console.error("Error cancelling:", error);
            Alert.alert("Error", "Failed to cancel. Please try again.");
        } finally {
            setCancelling(false);
        }
    };

    if (loading) {
        return (
            <View style={[tw`flex-1 justify-center items-center`, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    if (!ride) {
        return (
            <View style={[tw`flex-1 justify-center items-center`, { backgroundColor: colors.background }]}>
                <Text style={{ color: colors.textPrimary }}>Ride not found</Text>
            </View>
        );
    }

    const { route, schedule, metrics, seats, driver, passengers, pricing, preferences } = ride;
    const vehicle = ride.vehicle;
    const departureTime = new Date(schedule.departureTime);
    const isVerified = driver?.isVerified;
    const verDet = driver?.verificationDetails || {};

    // Arrival time fix: Calculate if invalid
    let arrivalTime = new Date(schedule.arrivalTime);
    if (isNaN(arrivalTime.getTime())) {
        arrivalTime = new Date(departureTime.getTime() + (metrics.durationMinutes || 0) * 60000);
    }

    const confirmedPassengers = passengers?.filter(p => p.status === "confirmed") || [];
    const carSeatRows = buildCarLayout(seats?.seatTypes || [], confirmedPassengers, driver);
    const isDriver = role === "driver";
    const canEditPrefs = isDriver && confirmedPassengers.length === 0;
    const isPast = departureTime < new Date() || ride.status === "completed" || ride.status === "cancelled";

    return (
        <View style={[tw`flex-1`, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[tw`pt-4 pb-4 px-6 bg-white border-b flex-row items-center`, { borderColor: colors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={tw`mr-4`}>
                    <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={[tw`text-xl font-bold`, { color: colors.textPrimary }]}>Ride Details</Text>
            </View>

            <ScrollView contentContainerStyle={tw`pb-10`} scrollEnabled={scrollEnabled}>
                {/* Map View */}
                <View
                    style={tw`h-64 w-full`}
                    onTouchStart={() => setScrollEnabled(false)}
                    onTouchEnd={() => setScrollEnabled(true)}
                    onTouchCancel={() => setScrollEnabled(true)}
                >
                    <MapView
                        provider={PROVIDER_GOOGLE}
                        style={StyleSheet.absoluteFillObject}
                        initialRegion={initialRegion}
                        scrollEnabled={true}
                        zoomEnabled={true}
                        pitchEnabled={true}
                        rotateEnabled={true}
                    >
                        {routePoints.length > 0 && (
                            <Polyline
                                coordinates={routePoints}
                                strokeColor={colors.primary}
                                strokeWidth={4}
                            />
                        )}
                        {routePoints.length > 0 && (
                            <>
                                <Marker coordinate={routePoints[0]} title="Start" />
                                <Marker coordinate={routePoints[routePoints.length - 1]} title="End" />
                            </>
                        )}
                    </MapView>
                </View>

                {/* Ride Stats Bar */}
                <View style={[tw`flex-row justify-around py-4 bg-white border-b`, { borderColor: colors.border }]}>
                    <View style={tw`items-center`}>
                        <Ionicons name="resize" size={20} color={colors.primary} />
                        <Text style={[tw`text-xs font-bold mt-1`, { color: colors.textPrimary }]}>{metrics.totalDistanceKm.toFixed(1)} km</Text>
                    </View>
                    <View style={tw`items-center`}>
                        <Ionicons name="time" size={20} color={colors.primary} />
                        <Text style={[tw`text-xs font-bold mt-1`, { color: colors.textPrimary }]}>{formatDuration(metrics.durationMinutes)}</Text>
                    </View>
                    <View style={tw`items-center`}>
                        <MaterialCommunityIcons name="currency-inr" size={20} color={colors.primary} />
                        <Text style={[tw`text-xs font-bold mt-1`, { color: colors.textPrimary }]}>₹{pricing.baseFare}</Text>
                    </View>
                </View>

                {/* Main Content */}
                <View style={tw`p-6`}>
                    {/* Route Timeline */}
                    <View style={[tw`bg-white rounded-2xl p-6 mb-6 shadow-sm border`, { borderColor: colors.border }]}>
                        <View style={tw`flex-row items-start mb-6`}>
                            <View style={tw`items-center mr-4`}>
                                <View style={[tw`w-3 h-3 rounded-full`, { backgroundColor: colors.primary }]} />
                                <View style={tw`w-0.5 h-16 bg-gray-200`} />
                            </View>
                            <View style={tw`flex-1`}>
                                <Text style={[tw`text-xs font-bold mb-1`, { color: colors.textSecondary }]}>
                                    {departureTime.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })} · {departureTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                                <Text style={[tw`text-base font-bold`, { color: colors.textPrimary }]}>{route.start.name}</Text>
                            </View>
                        </View>
                        <View style={tw`flex-row items-start`}>
                            <View style={tw`items-center mr-4`}>
                                <View style={[tw`w-3 h-3 rounded-full`, { backgroundColor: "#ef4444" }]} />
                            </View>
                            <View style={tw`flex-1`}>
                                <Text style={[tw`text-xs font-bold mb-1`, { color: colors.textSecondary }]}>
                                    {arrivalTime.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })} · {arrivalTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                                <Text style={[tw`text-base font-bold`, { color: colors.textPrimary }]}>{route.end.name}</Text>
                            </View>
                        </View>
                    </View>

                    {/* Navigation Card — Driver only */}
                    {isDriver && !isPast && route?.start?.location?.coordinates && (
                        <View style={[tw`bg-white rounded-2xl p-5 mb-6 shadow-sm border`, { borderColor: colors.border }]}>
                            <View style={tw`flex-row items-center mb-4`}>
                                <View style={[tw`w-10 h-10 rounded-full items-center justify-center mr-3`, { backgroundColor: colors.primarySoft }]}>
                                    <Ionicons name="navigate" size={20} color={colors.primary} />
                                </View>
                                <View style={tw`flex-1`}>
                                    <Text style={[tw`font-bold text-sm`, { color: colors.textPrimary }]}>Pickup Point</Text>
                                    <Text style={[tw`text-xs mt-0.5`, { color: colors.textSecondary }]} numberOfLines={1}>{route.start.name}</Text>
                                </View>
                                {distanceToPickup !== null && (
                                    <View style={[tw`px-3 py-1.5 rounded-full`, { backgroundColor: distanceToPickup < 5 ? colors.successSoft : colors.primarySoft }]}>
                                        <Text style={[tw`text-sm font-bold`, { color: distanceToPickup < 5 ? colors.success : colors.primary }]}>
                                            {distanceToPickup < 1
                                                ? `${Math.round(distanceToPickup * 1000)} m`
                                                : `${distanceToPickup.toFixed(1)} km`}
                                        </Text>
                                    </View>
                                )}
                            </View>
                            <TouchableOpacity
                                onPress={handleNavigate}
                                style={[tw`flex-row items-center justify-center py-3 rounded-xl gap-2`, { backgroundColor: colors.primary }]}
                            >
                                <Ionicons name="navigate-outline" size={18} color="white" />
                                <Text style={tw`text-white font-bold`}>Start Navigation to Pickup</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Driver/Rider Info Section */}
                    {role === "rider" ? (
                        <View style={[tw`bg-white rounded-2xl mb-6 shadow-sm border overflow-hidden`, { borderColor: colors.border }]}>

                            {/* Section label */}
                            <View style={[tw`px-5 pt-4 pb-3 flex-row items-center justify-between`, { borderBottomWidth: 1, borderBottomColor: colors.borderLight }]}>
                                <Text style={[tw`text-xs font-bold tracking-widest`, { color: colors.textSecondary }]}>YOUR DRIVER</Text>
                                <View style={[tw`flex-row items-center px-2.5 py-1 rounded-full gap-1`, { backgroundColor: isVerified ? colors.successSoft : colors.dangerSoft }]}>
                                    <Ionicons name={isVerified ? "shield-checkmark" : "shield-outline"} size={11} color={isVerified ? colors.success : colors.danger} />
                                    <Text style={[tw`text-[10px] font-bold`, { color: isVerified ? colors.success : colors.danger }]}>
                                        {isVerified ? "Verified Driver" : "Not Fully Verified"}
                                    </Text>
                                </View>
                            </View>

                            {/* Driver avatar + info */}
                            <View style={tw`flex-row items-center px-5 py-4 gap-4`}>
                                <View style={tw`relative`}>
                                    <Image source={{ uri: driver.profileImage }} style={tw`w-16 h-16 rounded-full bg-gray-100`} />
                                    {isVerified && (
                                        <View style={[tw`absolute -bottom-1 -right-1 w-5 h-5 rounded-full items-center justify-center border-2 border-white`, { backgroundColor: colors.success }]}>
                                            <Ionicons name="checkmark" size={9} color="white" />
                                        </View>
                                    )}
                                </View>
                                <View style={tw`flex-1`}>
                                    <Text style={[tw`text-base font-bold`, { color: colors.textPrimary }]}>{driver.name}</Text>
                                    {/* Rating row */}
                                    <View style={tw`flex-row items-center gap-1.5 mt-1`}>
                                        <Ionicons name="star" size={13} color="#f59e0b" />
                                        <Text style={[tw`text-sm font-bold`, { color: colors.textPrimary }]}>
                                            {driver.rating ? driver.rating.toFixed(1) : '—'}
                                        </Text>
                                        {driver.reviewsCount > 0 && (
                                            <Text style={[tw`text-xs`, { color: colors.textMuted }]}>({driver.reviewsCount} reviews)</Text>
                                        )}
                                    </View>
                                    {/* Rides hosted */}
                                    {driver.ridesHosted > 0 && (
                                        <Text style={[tw`text-xs mt-0.5`, { color: colors.textSecondary }]}>
                                            {driver.ridesHosted} ride{driver.ridesHosted !== 1 ? 's' : ''} hosted
                                        </Text>
                                    )}
                                </View>
                                <TouchableOpacity
                                    style={[tw`w-10 h-10 rounded-full items-center justify-center`, { backgroundColor: colors.primarySoft }]}
                                    onPress={() => Alert.alert('Call Driver', 'This feature is not implemented yet.')}
                                >
                                    <Ionicons name="call" size={18} color={colors.primary} />
                                </TouchableOpacity>
                            </View>

                            {/* Unverified badges */}
                            {!isVerified && (
                                <View style={[tw`flex-row flex-wrap gap-1.5 px-5 pb-3`, { marginTop: -4 }]}>
                                    <Text style={[tw`text-[10px] w-full mb-0.5`, { color: colors.textMuted }]}>Missing verification:</Text>
                                    {!verDet.email && <Text style={[tw`text-[9px] px-2 py-0.5 rounded-full font-bold`, { backgroundColor: colors.dangerSoft, color: colors.danger }]}>Email</Text>}
                                    {!verDet.phone && <Text style={[tw`text-[9px] px-2 py-0.5 rounded-full font-bold`, { backgroundColor: colors.dangerSoft, color: colors.danger }]}>Phone</Text>}
                                    {!verDet.license && <Text style={[tw`text-[9px] px-2 py-0.5 rounded-full font-bold`, { backgroundColor: colors.dangerSoft, color: colors.danger }]}>License</Text>}
                                    {!verDet.vehicle && <Text style={[tw`text-[9px] px-2 py-0.5 rounded-full font-bold`, { backgroundColor: colors.dangerSoft, color: colors.danger }]}>Vehicle</Text>}
                                </View>
                            )}

                            {/* Divider */}
                            <View style={[tw`mx-5`, { height: 1, backgroundColor: colors.borderLight }]} />

                            {/* Vehicle card */}
                            {vehicle?.brand ? (
                                <View style={tw`mx-5 my-4 rounded-xl overflow-hidden`}>
                                    {vehicle.image ? (
                                        <Image source={{ uri: vehicle.image }} style={{ width: '100%', height: 140 }} resizeMode="cover" />
                                    ) : (
                                        <View style={[tw`items-center justify-center rounded-xl`, { height: 100, backgroundColor: colors.surfaceMuted }]}>
                                            <MaterialCommunityIcons name="car-side" size={48} color={colors.textMuted} />
                                        </View>
                                    )}
                                    <View style={tw`flex-row items-center mt-2.5`}>
                                        <View style={tw`flex-1`}>
                                            <Text style={[tw`font-bold text-sm`, { color: colors.textPrimary }]}>
                                                {vehicle.brand} {vehicle.model}
                                                {vehicle.year ? <Text style={[tw`font-normal`, { color: colors.textSecondary }]}> · {vehicle.year}</Text> : null}
                                            </Text>
                                            {vehicle.color && (
                                                <View style={tw`flex-row items-center gap-1.5 mt-0.5`}>
                                                    <View style={[tw`w-3 h-3 rounded-full border border-gray-200`, { backgroundColor: vehicle.color?.toLowerCase() || '#ccc' }]} />
                                                    <Text style={[tw`text-xs capitalize`, { color: colors.textSecondary }]}>{vehicle.color}</Text>
                                                </View>
                                            )}
                                            <View style={tw`flex-row items-center gap-1 mt-1`}>
                                                <MaterialCommunityIcons
                                                    name={vehicle.hasLuggageSpace ? "bag-checked" : "bag-personal-off"}
                                                    size={13}
                                                    color={vehicle.hasLuggageSpace ? colors.success : colors.textMuted}
                                                />
                                                <Text style={[tw`text-[10px] font-bold`, { color: vehicle.hasLuggageSpace ? colors.success : colors.textMuted }]}>
                                                    {vehicle.hasLuggageSpace ? "Luggage Space" : "No Luggage Space"}
                                                </Text>
                                            </View>
                                        </View>
                                        {vehicle.licensePlate && (
                                            <View style={[tw`px-3 py-1.5 rounded-lg border`, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                                                <Text style={[tw`text-xs font-bold tracking-widest`, { color: colors.textPrimary }]}>{vehicle.licensePlate}</Text>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            ) : (
                                <View style={[tw`mx-5 my-4 flex-row items-center gap-3 p-3 rounded-xl`, { backgroundColor: colors.surfaceMuted }]}>
                                    <MaterialCommunityIcons name="car-off" size={20} color={colors.textMuted} />
                                    <Text style={[tw`text-xs flex-1`, { color: colors.textMuted }]}>Vehicle details not available for this ride.</Text>
                                </View>
                            )}
                        </View>
                    ) : (
                        <View>
                            {/* Your Vehicle — driver view */}
                            <View style={[tw`bg-white rounded-2xl mb-6 shadow-sm border overflow-hidden`, { borderColor: colors.border }]}>
                                <View style={[tw`px-5 pt-4 pb-3`, { borderBottomWidth: 1, borderBottomColor: colors.borderLight }]}>
                                    <Text style={[tw`text-xs font-bold tracking-widest`, { color: colors.textSecondary }]}>YOUR VEHICLE</Text>
                                </View>
                                {vehicle?.brand ? (
                                    <View style={tw`mx-5 my-4`}>
                                        <TouchableOpacity onPress={() => setShowSeatMap(true)} activeOpacity={0.85}>
                                            {vehicle.image ? (
                                                <Image source={{ uri: vehicle.image }} style={[tw`w-full rounded-xl`, { height: 150 }]} resizeMode="cover" />
                                            ) : (
                                                <View style={[tw`w-full rounded-xl items-center justify-center`, { height: 110, backgroundColor: colors.surfaceMuted }]}>
                                                    <MaterialCommunityIcons name="car-side" size={56} color={colors.textMuted} />
                                                </View>
                                            )}
                                            <View style={[tw`absolute bottom-2 right-2 flex-row items-center gap-1 px-2 py-1 rounded-full`, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
                                                <MaterialCommunityIcons name="car-seat" size={11} color="white" />
                                                <Text style={tw`text-[10px] text-white font-bold`}>View Seats</Text>
                                            </View>
                                        </TouchableOpacity>
                                        <View style={tw`flex-row items-center mt-3`}>
                                            <View style={tw`flex-1`}>
                                                <Text style={[tw`font-bold text-base`, { color: colors.textPrimary }]}>
                                                    {vehicle.brand} {vehicle.model}
                                                    {vehicle.year ? <Text style={[tw`font-normal text-sm`, { color: colors.textSecondary }]}> · {vehicle.year}</Text> : null}
                                                </Text>
                                                {vehicle.color ? (
                                                    <View style={tw`flex-row items-center gap-1.5 mt-0.5`}>
                                                        <View style={[tw`w-3 h-3 rounded-full border border-gray-200`, { backgroundColor: vehicle.color?.toLowerCase() || '#ccc' }]} />
                                                        <Text style={[tw`text-xs capitalize`, { color: colors.textSecondary }]}>{vehicle.color}</Text>
                                                    </View>
                                                ) : null}
                                                <View style={tw`flex-row items-center gap-1 mt-1`}>
                                                    <MaterialCommunityIcons
                                                        name={vehicle.hasLuggageSpace ? "bag-checked" : "bag-personal-off"}
                                                        size={13}
                                                        color={vehicle.hasLuggageSpace ? colors.success : colors.textMuted}
                                                    />
                                                    <Text style={[tw`text-[10px] font-bold`, { color: vehicle.hasLuggageSpace ? colors.success : colors.textMuted }]}>
                                                        {vehicle.hasLuggageSpace ? "Luggage Space" : "No Luggage Space"}
                                                    </Text>
                                                </View>
                                            </View>
                                            {vehicle.licensePlate ? (
                                                <View style={[tw`px-3 py-1.5 rounded-lg border`, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                                                    <Text style={[tw`text-xs font-bold tracking-widest`, { color: colors.textPrimary }]}>{vehicle.licensePlate}</Text>
                                                </View>
                                            ) : null}
                                        </View>
                                    </View>
                                ) : (
                                    <TouchableOpacity
                                        style={[tw`mx-5 my-4 flex-row items-center gap-3 p-4 rounded-xl border border-dashed`, { borderColor: colors.border }]}
                                        onPress={() => router.push('/profile/vehicles')}
                                    >
                                        <MaterialCommunityIcons name="car-plus" size={22} color={colors.primary} />
                                        <View style={tw`flex-1`}>
                                            <Text style={[tw`text-sm font-bold`, { color: colors.primary }]}>Add vehicle details</Text>
                                            <Text style={[tw`text-xs mt-0.5`, { color: colors.textMuted }]}>Riders can't see your car yet</Text>
                                        </View>
                                        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                                    </TouchableOpacity>
                                )}
                            </View>

                            {/* Passengers */}
                            <View style={[tw`bg-white rounded-2xl p-6 mb-6 shadow-sm border`, { borderColor: colors.border }]}>
                            <View style={tw`flex-row justify-between items-center mb-4`}>
                                <View style={tw`flex-row items-center gap-2`}>
                                    <Text style={[tw`text-sm font-bold`, { color: colors.textSecondary }]}>PASSENGERS</Text>
                                    <TouchableOpacity
                                        onPress={() => { setActiveSeat(null); setShowSeatMap(true); }}
                                        style={[tw`flex-row items-center gap-1 px-2 py-0.5 rounded-full`, { backgroundColor: colors.primarySoft }]}
                                    >
                                        <MaterialCommunityIcons name="car-seat" size={10} color={colors.primary} />
                                        <Text style={[tw`text-[9px] font-bold`, { color: colors.primary }]}>Seat Map</Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={tw`flex-row items-center gap-2`}>
                                    <View style={[tw`flex-row items-center px-2 py-0.5 rounded-full`, { backgroundColor: isVerified ? colors.successSoft : colors.dangerSoft }]}>
                                        <Ionicons name={isVerified ? "shield-checkmark" : "shield-outline"} size={11} color={isVerified ? colors.success : colors.danger} />
                                        <Text style={[tw`text-[10px] font-bold ml-0.5`, { color: isVerified ? colors.success : colors.danger }]}>
                                            {isVerified ? "Verified" : "Unverified"}
                                        </Text>
                                    </View>
                                    <Text style={[tw`text-xs font-bold`, { color: colors.primary }]}>{confirmedPassengers.length}/{seats.total} Booked</Text>
                                </View>
                            </View>
                            {confirmedPassengers.length > 0 ? (
                                confirmedPassengers.map((passenger, index) => (
                                    <View key={index} style={[tw`flex-row items-center py-3`, index !== confirmedPassengers.length - 1 && tw`border-b`, { borderColor: colors.borderLight }]}>
                                        <Image source={{ uri: passenger.profileImage }} style={tw`w-10 h-10 rounded-full mr-3`} />
                                        <View style={tw`flex-1`}>
                                            <Text style={[tw`text-sm font-bold`, { color: colors.textPrimary }]}>{passenger.name}</Text>
                                            <Text style={[tw`text-xs font-bold`, { color: colors.primary }]}>₹{passenger.farePaid}</Text>
                                        </View>
                                        <TouchableOpacity style={[tw`p-2 rounded-full`, { backgroundColor: colors.primarySoft }]}>
                                            <Ionicons name="chatbubble" size={16} color={colors.primary} />
                                        </TouchableOpacity>
                                    </View>
                                ))
                            ) : (
                                <Text style={[tw`text-sm italic text-center py-4`, { color: colors.textSecondary }]}>No confirmed passengers yet.</Text>
                            )}
                        </View>
                        </View>
                    )}

                    {/* Preferences */}
                    <View style={[tw`bg-white rounded-2xl p-6 mb-6 shadow-sm border`, { borderColor: colors.border }]}>
                        <View style={tw`flex-row justify-between items-center mb-4`}>
                            <Text style={[tw`text-sm font-bold`, { color: colors.textSecondary }]}>RIDE PREFERENCES</Text>
                            {isDriver && (
                                <Text style={[tw`text-[10px] font-bold`, { color: canEditPrefs ? colors.primary : colors.danger }]}>
                                    {canEditPrefs ? "EDITABLE" : "LOCKED"}
                                </Text>
                            )}
                        </View>

                        <View style={tw`flex-row justify-around items-center`}>
                            <View style={tw`items-center`}>
                                <MaterialCommunityIcons
                                    name={preferences?.petsAllowed ? "dog" : "paw-off"}
                                    size={24}
                                    color={preferences?.petsAllowed ? colors.primary : colors.textMuted}
                                />
                                <Text style={[tw`text-[10px] my-1`, { color: colors.textSecondary }]}>Pets</Text>
                                {canEditPrefs && (
                                    <Switch
                                        value={preferences?.petsAllowed}
                                        onValueChange={(val) => handleUpdatePreference('petsAllowed', val)}
                                        trackColor={{ false: "#767577", true: colors.primarySoft }}
                                        thumbColor={preferences?.petsAllowed ? colors.primary : "#f4f3f4"}
                                        style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                                    />
                                )}
                            </View>
                            <View style={tw`items-center`}>
                                <MaterialCommunityIcons
                                    name={preferences?.smokingAllowed ? "smoking" : "smoking-off"}
                                    size={24}
                                    color={preferences?.smokingAllowed ? colors.primary : colors.textMuted}
                                />
                                <Text style={[tw`text-[10px] my-1`, { color: colors.textSecondary }]}>Smoking</Text>
                                {canEditPrefs && (
                                    <Switch
                                        value={preferences?.smokingAllowed}
                                        onValueChange={(val) => handleUpdatePreference('smokingAllowed', val)}
                                        trackColor={{ false: "#767577", true: colors.primarySoft }}
                                        thumbColor={preferences?.smokingAllowed ? colors.primary : "#f4f3f4"}
                                        style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                                    />
                                )}
                            </View>
                            <View style={tw`items-center`}>
                                <MaterialCommunityIcons
                                    name={preferences?.luggageSpace ? "bag-checked" : "bag-personal-off"}
                                    size={24}
                                    color={preferences?.luggageSpace ? colors.primary : colors.textMuted}
                                />
                                <Text style={[tw`text-[10px] my-1`, { color: colors.textSecondary }]}>Luggage</Text>
                                {canEditPrefs && (
                                    <Switch
                                        value={preferences?.luggageSpace}
                                        onValueChange={(val) => handleUpdatePreference('luggageSpace', val)}
                                        trackColor={{ false: "#767577", true: colors.primarySoft }}
                                        thumbColor={preferences?.luggageSpace ? colors.primary : "#f4f3f4"}
                                        style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                                    />
                                )}
                            </View>
                        </View>
                    </View>

                    {/* Cancellation Button */}
                    {!isPast && (
                        <TouchableOpacity
                            style={[tw`bg-red-50 py-4 rounded-xl border border-red-200 items-center`, cancelling && tw`opacity-50`]}
                            onPress={handleCancel}
                            disabled={cancelling}
                        >
                            {cancelling ? (
                                <ActivityIndicator size="small" color="#ef4444" />
                            ) : (
                                <Text style={tw`text-red-500 font-bold`}>Cancel {role === "driver" ? "Ride" : "Booking"}</Text>
                            )}
                        </TouchableOpacity>
                    )}
                </View>
            </ScrollView>

            {/* ── Seat Map Modal ──────────────────────────────────────── */}
            <Modal
                visible={showSeatMap}
                transparent
                animationType="slide"
                onRequestClose={() => { setShowSeatMap(false); setActiveSeat(null); }}
            >
                <View style={[tw`flex-1 justify-end`, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
                    {/* Tap outside to dismiss */}
                    <TouchableOpacity style={tw`flex-1`} activeOpacity={1} onPress={() => { setShowSeatMap(false); setActiveSeat(null); }} />

                    <View style={[tw`rounded-t-3xl px-5 pt-4 pb-10`, { backgroundColor: colors.surface }]}>
                        {/* Drag handle */}
                        <View style={[tw`w-10 h-1 rounded-full self-center mb-4`, { backgroundColor: colors.border }]} />

                        {/* Header */}
                        <View style={tw`flex-row items-center justify-between mb-5`}>
                            <View>
                                <Text style={[tw`text-base font-bold`, { color: colors.textPrimary }]}>Seat View</Text>
                                <Text style={[tw`text-xs mt-0.5`, { color: colors.textSecondary }]}>
                                    {confirmedPassengers.length}/{seats?.total} seats occupied
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => { setShowSeatMap(false); setActiveSeat(null); }}
                                style={[tw`w-8 h-8 rounded-full items-center justify-center`, { backgroundColor: colors.surfaceMuted }]}
                            >
                                <Ionicons name="close" size={18} color={colors.textPrimary} />
                            </TouchableOpacity>
                        </View>

                        {/* FRONT label */}
                        <View style={tw`flex-row items-center mb-2`}>
                            <View style={[tw`h-px flex-1`, { backgroundColor: colors.border }]} />
                            <Text style={[tw`text-[10px] font-bold mx-2 tracking-widest`, { color: colors.textMuted }]}>FRONT</Text>
                            <View style={[tw`h-px flex-1`, { backgroundColor: colors.border }]} />
                        </View>

                        {/* Car body */}
                        <View style={[tw`rounded-3xl py-4 px-2`, { backgroundColor: colors.surfaceMuted, borderWidth: 1.5, borderColor: colors.border }]}>
                            {/* Windshield */}
                            <View style={[tw`mx-8 rounded-lg mb-5`, { height: 10, backgroundColor: colors.border, opacity: 0.6 }]} />

                            {carSeatRows.length === 0 ? (
                                <View style={tw`items-center py-6`}>
                                    <MaterialCommunityIcons name="car-off" size={32} color={colors.textMuted} />
                                    <Text style={[tw`text-xs mt-2`, { color: colors.textMuted }]}>No seat layout available</Text>
                                </View>
                            ) : (
                                carSeatRows.map((row, rowIdx) => (
                                    <View key={rowIdx}>
                                        {rowIdx > 0 && (
                                            <View style={[tw`mx-4 my-3`, { height: 1, backgroundColor: colors.borderLight }]} />
                                        )}
                                        <View style={tw`flex-row justify-around`}>
                                            {row.map((seat, seatIdx) => {
                                                const isDriverSeat = seat.type === 'driver';
                                                const p = seat.passenger;
                                                const isActive = activeSeat?.rowIdx === rowIdx && activeSeat?.seatIdx === seatIdx;
                                                return (
                                                    <TouchableOpacity
                                                        key={seatIdx}
                                                        onPress={() => p && setActiveSeat(isActive ? null : { rowIdx, seatIdx, passenger: p, isDriver: isDriverSeat })}
                                                        activeOpacity={p ? 0.75 : 1}
                                                        style={tw`items-center`}
                                                    >
                                                        <View style={[
                                                            tw`w-14 h-16 rounded-2xl items-center justify-center overflow-hidden`,
                                                            {
                                                                backgroundColor: isDriverSeat ? colors.successSoft : p ? colors.primarySoft : 'transparent',
                                                                borderWidth: 2,
                                                                borderColor: isActive ? '#f59e0b' : isDriverSeat ? colors.success : p ? colors.primary : colors.border,
                                                                borderStyle: p || isDriverSeat ? 'solid' : 'dashed',
                                                            }
                                                        ]}>
                                                            {p?.profileImage ? (
                                                                <Image source={{ uri: p.profileImage }} style={tw`w-full h-full`} resizeMode="cover" />
                                                            ) : isDriverSeat ? (
                                                                <MaterialCommunityIcons name="steering" size={28} color={colors.success} />
                                                            ) : (
                                                                <Ionicons name="person-outline" size={20} color={colors.border} />
                                                            )}
                                                            {isDriverSeat && p?.profileImage && (
                                                                <View style={[tw`absolute bottom-0.5 right-0.5 rounded-full p-0.5`, { backgroundColor: colors.success }]}>
                                                                    <MaterialCommunityIcons name="steering" size={7} color="white" />
                                                                </View>
                                                            )}
                                                        </View>
                                                        <Text
                                                            style={[tw`text-[9px] mt-1 text-center`, { color: p ? colors.textPrimary : colors.textMuted, maxWidth: 60 }]}
                                                            numberOfLines={1}
                                                        >
                                                            {isDriverSeat ? 'Driver' : p ? p.name?.split(' ')[0] : 'Open'}
                                                        </Text>
                                                        {isDriverSeat && (
                                                            <View style={[tw`mt-0.5 px-1.5 py-0.5 rounded-full`, { backgroundColor: colors.successSoft }]}>
                                                                <Text style={[tw`text-[8px] font-bold`, { color: colors.success }]}>DRIVER</Text>
                                                            </View>
                                                        )}
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </View>
                                ))
                            )}

                            {/* Rear windshield */}
                            <View style={[tw`mx-8 rounded-lg mt-5`, { height: 10, backgroundColor: colors.border, opacity: 0.6 }]} />
                        </View>

                        {/* REAR label */}
                        <View style={tw`flex-row items-center mt-2`}>
                            <View style={[tw`h-px flex-1`, { backgroundColor: colors.border }]} />
                            <Text style={[tw`text-[10px] font-bold mx-2 tracking-widest`, { color: colors.textMuted }]}>REAR</Text>
                            <View style={[tw`h-px flex-1`, { backgroundColor: colors.border }]} />
                        </View>

                        {/* Tapped seat info card */}
                        {activeSeat && (
                            <View style={[
                                tw`flex-row items-center gap-3 mt-4 p-3 rounded-xl`,
                                {
                                    backgroundColor: activeSeat.isDriver ? colors.successSoft : colors.primarySoft,
                                    borderWidth: 1,
                                    borderColor: activeSeat.isDriver ? colors.success : colors.primary,
                                }
                            ]}>
                                {activeSeat.passenger.profileImage ? (
                                    <Image source={{ uri: activeSeat.passenger.profileImage }} style={tw`w-10 h-10 rounded-full`} />
                                ) : (
                                    <View style={[tw`w-10 h-10 rounded-full items-center justify-center`, { backgroundColor: activeSeat.isDriver ? colors.success : colors.primary }]}>
                                        <Ionicons name="person" size={20} color="white" />
                                    </View>
                                )}
                                <View style={tw`flex-1`}>
                                    <Text style={[tw`font-bold text-sm`, { color: colors.textPrimary }]}>{activeSeat.passenger.name}</Text>
                                    {activeSeat.isDriver ? (
                                        <Text style={[tw`text-xs`, { color: colors.success }]}>Driver</Text>
                                    ) : activeSeat.passenger.farePaid ? (
                                        <Text style={[tw`text-xs`, { color: colors.primary }]}>₹{activeSeat.passenger.farePaid} fare paid</Text>
                                    ) : null}
                                </View>
                                {!activeSeat.isDriver && (
                                    <TouchableOpacity style={[tw`p-2 rounded-full`, { backgroundColor: colors.primary }]}>
                                        <Ionicons name="chatbubble" size={14} color="white" />
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}

                        {/* Legend */}
                        <View style={tw`flex-row justify-center gap-5 mt-4`}>
                            <View style={tw`flex-row items-center gap-1.5`}>
                                <View style={[tw`w-2.5 h-2.5 rounded-full`, { backgroundColor: colors.success }]} />
                                <Text style={[tw`text-[10px]`, { color: colors.textSecondary }]}>Driver</Text>
                            </View>
                            <View style={tw`flex-row items-center gap-1.5`}>
                                <View style={[tw`w-2.5 h-2.5 rounded-full`, { backgroundColor: colors.primary }]} />
                                <Text style={[tw`text-[10px]`, { color: colors.textSecondary }]}>Booked</Text>
                            </View>
                            <View style={tw`flex-row items-center gap-1.5`}>
                                <View style={[tw`w-2.5 h-2.5 rounded-full border`, { borderColor: colors.border }]} />
                                <Text style={[tw`text-[10px]`, { color: colors.textSecondary }]}>Available</Text>
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
