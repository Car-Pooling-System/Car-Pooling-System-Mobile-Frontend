import { View, Text, TouchableOpacity, Image, Alert, StyleSheet, Dimensions, useColorScheme, TextInput, Modal, FlatList, ActivityIndicator, ScrollView } from "react-native";
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useUser } from "@clerk/clerk-expo";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "../../../components/common/MapWrapper";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import tw from "twrnc";
import { theme } from "../../../constants/Colors";
import { useSocket } from "../../../context/SocketContext";
import { decodePolyline } from "../../../utils/polyline";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function LiveRide() {
    const { rideId, role } = useLocalSearchParams();
    const { user } = useUser();
    const router = useRouter();
    const scheme = useColorScheme();
    const colors = theme[scheme ?? "light"];
    const { socket } = useSocket();
    const mapRef = useRef(null);
    const locationSubRef = useRef(null);

    const [ride, setRide] = useState(null);
    const [loading, setLoading] = useState(true);
    const [locations, setLocations] = useState({});
    const [myLocation, setMyLocation] = useState(null);
    const [otpInput, setOtpInput] = useState("");
    const [showOtpModal, setShowOtpModal] = useState(false);
    const [selectedPassenger, setSelectedPassenger] = useState(null);
    const [verifyingOtp, setVerifyingOtp] = useState(false);
    const [completingRide, setCompletingRide] = useState(false);
    const [droppingPassenger, setDroppingPassenger] = useState(null);

    const isDriver = role === "driver";

    /* ── Fetch ride data ── */
    const fetchLiveData = useCallback(async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/rides/${rideId}/live`);
            const data = await res.json();
            if (res.ok) setRide(data.ride);
        } catch (err) {
            console.error("[LiveRide] fetch error:", err);
        } finally {
            setLoading(false);
        }
    }, [rideId]);

    useEffect(() => {
        fetchLiveData();
        const interval = setInterval(fetchLiveData, 10000);
        return () => clearInterval(interval);
    }, [fetchLiveData]);

    /* ── Socket events ── */
    useEffect(() => {
        if (!socket || !rideId) return;
        socket.emit("join-ride", rideId);

        socket.on("location-updated", (data) => {
            setLocations((prev) => ({ ...prev, [data.userId]: { lat: data.lat, lng: data.lng, role: data.role, name: data.name, profileImage: data.profileImage } }));
        });

        socket.on("rider-ready-notification", (data) => {
            if (isDriver) {
                Alert.alert("🙋 Rider Ready!", `${data.riderName} is ready for pickup.`);
                fetchLiveData();
            }
        });

        socket.on("rider-boarded", (data) => {
            Alert.alert("✅ Boarded", `${data.passengerName} has boarded the ride.`);
            fetchLiveData();
        });

        socket.on("ride-completed-notification", () => {
            Alert.alert("🏁 Ride Complete", "The ride has been completed.", [{ text: "OK", onPress: () => router.back() }]);
        });

        // New events
        socket.on("washroom-break-notification", (data) => {
            Alert.alert("🚻 Washroom Break", `${data.riderName} is requesting a washroom break. Please find a safe place to stop.`);
        });

        socket.on("passenger-dropped-notification", (data) => {
            Alert.alert("📍 Passenger Dropped", `${data.passengerName || "A passenger"} has been dropped off.`);
            fetchLiveData();
            if (data.allDropped) {
                setTimeout(() => {
                    Alert.alert("🏁 All Passengers Dropped", "All passengers have been dropped off. Complete the ride?", [
                        { text: "Not Yet", style: "cancel" },
                        { text: "Complete", onPress: () => handleCompleteRide(true) },
                    ]);
                }, 500);
            }
        });

        socket.on("sos-alert-notification", (data) => {
            Alert.alert("🚨 SOS ALERT!", `${data.riderName || "A rider"} has triggered an SOS emergency alert!`, [{ text: "OK" }]);
        });

        return () => {
            socket.emit("leave-ride", rideId);
            socket.off("location-updated");
            socket.off("rider-ready-notification");
            socket.off("rider-boarded");
            socket.off("ride-completed-notification");
            socket.off("washroom-break-notification");
            socket.off("passenger-dropped-notification");
            socket.off("sos-alert-notification");
        };
    }, [socket, rideId, isDriver]);

    /* ── Track my location + broadcast ── */
    useEffect(() => {
        let sub;
        (async () => {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== "granted") return;
                sub = await Location.watchPositionAsync(
                    { accuracy: Location.Accuracy.High, distanceInterval: 20, timeInterval: 5000 },
                    (loc) => {
                        const { latitude, longitude } = loc.coords;
                        setMyLocation({ lat: latitude, lng: longitude });
                        if (socket && rideId) {
                            socket.emit("location-update", { rideId, lat: latitude, lng: longitude, role: isDriver ? "driver" : "rider", name: user?.fullName || (isDriver ? "Driver" : "Rider"), profileImage: user?.imageUrl || "" });
                        }
                        fetch(`${BACKEND_URL}/api/rides/${rideId}/update-location`, {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ userId: user?.id, lat: latitude, lng: longitude }),
                        }).catch(() => { });
                    }
                );
                locationSubRef.current = sub;
            } catch (error) {
                console.warn("Live ride location watcher unavailable:", error?.message || error);
            }
        })();
        return () => { if (locationSubRef.current) locationSubRef.current.remove(); };
    }, [socket, rideId, isDriver, user]);

    /* ── OTP Verification (driver) ── */
    const handleVerifyOtp = async () => {
        if (!otpInput || otpInput.length < 4) { Alert.alert("Invalid", "Please enter the 4-digit OTP."); return; }
        setVerifyingOtp(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/rides/${rideId}/verify-otp`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ driverUserId: user.id, passengerUserId: selectedPassenger?.userId, otp: otpInput }),
            });
            const data = await res.json();
            if (res.ok) {
                Alert.alert("✅ Verified!", `${selectedPassenger?.name || "Rider"} has boarded.`);
                socket?.emit("otp-verified", { rideId, passengerUserId: selectedPassenger?.userId, passengerName: selectedPassenger?.name });
                setShowOtpModal(false); setOtpInput(""); setSelectedPassenger(null);
                fetchLiveData();
            } else { Alert.alert("Error", data.message || "Invalid OTP"); }
        } catch (err) { Alert.alert("Error", "Failed to verify OTP"); }
        finally { setVerifyingOtp(false); }
    };

    /* ── Drop passenger (driver can drop any passenger) ── */
    const handleDriverDropPassenger = async (passenger) => {
        const ok = await new Promise(resolve => {
            Alert.alert("📍 Drop Off", `Drop off ${passenger.name || "passenger"}${passenger.isGuest ? " (Guest)" : ""} at current location?`, [
                { text: "Cancel", onPress: () => resolve(false), style: "cancel" },
                { text: "Drop Off", onPress: () => resolve(true) },
            ]);
        });
        if (!ok) return;
        setDroppingPassenger(passenger.userId);
        try {
            const res = await fetch(`${BACKEND_URL}/api/rides/${rideId}/drop-passenger`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.id, passengerUserId: passenger.userId, lat: myLocation?.lat, lng: myLocation?.lng }),
            });
            const data = await res.json();
            if (res.ok) {
                socket?.emit("passenger-dropped", { rideId, passengerUserId: passenger.userId, passengerName: passenger.name, allDropped: data.allDropped });
                fetchLiveData();
                if (data.allDropped) {
                    setTimeout(() => {
                        Alert.alert("🏁 All Passengers Dropped", "Complete the ride now?", [
                            { text: "Not Yet", style: "cancel" },
                            { text: "Complete", onPress: () => handleCompleteRide(true) },
                        ]);
                    }, 300);
                }
            } else { Alert.alert("Error", data.message || "Failed to drop off"); }
        } catch (err) { Alert.alert("Error", "Failed to process drop-off"); }
        finally { setDroppingPassenger(null); }
    };

    /* ── Complete Ride (driver) ── */
    const handleCompleteRide = async (skipConfirm = false) => {
        if (!skipConfirm) {
            const confirm = await new Promise((resolve) => {
                Alert.alert("Complete Ride", "Mark this ride as completed?", [
                    { text: "Not Yet", onPress: () => resolve(false), style: "cancel" },
                    { text: "Complete", onPress: () => resolve(true) },
                ]);
            });
            if (!confirm) return;
        }
        setCompletingRide(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/rides/${rideId}/complete`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ driverUserId: user.id }),
            });
            const data = await res.json();
            if (res.ok) {
                socket?.emit("ride-completed", { rideId });
                Alert.alert("🏁 Ride Completed!", "Great trip!", [{ text: "OK", onPress: () => router.back() }]);
            } else { Alert.alert("Error", data.message || "Failed to complete ride"); }
        } catch (err) { Alert.alert("Error", "Failed to complete ride"); }
        finally { setCompletingRide(false); }
    };

    /* ── Route polyline ── */
    const routePoints = ride?.route?.encodedPolyline ? decodePolyline(ride.route.encodedPolyline) : [];

    const getMapRegion = () => {
        if (myLocation) return { latitude: myLocation.lat, longitude: myLocation.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 };
        if (routePoints.length > 0) return { latitude: routePoints[0].latitude, longitude: routePoints[0].longitude, latitudeDelta: 0.1, longitudeDelta: 0.1 };
        return { latitude: 12.9716, longitude: 77.5946, latitudeDelta: 0.1, longitudeDelta: 0.1 };
    };

    const getMarkers = () => {
        const markers = [];
        const driverLoc = ride?.driver?.liveLocation;
        const driverSocketLoc = locations[ride?.driver?.userId];
        const dLat = driverSocketLoc?.lat || driverLoc?.lat;
        const dLng = driverSocketLoc?.lng || driverLoc?.lng;
        if (dLat && dLng) {
            markers.push({ id: "driver", userId: ride.driver.userId, lat: dLat, lng: dLng, name: ride.driver.name || "Driver", profileImage: ride.driver.profileImage, role: "driver", isReady: true, isBoarded: true });
        }
        const passengers = ride?.passengers?.filter((p) => p.status === "confirmed") || [];
        for (const p of passengers) {
            const socketLoc = locations[p.userId];
            const lat = socketLoc?.lat || p.liveLocation?.lat;
            const lng = socketLoc?.lng || p.liveLocation?.lng;
            if (lat && lng) {
                markers.push({ id: p.userId, userId: p.userId, lat, lng, name: p.name || "Rider", profileImage: p.profileImage, role: "rider", isReady: p.isReady, isBoarded: p.isBoarded, isDropped: p.isDropped, isGuest: p.isGuest });
            }
        }
        return markers;
    };

    const fitMapToMarkers = () => {
        const markers = getMarkers();
        if (markers.length > 0 && mapRef.current) {
            const coords = markers.map((m) => ({ latitude: m.lat, longitude: m.lng }));
            if (myLocation) coords.push({ latitude: myLocation.lat, longitude: myLocation.lng });
            mapRef.current.fitToCoordinates(coords, { edgePadding: { top: 80, right: 80, bottom: 200, left: 80 }, animated: true });
        }
    };

    const confirmedPassengers = ride?.passengers?.filter((p) => p.status === "confirmed") || [];
    const readyPassengers = confirmedPassengers.filter((p) => p.isReady);
    const boardedPassengers = confirmedPassengers.filter((p) => p.isBoarded);
    const droppedPassengers = confirmedPassengers.filter((p) => p.isDropped);
    const allDropped = confirmedPassengers.length > 0 && confirmedPassengers.every((p) => p.isDropped || !p.isBoarded);

    if (loading) {
        return (
            <View style={[tw`flex-1 justify-center items-center`, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[tw`mt-4 text-sm`, { color: colors.textSecondary }]}>Loading live ride...</Text>
            </View>
        );
    }

    const markers = getMarkers();

    return (
        <View style={[tw`flex-1`, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[tw`pt-4 pb-3 px-5 bg-white border-b flex-row items-center justify-between`, { borderColor: colors.border }]}>
                <View style={tw`flex-row items-center`}>
                    <TouchableOpacity onPress={() => router.back()} style={tw`mr-3`}>
                        <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <View>
                        <Text style={[tw`text-lg font-bold`, { color: colors.textPrimary }]}>Live Ride</Text>
                        <Text style={[tw`text-xs`, { color: "#059669" }]}>● Active</Text>
                    </View>
                </View>
                <TouchableOpacity onPress={fitMapToMarkers} style={[tw`w-9 h-9 rounded-full items-center justify-center`, { backgroundColor: colors.primarySoft }]}>
                    <Ionicons name="locate" size={20} color={colors.primary} />
                </TouchableOpacity>
            </View>

            {/* Map */}
            <View style={tw`flex-1`}>
                <MapView ref={mapRef} provider={PROVIDER_GOOGLE} style={StyleSheet.absoluteFillObject} initialRegion={getMapRegion()} showsUserLocation={false} showsMyLocationButton={false}>
                    {routePoints.length > 0 && <Polyline coordinates={routePoints} strokeColor={colors.primary} strokeWidth={4} />}
                    {routePoints.length > 0 && (
                        <>
                            <Marker coordinate={routePoints[0]} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                                <View style={[tw`items-center`, { width: 80 }]}>
                                    <View style={[tw`px-2 py-1 rounded-lg mb-1`, { backgroundColor: colors.primary }]}><Text style={tw`text-white text-[10px] font-bold`}>START</Text></View>
                                    <View style={[tw`w-6 h-6 rounded-full items-center justify-center`, { backgroundColor: colors.primary }]}><View style={tw`w-2.5 h-2.5 rounded-full bg-white`} /></View>
                                </View>
                            </Marker>
                            <Marker coordinate={routePoints[routePoints.length - 1]} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                                <View style={[tw`items-center`, { width: 80 }]}>
                                    <View style={[tw`px-2 py-1 rounded-lg mb-1`, { backgroundColor: "#ef4444" }]}><Text style={tw`text-white text-[10px] font-bold`}>END</Text></View>
                                    <View style={[tw`w-6 h-6 rounded-full items-center justify-center`, { backgroundColor: "#ef4444" }]}><View style={tw`w-2.5 h-2.5 rounded-full bg-white`} /></View>
                                </View>
                            </Marker>
                        </>
                    )}

                    {markers.map((m) => {
                        const mc = m.role === "driver" ? "#059669" : m.isDropped ? "#6b7280" : m.isBoarded ? "#10b981" : m.isReady ? "#f59e0b" : colors.primary;
                        return (
                            <Marker key={m.id} coordinate={{ latitude: m.lat, longitude: m.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}
                                onPress={() => { if (isDriver && m.role === "rider" && m.isReady && !m.isBoarded) { setSelectedPassenger(confirmedPassengers.find((p) => p.userId === m.userId)); setShowOtpModal(true); } }}>
                                <View style={[tw`items-center`, { width: 90 }]}>
                                    <View style={[tw`px-2 py-0.5 rounded-full mb-1`, { backgroundColor: mc }]}>
                                        <Text style={tw`text-white text-[9px] font-bold`} numberOfLines={1}>
                                            {m.role === "driver" ? "🚗 " : m.isGuest ? "👤 " : ""}{m.name?.split(" ")[0] || ""}
                                            {m.isDropped ? " 📍" : m.isBoarded ? " ✓" : m.isReady ? " 🙋" : ""}
                                        </Text>
                                    </View>
                                    {m.profileImage ? (
                                        <Image source={{ uri: m.profileImage }} style={[tw`w-9 h-9 rounded-full`, { borderWidth: 3, borderColor: mc }]} />
                                    ) : (
                                        <View style={[tw`w-9 h-9 rounded-full items-center justify-center`, { backgroundColor: mc, borderWidth: 3, borderColor: "white" }]}>
                                            <Ionicons name={m.role === "driver" ? "car" : "person"} size={18} color="white" />
                                        </View>
                                    )}
                                </View>
                            </Marker>
                        );
                    })}
                </MapView>
            </View>

            {/* Bottom Panel */}
            <ScrollView style={[tw`bg-white border-t`, { borderColor: colors.border, maxHeight: 380 }]} contentContainerStyle={tw`px-5 pt-4 pb-6`}>
                <View style={tw`flex-row justify-between items-center mb-3`}>
                    <View style={tw`flex-1 mr-3`}>
                        <Text style={[tw`text-sm font-bold`, { color: colors.textPrimary }]} numberOfLines={1}>
                            {ride?.route?.start?.name?.split(",")[0]} → {ride?.route?.end?.name?.split(",")[0]}
                        </Text>
                        <Text style={[tw`text-xs mt-0.5`, { color: colors.textSecondary }]}>
                            {boardedPassengers.length}/{confirmedPassengers.length} boarded · {droppedPassengers.length} dropped · {readyPassengers.length} ready
                        </Text>
                    </View>
                    <View style={[tw`px-3 py-1 rounded-full`, { backgroundColor: "#ecfdf5" }]}>
                        <Text style={[tw`text-xs font-bold`, { color: "#059669" }]}>LIVE</Text>
                    </View>
                </View>

                {/* Passenger list (driver view) */}
                {isDriver && confirmedPassengers.length > 0 && (
                    <View style={[tw`rounded-xl mb-3 p-3`, { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border }]}>
                        <Text style={[tw`text-[10px] font-bold mb-2`, { color: colors.textMuted }]}>PASSENGERS ({confirmedPassengers.length})</Text>
                        {confirmedPassengers.map((p, idx) => {
                            const statusColor = p.isDropped ? "#6b7280" : p.isBoarded ? "#059669" : p.isReady ? "#d97706" : colors.textMuted;
                            const statusBg = p.isDropped ? "#f3f4f6" : p.isBoarded ? "#ecfdf5" : p.isReady ? "#fffbeb" : colors.surface;
                            return (
                                <View key={p.userId} style={[tw`flex-row items-center justify-between py-2.5`, { borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: colors.border }]}>
                                    <View style={tw`flex-row items-center flex-1`}>
                                        {p.profileImage ? (
                                            <Image source={{ uri: p.profileImage }} style={[tw`w-9 h-9 rounded-full mr-2.5`, { borderWidth: 2, borderColor: statusColor }]} />
                                        ) : (
                                            <View style={[tw`w-9 h-9 rounded-full items-center justify-center mr-2.5`, { backgroundColor: statusBg, borderWidth: 2, borderColor: statusColor }]}>
                                                <Ionicons name="person" size={16} color={statusColor} />
                                            </View>
                                        )}
                                        <View style={tw`flex-1`}>
                                            <View style={tw`flex-row items-center gap-1.5`}>
                                                <Text style={[tw`text-xs font-bold`, { color: colors.textPrimary }]}>{p.name || "Rider"}</Text>
                                                {p.isGuest && (
                                                    <View style={[tw`px-1.5 py-0.5 rounded`, { backgroundColor: "#e0e7ff" }]}>
                                                        <Text style={[tw`text-[8px] font-bold`, { color: "#4338ca" }]}>GUEST</Text>
                                                    </View>
                                                )}
                                            </View>
                                            <Text style={[tw`text-[10px] mt-0.5`, { color: statusColor }]}>
                                                {p.isDropped ? "📍 Dropped off" : p.isBoarded ? "✓ On board" : p.isReady ? "🙋 Ready — tap to verify" : "⏳ Waiting..."}
                                            </Text>
                                            {p.isGuest && p.bookedBy && (() => {
                                                const booker = confirmedPassengers.find(b => b.userId === p.bookedBy && !b.isGuest);
                                                return booker ? (
                                                    <Text style={[tw`text-[9px]`, { color: colors.textMuted }]}>Booked by {booker.name?.split(" ")[0]}</Text>
                                                ) : null;
                                            })()}
                                        </View>
                                    </View>
                                    <View style={tw`flex-row items-center gap-2`}>
                                        {p.isReady && !p.isBoarded && (
                                            <TouchableOpacity onPress={() => { setSelectedPassenger(p); setShowOtpModal(true); }}
                                                style={[tw`px-2.5 py-1.5 rounded-lg`, { backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#fcd34d" }]}>
                                                <Text style={[tw`text-[10px] font-bold`, { color: "#d97706" }]}>Verify OTP</Text>
                                            </TouchableOpacity>
                                        )}
                                        {p.isBoarded && !p.isDropped && (
                                            <TouchableOpacity onPress={() => handleDriverDropPassenger(p)} disabled={droppingPassenger === p.userId}
                                                style={[tw`px-2.5 py-1.5 rounded-lg`, { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fca5a5" }]}>
                                                {droppingPassenger === p.userId ? <ActivityIndicator size={12} color="#dc2626" /> : <Text style={[tw`text-[10px] font-bold`, { color: "#dc2626" }]}>Drop Off</Text>}
                                            </TouchableOpacity>
                                        )}
                                        {p.isDropped && (
                                            <View style={[tw`px-2 py-1 rounded-lg`, { backgroundColor: "#f3f4f6" }]}>
                                                <Text style={[tw`text-[10px] font-bold`, { color: "#6b7280" }]}>Dropped ✓</Text>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                )}

                {/* Complete Ride button */}
                {isDriver && (
                    <TouchableOpacity
                        style={[tw`py-3.5 rounded-xl items-center`, { backgroundColor: "#059669" }, completingRide && tw`opacity-50`]}
                        onPress={() => handleCompleteRide(false)} disabled={completingRide}>
                        {completingRide ? <ActivityIndicator size="small" color="white" /> : (
                            <View style={tw`flex-row items-center gap-2`}>
                                <Ionicons name="checkmark-circle" size={20} color="white" />
                                <Text style={tw`text-white font-bold`}>Complete Ride</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                )}
            </ScrollView>

            {/* OTP Verification Modal */}
            <Modal visible={showOtpModal} transparent animationType="slide" onRequestClose={() => { setShowOtpModal(false); setOtpInput(""); }}>
                <View style={[tw`flex-1 justify-end`, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
                    <TouchableOpacity style={tw`flex-1`} activeOpacity={1} onPress={() => { setShowOtpModal(false); setOtpInput(""); }} />
                    <View style={[tw`rounded-t-3xl px-6 pt-5 pb-8`, { backgroundColor: colors.surface }]}>
                        <View style={[tw`w-10 h-1 rounded-full self-center mb-5`, { backgroundColor: colors.border }]} />
                        <Text style={[tw`text-lg font-bold text-center mb-1`, { color: colors.textPrimary }]}>Verify Boarding OTP</Text>
                        <Text style={[tw`text-sm text-center mb-6`, { color: colors.textSecondary }]}>
                            Ask {selectedPassenger?.name || "the rider"} for their 4-digit code
                        </Text>
                        <View style={tw`flex-row items-center justify-center mb-5`}>
                            {selectedPassenger?.profileImage ? (
                                <Image source={{ uri: selectedPassenger.profileImage }} style={tw`w-12 h-12 rounded-full mr-3`} />
                            ) : (
                                <View style={[tw`w-12 h-12 rounded-full items-center justify-center mr-3`, { backgroundColor: colors.primarySoft }]}>
                                    <Ionicons name="person" size={22} color={colors.primary} />
                                </View>
                            )}
                            <View>
                                <View style={tw`flex-row items-center gap-1.5`}>
                                    <Text style={[tw`text-base font-bold`, { color: colors.textPrimary }]}>{selectedPassenger?.name}</Text>
                                    {selectedPassenger?.isGuest && (
                                        <View style={[tw`px-1.5 py-0.5 rounded`, { backgroundColor: "#e0e7ff" }]}>
                                            <Text style={[tw`text-[9px] font-bold`, { color: "#4338ca" }]}>GUEST</Text>
                                        </View>
                                    )}
                                </View>
                                <Text style={[tw`text-xs`, { color: "#f59e0b" }]}>🙋 Ready for pickup</Text>
                                {selectedPassenger?.isGuest && selectedPassenger?.bookedBy && (() => {
                                    const booker = confirmedPassengers.find(b => b.userId === selectedPassenger.bookedBy && !b.isGuest);
                                    return booker ? (
                                        <Text style={[tw`text-[10px]`, { color: colors.textMuted }]}>Booked by {booker.name}</Text>
                                    ) : null;
                                })()}
                            </View>
                        </View>
                        <TextInput value={otpInput} onChangeText={setOtpInput} keyboardType="number-pad" maxLength={4} placeholder="Enter 4-digit OTP" placeholderTextColor={colors.textMuted}
                            style={[tw`text-center text-3xl font-bold py-4 rounded-2xl border-2 mb-5 tracking-widest`, {
                                color: colors.textPrimary, backgroundColor: colors.surfaceMuted,
                                borderColor: otpInput.length === 4 ? "#059669" : colors.border, letterSpacing: 16,
                            }]} />
                        <TouchableOpacity style={[tw`py-4 rounded-xl items-center`, { backgroundColor: "#059669" }, verifyingOtp && tw`opacity-50`]}
                            onPress={handleVerifyOtp} disabled={verifyingOtp || otpInput.length < 4}>
                            {verifyingOtp ? <ActivityIndicator size="small" color="white" /> : <Text style={tw`text-white font-bold text-base`}>Verify & Board</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
