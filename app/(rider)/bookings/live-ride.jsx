import { View, Text, TouchableOpacity, Image, Alert, StyleSheet, useColorScheme, ActivityIndicator, Modal, TextInput, ScrollView } from "react-native";
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useUser } from "@clerk/clerk-expo";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import tw from "twrnc";
import { theme } from "../../../constants/Colors";
import { useSocket } from "../../../context/SocketContext";
import { decodePolyline } from "../../../utils/polyline";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function RiderLiveRide() {
    const { rideId, role, otp: initialOtp } = useLocalSearchParams();
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
    const [allOtps, setAllOtps] = useState([]);
    const [markingReady, setMarkingReady] = useState(false);

    // SOS state
    const [showSosModal, setShowSosModal] = useState(false);
    const [sosCodeInput, setSosCodeInput] = useState("");
    const [sosCountdown, setSosCountdown] = useState(0);
    const [sosTriggering, setSosTriggering] = useState(false);
    const sosTimerRef = useRef(null);

    // Washroom / drop-off state
    const [requestingBreak, setRequestingBreak] = useState(false);
    const [droppingPassenger, setDroppingPassenger] = useState(null);

    /* ── Fetch ride data ── */
    const fetchLiveData = useCallback(async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/rides/${rideId}/live`);
            const data = await res.json();
            if (res.ok) {
                setRide(data.ride);
                const myP = data.ride?.passengers?.filter(
                    (p) => (p.userId === user?.id || p.bookedBy === user?.id) && p.status === "confirmed"
                ) || [];
                const existing = myP.filter(p => p.boardingOtp).map(p => ({
                    passengerId: p.userId, name: p.name, isGuest: p.isGuest || false, otp: p.boardingOtp,
                }));
                if (existing.length > 0 && allOtps.length === 0) setAllOtps(existing);
            }
        } catch (err) {
            console.error("[RiderLiveRide] fetch error:", err);
        } finally {
            setLoading(false);
        }
    }, [rideId, user?.id]);

    useEffect(() => {
        fetchLiveData();
        const interval = setInterval(fetchLiveData, 10000);
        return () => clearInterval(interval);
    }, [fetchLiveData]);

    // All my passengers (self + guests I booked)
    const myPassengers = ride?.passengers?.filter(
        (p) => (p.userId === user?.id || p.bookedBy === user?.id) && p.status === "confirmed"
    ) || [];
    const mySelf = myPassengers.find(p => p.userId === user?.id);
    const myGuests = myPassengers.filter(p => p.isGuest);
    const allReady = myPassengers.length > 0 && myPassengers.every(p => p.isReady);
    const allBoarded = myPassengers.length > 0 && myPassengers.every(p => p.isBoarded);
    const anyDropped = myPassengers.some(p => p.isDropped);
    const allDropped = myPassengers.length > 0 && myPassengers.every(p => p.isDropped);

    /* ── Socket events ── */
    useEffect(() => {
        if (!socket || !rideId) return;
        socket.emit("join-ride", rideId);

        socket.on("location-updated", (data) => {
            setLocations((prev) => ({ ...prev, [data.userId]: { lat: data.lat, lng: data.lng, role: data.role, name: data.name, profileImage: data.profileImage } }));
        });

        socket.on("rider-boarded", (data) => {
            const isOurs = data.passengerUserId === user?.id || myGuests.some(g => g.userId === data.passengerUserId);
            if (isOurs) {
                Alert.alert("✅ Boarded!", `${data.passengerName || "Passenger"} has been verified.`);
                fetchLiveData();
            }
        });

        socket.on("passenger-dropped-notification", (data) => {
            if (data.passengerUserId === user?.id) Alert.alert("📍 Dropped Off", "You have been dropped off.");
            fetchLiveData();
        });

        socket.on("ride-completed-notification", () => {
            Alert.alert("🏁 Ride Complete", "The ride has been completed!", [{ text: "OK", onPress: () => router.back() }]);
        });

        socket.on("washroom-break-notification", (data) => {
            if (data.userId !== user?.id) Alert.alert("🚻 Washroom Break", `${data.riderName} requested a washroom break.`);
        });

        return () => {
            socket.emit("leave-ride", rideId);
            socket.off("location-updated");
            socket.off("rider-boarded");
            socket.off("passenger-dropped-notification");
            socket.off("ride-completed-notification");
            socket.off("washroom-break-notification");
        };
    }, [socket, rideId, user?.id]);

    /* ── Track my location + broadcast ── */
    useEffect(() => {
        let sub;
        (async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") return;
            sub = await Location.watchPositionAsync(
                { accuracy: Location.Accuracy.High, distanceInterval: 20, timeInterval: 5000 },
                (loc) => {
                    const { latitude, longitude } = loc.coords;
                    setMyLocation({ lat: latitude, lng: longitude });
                    if (socket && rideId) {
                        socket.emit("location-update", { rideId, lat: latitude, lng: longitude, role: "rider", name: user?.fullName || "Rider", profileImage: user?.imageUrl || "" });
                    }
                    fetch(`${BACKEND_URL}/api/rides/${rideId}/update-location`, {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ userId: user?.id, lat: latitude, lng: longitude }),
                    }).catch(() => {});
                }
            );
            locationSubRef.current = sub;
        })();
        return () => { if (locationSubRef.current) locationSubRef.current.remove(); };
    }, [socket, rideId, user]);

    /* ── Mark ready (self + guests) ── */
    const handleReadyForPickup = async () => {
        setMarkingReady(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            let lat, lng;
            if (status === "granted") { const loc = await Location.getCurrentPositionAsync({}); lat = loc.coords.latitude; lng = loc.coords.longitude; }
            const res = await fetch(`${BACKEND_URL}/api/rides/${rideId}/rider-ready`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.id, lat, lng }),
            });
            const data = await res.json();
            if (res.ok) {
                setAllOtps(data.otps || []);
                socket?.emit("rider-ready", { rideId, riderName: user?.fullName || "Rider", riderImage: user?.imageUrl || "" });
                fetchLiveData();
            } else { Alert.alert("Error", data.message || "Failed to mark ready"); }
        } catch (err) { Alert.alert("Error", "Failed to mark as ready"); }
        finally { setMarkingReady(false); }
    };

    /* ── Washroom break ── */
    const handleWashroomBreak = async () => {
        setRequestingBreak(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/rides/${rideId}/washroom-break`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.id, riderName: user?.fullName || "Rider" }),
            });
            if (res.ok) {
                socket?.emit("washroom-break", { rideId, riderName: user?.fullName || "Rider" });
                Alert.alert("🚻 Request Sent", "The driver and other riders have been notified.");
            }
        } catch (err) { Alert.alert("Error", "Failed to request washroom break"); }
        finally { setRequestingBreak(false); }
    };

    /* ── Drop-off ── */
    const handleDropOff = async (passenger) => {
        const ok = await new Promise(resolve => {
            Alert.alert("📍 Drop Off", `Drop off ${passenger.isGuest ? passenger.name + " (Guest)" : "yourself"} here?`, [
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
            } else { Alert.alert("Error", data.message || "Failed to drop off"); }
        } catch (err) { Alert.alert("Error", "Failed to process drop-off"); }
        finally { setDroppingPassenger(null); }
    };

    /* ── SOS ── */
    const handleSosPress = () => {
        setShowSosModal(true); setSosCountdown(15); setSosCodeInput("");
        sosTimerRef.current = setInterval(() => {
            setSosCountdown(prev => { if (prev <= 1) { clearInterval(sosTimerRef.current); triggerSOS(""); return 0; } return prev - 1; });
        }, 1000);
    };

    const handleSosCancel = () => {
        clearInterval(sosTimerRef.current);
        if (!sosCodeInput) { setShowSosModal(false); return; }
        triggerSOS(sosCodeInput);
    };

    const triggerSOS = async (enteredCode) => {
        setSosTriggering(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/rider/emergency/${user.id}/sos`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enteredCode, riderName: user?.fullName || "Rider", rideId, currentLocation: myLocation }),
            });
            const data = await res.json();
            if (data.safe) { Alert.alert("✅ SOS Cancelled", "You're safe!"); }
            else { socket?.emit("sos-alert", { rideId, riderName: user?.fullName || "Rider" }); Alert.alert("🚨 SOS Sent", data.message || "Emergency contacts notified."); }
        } catch (err) { Alert.alert("Error", "Failed to process SOS"); }
        finally { setSosTriggering(false); setShowSosModal(false); }
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
        const dLoc = ride?.driver?.liveLocation;
        const dSock = locations[ride?.driver?.userId];
        const dLat = dSock?.lat || dLoc?.lat, dLng = dSock?.lng || dLoc?.lng;
        if (dLat && dLng) markers.push({ id: "driver", lat: dLat, lng: dLng, name: ride.driver.name || "Driver", profileImage: ride.driver.profileImage, role: "driver" });
        for (const p of (ride?.passengers?.filter(p => p.status === "confirmed") || [])) {
            const s = locations[p.userId];
            const lat = s?.lat || p.liveLocation?.lat, lng = s?.lng || p.liveLocation?.lng;
            if (lat && lng) markers.push({ id: p.userId, lat, lng, name: p.name || "Rider", profileImage: p.profileImage, role: "rider", isMe: p.userId === user?.id, isGuest: p.isGuest, isMine: p.bookedBy === user?.id, isReady: p.isReady, isBoarded: p.isBoarded, isDropped: p.isDropped });
        }
        return markers;
    };

    const fitMapToMarkers = () => {
        const m = getMarkers();
        if (m.length > 0 && mapRef.current) {
            const coords = m.map(x => ({ latitude: x.lat, longitude: x.lng }));
            if (myLocation) coords.push({ latitude: myLocation.lat, longitude: myLocation.lng });
            mapRef.current.fitToCoordinates(coords, { edgePadding: { top: 80, right: 80, bottom: 200, left: 80 }, animated: true });
        }
    };

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
                <View style={tw`flex-row items-center gap-2`}>
                    <TouchableOpacity onPress={handleSosPress} style={[tw`w-9 h-9 rounded-full items-center justify-center`, { backgroundColor: "#fef2f2" }]}>
                        <Text style={tw`text-base font-black`}>🚨</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={fitMapToMarkers} style={[tw`w-9 h-9 rounded-full items-center justify-center`, { backgroundColor: colors.primarySoft }]}>
                        <Ionicons name="locate" size={20} color={colors.primary} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Map */}
            <View style={tw`flex-1`}>
                <MapView ref={mapRef} provider={PROVIDER_GOOGLE} style={StyleSheet.absoluteFillObject} initialRegion={getMapRegion()} showsUserLocation={false}>
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
                        const mc = m.role === "driver" ? "#059669" : m.isDropped ? "#6b7280" : m.isMe ? "#7c3aed" : m.isBoarded ? "#10b981" : m.isReady ? "#f59e0b" : colors.primary;
                        return (
                            <Marker key={m.id} coordinate={{ latitude: m.lat, longitude: m.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                                <View style={[tw`items-center`, { width: 90 }]}>
                                    <View style={[tw`px-2 py-0.5 rounded-full mb-1`, { backgroundColor: mc }]}>
                                        <Text style={tw`text-white text-[9px] font-bold`} numberOfLines={1}>
                                            {m.role === "driver" ? "🚗 " : m.isMe ? "📍 " : m.isGuest ? "👤 " : ""}
                                            {m.isMe ? "You" : m.name?.split(" ")[0]}
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
                            Driver: {ride?.driver?.name || "Driver"}{myGuests.length > 0 ? ` · You + ${myGuests.length} guest(s)` : ""}
                        </Text>
                    </View>
                    <View style={[tw`px-3 py-1 rounded-full`, { backgroundColor: "#ecfdf5" }]}>
                        <Text style={[tw`text-xs font-bold`, { color: "#059669" }]}>LIVE</Text>
                    </View>
                </View>

                {/* YOUR GROUP (self + guests) */}
                {myPassengers.length > 1 && (
                    <View style={[tw`rounded-xl mb-3 p-3`, { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border }]}>
                        <Text style={[tw`text-[10px] font-bold mb-2`, { color: colors.textMuted }]}>YOUR GROUP ({myPassengers.length} passengers)</Text>
                        {myPassengers.map((p) => {
                            const pOtp = allOtps.find(o => o.passengerId === p.userId);
                            return (
                                <View key={p.userId} style={[tw`flex-row items-center justify-between py-2`, { borderTopWidth: p.userId !== myPassengers[0]?.userId ? 1 : 0, borderTopColor: colors.border }]}>
                                    <View style={tw`flex-row items-center flex-1`}>
                                        <View style={[tw`w-7 h-7 rounded-full items-center justify-center mr-2`, { backgroundColor: p.isDropped ? "#f3f4f6" : p.isBoarded ? "#ecfdf5" : p.isReady ? "#fffbeb" : colors.primarySoft }]}>
                                            <Ionicons name={p.userId === user?.id ? "person" : "people"} size={14} color={p.isDropped ? "#6b7280" : p.isBoarded ? "#059669" : p.isReady ? "#d97706" : colors.primary} />
                                        </View>
                                        <View style={tw`flex-1`}>
                                            <Text style={[tw`text-xs font-bold`, { color: colors.textPrimary }]}>{p.userId === user?.id ? "You" : p.name || "Guest"}{p.isGuest ? " (Guest)" : ""}</Text>
                                            <Text style={[tw`text-[10px]`, { color: p.isDropped ? "#6b7280" : p.isBoarded ? "#059669" : p.isReady ? "#d97706" : colors.textMuted }]}>
                                                {p.isDropped ? "📍 Dropped off" : p.isBoarded ? "✓ Boarded" : p.isReady ? "🙋 Ready" : "Waiting..."}
                                            </Text>
                                        </View>
                                    </View>
                                    {p.isReady && !p.isBoarded && (pOtp?.otp || p.boardingOtp) && (
                                        <View style={[tw`px-2 py-1 rounded-lg mr-2`, { backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#fcd34d" }]}>
                                            <Text style={[tw`text-xs font-black`, { color: "#d97706", letterSpacing: 3 }]}>{pOtp?.otp || p.boardingOtp}</Text>
                                        </View>
                                    )}
                                    {p.isBoarded && !p.isDropped && (
                                        <TouchableOpacity onPress={() => handleDropOff(p)} disabled={droppingPassenger === p.userId}
                                            style={[tw`px-2 py-1 rounded-lg`, { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fca5a5" }]}>
                                            {droppingPassenger === p.userId ? <ActivityIndicator size={12} color="#dc2626" /> : <Text style={[tw`text-[10px] font-bold`, { color: "#dc2626" }]}>Drop Here</Text>}
                                        </TouchableOpacity>
                                    )}
                                </View>
                            );
                        })}
                    </View>
                )}

                {/* OTP Display (single passenger) */}
                {myPassengers.length === 1 && mySelf?.isReady && !mySelf?.isBoarded && (allOtps.length > 0 || mySelf?.boardingOtp) && (
                    <View style={[tw`rounded-2xl p-4 mb-3 items-center`, { backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#fcd34d" }]}>
                        <Text style={[tw`text-xs font-bold mb-1`, { color: "#92400e" }]}>YOUR BOARDING OTP</Text>
                        <Text style={[tw`text-4xl font-black tracking-widest`, { color: "#d97706", letterSpacing: 12 }]}>{allOtps[0]?.otp || mySelf?.boardingOtp}</Text>
                        <Text style={[tw`text-xs mt-2`, { color: "#92400e" }]}>Show this code to the driver when boarding</Text>
                    </View>
                )}

                {allBoarded && !anyDropped && (
                    <View style={[tw`rounded-2xl p-4 mb-3 items-center flex-row justify-center gap-2`, { backgroundColor: "#ecfdf5", borderWidth: 1, borderColor: "#a7f3d0" }]}>
                        <Ionicons name="checkmark-circle" size={22} color="#059669" />
                        <Text style={[tw`text-sm font-bold`, { color: "#059669" }]}>{myPassengers.length > 1 ? "Everyone's on board! 🚗" : "You're on board! Enjoy the ride 🚗"}</Text>
                    </View>
                )}

                {allDropped && (
                    <View style={[tw`rounded-2xl p-4 mb-3 items-center flex-row justify-center gap-2`, { backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#d1d5db" }]}>
                        <Ionicons name="flag" size={22} color="#6b7280" />
                        <Text style={[tw`text-sm font-bold`, { color: "#6b7280" }]}>All passengers dropped off!</Text>
                    </View>
                )}

                {!allReady && !allBoarded && (
                    <TouchableOpacity style={[tw`py-3.5 rounded-xl items-center mb-3`, { backgroundColor: "#059669" }, markingReady && tw`opacity-50`]} onPress={handleReadyForPickup} disabled={markingReady}>
                        {markingReady ? <ActivityIndicator size="small" color="white" /> : (
                            <View style={tw`flex-row items-center gap-2`}>
                                <Ionicons name="hand-left" size={20} color="white" />
                                <Text style={tw`text-white font-bold`}>{myGuests.length > 0 ? `Ready for Pickup (You + ${myGuests.length} guest${myGuests.length > 1 ? "s" : ""})` : "I'm Ready for Pickup"}</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                )}

                {allReady && !allBoarded && (
                    <View style={[tw`py-3 rounded-xl items-center flex-row justify-center gap-2 mb-3`, { backgroundColor: "#fffbeb" }]}>
                        <ActivityIndicator size="small" color="#d97706" />
                        <Text style={[tw`font-bold text-sm`, { color: "#92400e" }]}>Waiting for driver to verify OTP(s)...</Text>
                    </View>
                )}

                {allBoarded && !allDropped && (
                    <View style={tw`flex-row gap-3 mb-3`}>
                        <TouchableOpacity onPress={handleWashroomBreak} disabled={requestingBreak}
                            style={[tw`flex-1 py-3 rounded-xl items-center flex-row justify-center gap-2`, { backgroundColor: "#f0f9ff", borderWidth: 1, borderColor: "#bae6fd" }]}>
                            <Text style={tw`text-base`}>🚻</Text>
                            <Text style={[tw`text-xs font-bold`, { color: "#0369a1" }]}>{requestingBreak ? "Sending..." : "Washroom Break"}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleSosPress}
                            style={[tw`flex-1 py-3 rounded-xl items-center flex-row justify-center gap-2`, { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fca5a5" }]}>
                            <Text style={tw`text-base`}>🚨</Text>
                            <Text style={[tw`text-xs font-bold`, { color: "#dc2626" }]}>SOS Emergency</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {myPassengers.length === 1 && mySelf?.isBoarded && !mySelf?.isDropped && (
                    <TouchableOpacity onPress={() => handleDropOff(mySelf)} disabled={droppingPassenger === mySelf?.userId}
                        style={[tw`py-3 rounded-xl items-center flex-row justify-center gap-2`, { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fca5a5" }]}>
                        {droppingPassenger === mySelf?.userId ? <ActivityIndicator size="small" color="#dc2626" /> : (
                            <><Ionicons name="location" size={18} color="#dc2626" /><Text style={[tw`font-bold text-sm`, { color: "#dc2626" }]}>Drop Off Here</Text></>
                        )}
                    </TouchableOpacity>
                )}
            </ScrollView>

            {/* SOS Modal */}
            <Modal visible={showSosModal} transparent animationType="fade" onRequestClose={() => { clearInterval(sosTimerRef.current); setShowSosModal(false); }}>
                <View style={[tw`flex-1 justify-center items-center px-6`, { backgroundColor: "rgba(0,0,0,0.7)" }]}>
                    <View style={[tw`w-full rounded-3xl p-6`, { backgroundColor: colors.surface }]}>
                        <View style={tw`items-center mb-5`}>
                            <View style={[tw`w-16 h-16 rounded-full items-center justify-center mb-3`, { backgroundColor: "#fef2f2" }]}><Text style={tw`text-3xl`}>🚨</Text></View>
                            <Text style={[tw`text-xl font-black`, { color: "#dc2626" }]}>SOS ALERT</Text>
                            <Text style={[tw`text-sm mt-1 text-center`, { color: colors.textSecondary }]}>Enter your secret code to cancel, or wait for the timer.</Text>
                        </View>
                        <View style={tw`items-center mb-4`}>
                            <View style={[tw`w-20 h-20 rounded-full items-center justify-center`, { backgroundColor: sosCountdown <= 5 ? "#fef2f2" : "#fffbeb", borderWidth: 3, borderColor: sosCountdown <= 5 ? "#dc2626" : "#f59e0b" }]}>
                                <Text style={[tw`text-3xl font-black`, { color: sosCountdown <= 5 ? "#dc2626" : "#d97706" }]}>{sosCountdown}</Text>
                            </View>
                            <Text style={[tw`text-xs mt-2`, { color: colors.textMuted }]}>seconds remaining</Text>
                        </View>
                        <TextInput value={sosCodeInput} onChangeText={setSosCodeInput} secureTextEntry placeholder="Enter secret code to cancel" placeholderTextColor={colors.textMuted} autoFocus
                            style={[tw`text-center text-lg font-bold py-3 rounded-xl border mb-4`, { color: colors.textPrimary, backgroundColor: colors.surfaceMuted, borderColor: colors.border }]} />
                        <View style={tw`flex-row gap-3`}>
                            <TouchableOpacity onPress={() => { clearInterval(sosTimerRef.current); setShowSosModal(false); }} style={[tw`flex-1 py-3.5 rounded-xl items-center`, { backgroundColor: "#f3f4f6" }]}>
                                <Text style={[tw`font-bold`, { color: colors.textPrimary }]}>Dismiss</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleSosCancel} disabled={sosTriggering} style={[tw`flex-1 py-3.5 rounded-xl items-center`, { backgroundColor: "#059669" }]}>
                                {sosTriggering ? <ActivityIndicator size="small" color="white" /> : <Text style={tw`text-white font-bold`}>I'm Safe ✓</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
