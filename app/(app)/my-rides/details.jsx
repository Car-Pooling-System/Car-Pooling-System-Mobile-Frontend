import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, useColorScheme, Alert, StyleSheet, Dimensions, Switch } from "react-native";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useUser } from "@clerk/clerk-expo";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import tw from "twrnc";
import { theme } from "../../../constants/Colors";
import { decodePolyline } from "../../../utils/polyline";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

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

            <ScrollView contentContainerStyle={tw`pb-10`}>
                {/* Map View */}
                <View style={tw`h-64 w-full`}>
                    <MapView
                        provider={PROVIDER_GOOGLE}
                        style={StyleSheet.absoluteFillObject}
                        initialRegion={initialRegion}
                        scrollEnabled={false}
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

                    {/* Driver/Rider Info Section */}
                    {role === "rider" ? (
                        <View style={[tw`bg-white rounded-2xl p-6 mb-6 shadow-sm border`, { borderColor: colors.border }]}>
                            <Text style={[tw`text-sm font-bold mb-4`, { color: colors.textSecondary }]}>DRIVER</Text>
                            <View style={[tw`flex-row items-center border-b pb-4 mb-4`, { borderColor: colors.borderLight }]}>
                                <Image source={{ uri: driver.profileImage }} style={tw`w-14 h-14 rounded-full mr-4`} />
                                <View style={tw`flex-1`}>
                                    <Text style={[tw`text-lg font-bold`, { color: colors.textPrimary }]}>{driver.name}</Text>
                                    <View style={tw`flex-row items-center mt-1 gap-2`}>
                                        <View style={tw`flex-row items-center`}>
                                            <Ionicons name="star" size={13} color="#f59e0b" />
                                            <Text style={[tw`text-xs font-bold ml-1`, { color: colors.textSecondary }]}>{driver.rating?.toFixed(1) || "New"}</Text>
                                        </View>
                                        <View style={[tw`flex-row items-center px-2 py-0.5 rounded-full`, { backgroundColor: isVerified ? colors.successSoft : colors.dangerSoft }]}>
                                            <Ionicons name={isVerified ? "shield-checkmark" : "shield-outline"} size={12} color={isVerified ? colors.success : colors.danger} />
                                            <Text style={[tw`text-xs font-bold ml-1`, { color: isVerified ? colors.success : colors.danger }]}>
                                                {isVerified ? "Verified" : "Unverified"}
                                            </Text>
                                        </View>
                                    </View>
                                    {!isVerified && (
                                        <View style={tw`flex-row flex-wrap gap-1 mt-1`}>
                                            {!verDet.email && <Text style={[tw`text-[9px] px-1.5 py-0.5 rounded`, { backgroundColor: colors.dangerSoft, color: colors.danger }]}>Email</Text>}
                                            {!verDet.phone && <Text style={[tw`text-[9px] px-1.5 py-0.5 rounded`, { backgroundColor: colors.dangerSoft, color: colors.danger }]}>Phone</Text>}
                                            {!verDet.license && <Text style={[tw`text-[9px] px-1.5 py-0.5 rounded`, { backgroundColor: colors.dangerSoft, color: colors.danger }]}>License</Text>}
                                            {!verDet.vehicle && <Text style={[tw`text-[9px] px-1.5 py-0.5 rounded`, { backgroundColor: colors.dangerSoft, color: colors.danger }]}>Vehicle</Text>}
                                        </View>
                                    )}
                                </View>
                                <TouchableOpacity
                                    style={[tw`p-3 rounded-full`, { backgroundColor: colors.primarySoft }]}
                                    onPress={() => Alert.alert("Call Driver", "This feature is not implemented yet.")}
                                >
                                    <Ionicons name="call" size={20} color={colors.primary} />
                                </TouchableOpacity>
                            </View>

                            {/* Vehicle Card */}
                            {vehicle && (
                                <View style={[tw`rounded-xl overflow-hidden border`, { borderColor: colors.border }]}>
                                    {vehicle.image ? (
                                        <Image source={{ uri: vehicle.image }} style={{ width: "100%", height: 120 }} resizeMode="cover" />
                                    ) : (
                                        <View style={[tw`justify-center items-center`, { height: 80, backgroundColor: colors.surfaceMuted }]}>
                                            <MaterialCommunityIcons name="car" size={36} color={colors.textMuted} />
                                        </View>
                                    )}
                                    <View style={[tw`flex-row justify-between items-center px-3 py-2`, { backgroundColor: colors.surface }]}>
                                        <View>
                                            <Text style={[tw`font-bold text-sm`, { color: colors.textPrimary }]}>{vehicle.brand} {vehicle.model} · {vehicle.year}</Text>
                                            <Text style={[tw`text-xs`, { color: colors.textSecondary }]}>{vehicle.color}</Text>
                                        </View>
                                        <View style={[tw`px-2 py-1 rounded-lg`, { backgroundColor: colors.surfaceMuted }]}>
                                            <Text style={[tw`text-xs font-bold`, { color: colors.textPrimary }]}>{vehicle.licensePlate}</Text>
                                        </View>
                                    </View>
                                </View>
                            )}
                        </View>
                    ) : (
                        <View style={[tw`bg-white rounded-2xl p-6 mb-6 shadow-sm border`, { borderColor: colors.border }]}>
                            <View style={tw`flex-row justify-between items-center mb-4`}>
                                <Text style={[tw`text-sm font-bold`, { color: colors.textSecondary }]}>PASSENGERS</Text>
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
                                    name="numeric-2-circle"
                                    size={24}
                                    color={preferences?.max2Allowed ? colors.primary : colors.textMuted}
                                />
                                <Text style={[tw`text-[10px] my-1`, { color: colors.textSecondary }]}>Max 2 Back</Text>
                                {canEditPrefs && (
                                    <Switch
                                        value={preferences?.max2Allowed}
                                        onValueChange={(val) => handleUpdatePreference('max2Allowed', val)}
                                        trackColor={{ false: "#767577", true: colors.primarySoft }}
                                        thumbColor={preferences?.max2Allowed ? colors.primary : "#f4f3f4"}
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
        </View>
    );
}
