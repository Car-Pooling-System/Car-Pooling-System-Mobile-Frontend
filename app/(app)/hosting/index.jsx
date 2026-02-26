import {
    View, Text, TouchableOpacity, Alert, ActivityIndicator,
    Image, Keyboard, Platform, StyleSheet,
} from "react-native";
import { useState, useRef, useEffect } from "react";
import { useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import polyline from "@mapbox/polyline";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import tw from "twrnc";
import { theme } from "../../../constants/Colors";

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const GRID_SIZE = 0.05;

const latLngToGrid = (lat, lng) =>
    `${Math.floor(lat / GRID_SIZE)}_${Math.floor(lng / GRID_SIZE)}`;

export default function CreateRide() {
    const { user } = useUser();
    const router = useRouter();
    const mapRef = useRef(null);
    const startRef = useRef(null);
    const endRef = useRef(null);

    const [startLocation, setStartLocation] = useState(null);
    const [endLocation, setEndLocation] = useState(null);
    const [routeData, setRouteData] = useState(null);
    const [routeCoordinates, setRouteCoordinates] = useState([]);
    const [currentLocation, setCurrentLocation] = useState(null);
    const [calculatingRoute, setCalculatingRoute] = useState(false);
    const [vehicles, setVehicles] = useState([]);

    // Track keyboard visibility to hide bottom hint card while typing
    const [keyboardVisible, setKeyboardVisible] = useState(false);

    // Track query text for per-field loading spinner
    const [startQuery, setStartQuery] = useState("");
    const [endQuery, setEndQuery] = useState("");

    /* ── Keyboard listeners ── */
    useEffect(() => {
        const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
        const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
        const show = Keyboard.addListener(showEvt, () => setKeyboardVisible(true));
        const hide = Keyboard.addListener(hideEvt, () => setKeyboardVisible(false));
        return () => { show.remove(); hide.remove(); };
    }, []);

    /* ── Autocomplete handler ── */
    const onPlaceSelected = (data, details, type) => {
        const location = {
            name: data.structured_formatting?.main_text || data.description,
            address: data.description,
            latitude: details.geometry.location.lat,
            longitude: details.geometry.location.lng,
        };
        if (type === "start") {
            setStartQuery("");
            setStartLocation(location);
        } else {
            setEndQuery("");
            setEndLocation(location);
        }
    };

    /* ── Route calculation ── */
    const fetchRoute = async () => {
        if (!startLocation || !endLocation) return;
        setCalculatingRoute(true);
        try {
            const resp = await fetch(
                `https://maps.googleapis.com/maps/api/directions/json` +
                `?origin=${startLocation.latitude},${startLocation.longitude}` +
                `&destination=${endLocation.latitude},${endLocation.longitude}` +
                `&key=${GOOGLE_API_KEY}`
            );
            const data = await resp.json();
            if (data.status !== "OK" || !data.routes.length) throw new Error("No route found");

            const route = data.routes[0];
            const leg = route.legs[0];
            const points = polyline.decode(route.overview_polyline.points);
            const coords = points.map(([lat, lng]) => ({ latitude: lat, longitude: lng }));
            const distanceKm = leg.distance.value / 1000;
            const durationMins = leg.duration.value / 60;
            const grids = [...new Set(points.map(([lat, lng]) => latLngToGrid(lat, lng)))];

            setRouteCoordinates(coords);
            setRouteData({
                encodedPolyline: route.overview_polyline.points,
                gridsCovered: grids,
                metrics: { totalDistanceKm: distanceKm, durationMinutes: durationMins },
                start: {
                    name: startLocation.name,
                    location: { type: "Point", coordinates: [startLocation.longitude, startLocation.latitude] },
                    grid: latLngToGrid(startLocation.latitude, startLocation.longitude),
                },
                end: {
                    name: endLocation.name,
                    location: { type: "Point", coordinates: [endLocation.longitude, endLocation.latitude] },
                    grid: latLngToGrid(endLocation.latitude, endLocation.longitude),
                },
            });

            setTimeout(() => {
                mapRef.current?.fitToCoordinates(coords, {
                    edgePadding: { top: 160, right: 50, bottom: 260, left: 50 },
                    animated: true,
                });
            }, 500);
        } catch {
            Alert.alert("Error", "Failed to calculate route. Please try again.");
            setRouteData(null);
        } finally {
            setCalculatingRoute(false);
        }
    };

    const handleClearRoute = () => {
        setRouteData(null);
        setRouteCoordinates([]);
        setStartLocation(null);
        setEndLocation(null);
        startRef.current?.clear();
        endRef.current?.clear();
    };

    useEffect(() => {
        if (startLocation && endLocation) fetchRoute();
    }, [startLocation, endLocation]);

    /* ── Vehicles ── */
    useEffect(() => {
        const loadVehicles = async () => {
            if (!user?.id) return;
            try {
                const res = await fetch(`${BACKEND_URL}/api/driver-profile/${user.id}`);
                if (res.ok) {
                    const data = await res.json();
                    const verified = (data.vehicles || []).filter(v => v.insuranceVerified);
                    setVehicles(verified);
                }
            } catch (e) { console.error("Failed to load vehicles:", e); }
        };
        loadVehicles();
    }, [user?.id]);

    /* ── Current location ── */
    useEffect(() => {
        (async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") return;
            const loc = await Location.getCurrentPositionAsync({});
            setCurrentLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        })();
    }, []);

    /* ── Duration formatter ── */
    const formatDuration = (mins) => {
        const total = Math.round(mins);
        const d = Math.floor(total / 1440);
        const h = Math.floor((total % 1440) / 60);
        const m = total % 60;
        const parts = [];
        if (d > 0) parts.push(`${d}d`);
        if (h > 0) parts.push(`${h}h`);
        if (m > 0 || parts.length === 0) parts.push(`${m}m`);
        return parts.join(" ");
    };

    /* ── Navigate to ride-details ── */
    const handleContinue = () => {
        if (!routeData) return;
        if (vehicles.length === 0) {
            Alert.alert(
                "No Verified Vehicle",
                "You need at least one vehicle with verified insurance to create a ride.",
                [
                    { text: "Cancel", style: "cancel" },
                    { text: "Manage Vehicles", onPress: () => router.push("/profile/vehicles") },
                ]
            );
            return;
        }
        router.push({
            pathname: "/hosting/ride-details",
            params: {
                routeData: JSON.stringify(routeData),
                vehicles: JSON.stringify(vehicles),
            },
        });
    };

    /* ── Autocomplete input styles ── */
    const acStyles = {
        container: { flex: 0 },
        textInputContainer: {
            backgroundColor: "transparent",
        },
        textInput: {
            height: 42,
            borderRadius: 10,
            paddingHorizontal: 12,
            fontSize: 14,
            backgroundColor: "#F3F4F6",
            color: "#111827",
            margin: 0,
        },
        listView: {
            position: "absolute",
            top: 46,
            left: 0,
            right: 0,
            backgroundColor: "white",
            borderRadius: 12,
            shadowColor: "#000",
            shadowOpacity: 0.12,
            shadowRadius: 8,
            elevation: 12,
            zIndex: 9999,
        },
        row: {
            paddingHorizontal: 14,
            paddingVertical: 12,
        },
        description: {
            fontSize: 13,
            color: "#374151",
        },
        separator: {
            height: 1,
            backgroundColor: "#F3F4F6",
        },
    };

    return (
        <View style={StyleSheet.absoluteFill}>
            {/* ═══════════════ FULLSCREEN MAP ═══════════════ */}
            <MapView
                ref={mapRef}
                provider={PROVIDER_GOOGLE}
                style={StyleSheet.absoluteFill}
                onPress={() => Keyboard.dismiss()}
                initialRegion={{
                    latitude: currentLocation?.latitude ?? 20.5937,
                    longitude: currentLocation?.longitude ?? 78.9629,
                    latitudeDelta: 8,
                    longitudeDelta: 8,
                }}
            >
                {routeCoordinates.length > 0 && (
                    <Polyline
                        coordinates={routeCoordinates}
                        strokeColor={theme.light.primary}
                        strokeWidth={4}
                    />
                )}
                {startLocation && (
                    <Marker coordinate={startLocation} title="Start" pinColor="green" />
                )}
                {endLocation && (
                    <Marker coordinate={endLocation} title="End" pinColor="red" />
                )}
                {currentLocation && !routeCoordinates.length && (
                    <Marker coordinate={currentLocation}>
                        <View style={styles.userMarker}>
                            <Image source={{ uri: user?.imageUrl }} style={styles.userAvatar} />
                        </View>
                    </Marker>
                )}
            </MapView>

            {/* ═══════════════ ROUTE CALCULATING OVERLAY ═══════════════ */}
            {calculatingRoute && (
                <View style={styles.calcOverlay}>
                    <View style={styles.calcCard}>
                        <ActivityIndicator size="large" color={theme.light.primary} />
                        <Text style={styles.calcText}>Calculating route…</Text>
                    </View>
                </View>
            )}

            {/* ═══════════════ TOP SEARCH CARD ═══════════════ */}
            <View style={styles.topContainer} pointerEvents="box-none">
                <View style={tw`flex-row items-start gap-2`} pointerEvents="box-none">
                    {/* Back button */}
                    <TouchableOpacity
                        onPress={() => router.back()}
                        style={styles.backBtn}
                    >
                        <Ionicons name="arrow-back" size={22} color="#111827" />
                    </TouchableOpacity>

                    {/* Search card (hidden once route is set & keyboard not visible) */}
                    {!routeData && (
                        <View style={styles.searchCard}>
                            <View style={tw`flex-row`}>
                                {/* Route line dots */}
                                <View style={styles.routeDots}>
                                    <View style={styles.dotGreen} />
                                    <View style={styles.dotLine} />
                                    <View style={styles.dotRed} />
                                </View>

                                <View style={{ flex: 1, gap: 4 }}>
                                    {/* ── Start autocomplete ── */}
                                    <View style={{ zIndex: 200 }}>
                                        <GooglePlacesAutocomplete
                                            ref={startRef}
                                            placeholder="Starting Point"
                                            fetchDetails={true}
                                            onPress={(data, details = null) =>
                                                onPlaceSelected(data, details, "start")
                                            }
                                            query={{ key: GOOGLE_API_KEY, language: "en" }}
                                            enablePoweredByContainer={false}
                                            debounce={300}
                                            minLength={2}
                                            styles={acStyles}
                                            textInputProps={{
                                                placeholderTextColor: "#9ca3af",
                                                onChangeText: setStartQuery,
                                                returnKeyType: "search",
                                            }}
                                            renderRightButton={() =>
                                                startQuery.length > 1 && !startLocation ? (
                                                    <View style={styles.inputSpinner}>
                                                        <ActivityIndicator
                                                            size="small"
                                                            color={theme.light.primary}
                                                        />
                                                    </View>
                                                ) : startLocation ? (
                                                    <View style={styles.inputSpinner}>
                                                        <Ionicons
                                                            name="checkmark-circle"
                                                            size={18}
                                                            color={theme.light.primary}
                                                        />
                                                    </View>
                                                ) : null
                                            }
                                        />
                                    </View>

                                    {/* Thin separator */}
                                    <View style={styles.fieldSep} />

                                    {/* ── End autocomplete ── */}
                                    <View style={{ zIndex: 100 }}>
                                        <GooglePlacesAutocomplete
                                            ref={endRef}
                                            placeholder="Destination"
                                            fetchDetails={true}
                                            onPress={(data, details = null) =>
                                                onPlaceSelected(data, details, "end")
                                            }
                                            query={{ key: GOOGLE_API_KEY, language: "en" }}
                                            enablePoweredByContainer={false}
                                            debounce={300}
                                            minLength={2}
                                            styles={acStyles}
                                            textInputProps={{
                                                placeholderTextColor: "#9ca3af",
                                                onChangeText: setEndQuery,
                                                returnKeyType: "search",
                                            }}
                                            renderRightButton={() =>
                                                endQuery.length > 1 && !endLocation ? (
                                                    <View style={styles.inputSpinner}>
                                                        <ActivityIndicator
                                                            size="small"
                                                            color={theme.light.primary}
                                                        />
                                                    </View>
                                                ) : endLocation ? (
                                                    <View style={styles.inputSpinner}>
                                                        <Ionicons
                                                            name="checkmark-circle"
                                                            size={18}
                                                            color={theme.light.primary}
                                                        />
                                                    </View>
                                                ) : null
                                            }
                                        />
                                    </View>
                                </View>
                            </View>
                        </View>
                    )}

                    {/* Compact route pill (shown after route is set) */}
                    {routeData && (
                        <View style={styles.routePill}>
                            <View style={styles.routeDots}>
                                <View style={[styles.dotGreen, { width: 8, height: 8 }]} />
                                <View style={[styles.dotLine, { height: 16 }]} />
                                <View style={[styles.dotRed, { width: 8, height: 8, borderRadius: 2 }]} />
                            </View>
                            <View style={{ flex: 1, marginLeft: 8 }}>
                                <Text style={styles.routeName} numberOfLines={1}>
                                    {routeData.start.name}
                                </Text>
                                <Text style={styles.routeName} numberOfLines={1}>
                                    {routeData.end.name}
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={handleClearRoute}
                                style={styles.clearBtn}
                            >
                                <Ionicons name="close" size={16} color="#6b7280" />
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </View>

            {/* ═══════════════ BOTTOM CARD (hidden when keyboard visible) ═══════════════ */}
            {!keyboardVisible && (
                <View style={styles.bottomCard}>
                    {!routeData ? (
                        /* Hint when no route yet */
                        <View style={tw`flex-row items-center gap-3`}>
                            <View style={[styles.hintIcon, { backgroundColor: theme.light.primarySoft }]}>
                                <Ionicons name="navigate" size={22} color={theme.light.primary} />
                            </View>
                            <View>
                                <Text style={styles.hintTitle}>Plan your route</Text>
                                <Text style={styles.hintSub}>
                                    Search starting point &amp; destination above
                                </Text>
                            </View>
                        </View>
                    ) : (
                        /* Route summary + Continue */
                        <>
                            <View style={tw`h-1 w-12 bg-gray-200 rounded-full self-center mb-4`} />

                            {/* Distance / Duration chips */}
                            <View style={tw`flex-row gap-3 mb-4`}>
                                <View style={[styles.chip, { backgroundColor: theme.light.primarySoft }]}>
                                    <Ionicons name="navigate-outline" size={16} color={theme.light.primary} />
                                    <Text style={[styles.chipText, { color: theme.light.primary }]}>
                                        {routeData.metrics.totalDistanceKm.toFixed(1)} km
                                    </Text>
                                </View>
                                <View style={[styles.chip, { backgroundColor: theme.light.primarySoft }]}>
                                    <Ionicons name="time-outline" size={16} color={theme.light.primary} />
                                    <Text style={[styles.chipText, { color: theme.light.primary }]}>
                                        {formatDuration(routeData.metrics.durationMinutes)}
                                    </Text>
                                </View>
                            </View>

                            {/* Continue */}
                            <TouchableOpacity
                                onPress={handleContinue}
                                style={[styles.continueBtn, { backgroundColor: theme.light.primary }]}
                            >
                                <Text style={styles.continueTxt}>Continue →</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    /* Top overlay */
    topContainer: {
        position: "absolute",
        top: Platform.OS === "android" ? 36 : 54,
        left: 12,
        right: 12,
        zIndex: 100,
    },
    backBtn: {
        backgroundColor: "white",
        padding: 10,
        borderRadius: 50,
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 6,
        marginTop: 3,
    },
    searchCard: {
        flex: 1,
        backgroundColor: "white",
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 10,
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 10,
    },
    routePill: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "white",
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 12,
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 10,
    },
    routeName: {
        fontSize: 13,
        fontWeight: "600",
        color: "#111827",
        marginVertical: 1,
    },
    clearBtn: {
        backgroundColor: "#F3F4F6",
        borderRadius: 50,
        padding: 6,
        marginLeft: 8,
    },
    /* Route dots */
    routeDots: {
        width: 20,
        alignItems: "center",
        paddingTop: 11,
        marginRight: 8,
    },
    dotGreen: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: "#22c55e",
    },
    dotLine: {
        width: 2,
        flex: 1,
        backgroundColor: "#d1d5db",
        marginVertical: 3,
    },
    dotRed: {
        width: 10,
        height: 10,
        borderRadius: 2,
        backgroundColor: "#ef4444",
    },
    /* Input helpers */
    inputSpinner: {
        position: "absolute",
        right: 10,
        top: 0,
        bottom: 0,
        justifyContent: "center",
    },
    fieldSep: {
        height: 1,
        backgroundColor: "#F3F4F6",
        marginLeft: 4,
        marginVertical: 2,
    },
    /* Bottom card */
    bottomCard: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "white",
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: Platform.OS === "android" ? 28 : 36,
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 12,
        elevation: 16,
    },
    hintIcon: {
        width: 48,
        height: 48,
        borderRadius: 50,
        alignItems: "center",
        justifyContent: "center",
    },
    hintTitle: {
        fontSize: 16,
        fontWeight: "700",
        color: "#111827",
    },
    hintSub: {
        fontSize: 13,
        color: "#9ca3af",
        marginTop: 2,
    },
    /* Route summary */
    chip: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 10,
        borderRadius: 12,
        gap: 6,
    },
    chipText: {
        fontWeight: "700",
        fontSize: 14,
    },
    continueBtn: {
        paddingVertical: 16,
        borderRadius: 14,
        alignItems: "center",
    },
    continueTxt: {
        color: "white",
        fontWeight: "700",
        fontSize: 16,
    },
    /* Calc overlay */
    calcOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(255,255,255,0.45)",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 50,
    },
    calcCard: {
        backgroundColor: "white",
        borderRadius: 20,
        padding: 24,
        alignItems: "center",
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 12,
        elevation: 12,
        gap: 12,
    },
    calcText: {
        fontSize: 14,
        fontWeight: "600",
        color: "#374151",
    },
    /* Map markers */
    userMarker: {
        backgroundColor: "white",
        padding: 3,
        borderRadius: 50,
        shadowColor: "#000",
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 4,
        borderWidth: 1,
        borderColor: "#e5e7eb",
    },
    userAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
    },
});
