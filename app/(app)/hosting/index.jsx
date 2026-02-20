import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert, Switch, ActivityIndicator, KeyboardAvoidingView, Platform, Dimensions, Image, Keyboard } from "react-native";
import { useState, useRef, useEffect } from "react";
import { useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import DateTimePicker from "@react-native-community/datetimepicker";
import polyline from "@mapbox/polyline";
import * as Location from "expo-location";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import tw from "twrnc";
import { theme } from "../../../constants/Colors";

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const GRID_SIZE = 0.05; // ~5km

const latLngToGrid = (lat, lng) => `${Math.floor(lat / GRID_SIZE)}_${Math.floor(lng / GRID_SIZE)}`;

export default function CreateRide() {
    const { user } = useUser();
    const router = useRouter();
    const mapRef = useRef(null);

    // State
    const [startLocation, setStartLocation] = useState(null);
    const [endLocation, setEndLocation] = useState(null);
    const [routeData, setRouteData] = useState(null);
    const [routeCoordinates, setRouteCoordinates] = useState([]);
    const [currentLocation, setCurrentLocation] = useState(null);

    const [date, setDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);

    // Pricing
    const [extraFare, setExtraFare] = useState("");
    const [recommendedFare, setRecommendedFare] = useState(0);

    const [isPublishing, setIsPublishing] = useState(false);
    const [calculatingRoute, setCalculatingRoute] = useState(false);

    // Preferences
    const [petsAllowed, setPetsAllowed] = useState(false);
    const [smokingAllowed, setSmokingAllowed] = useState(false);
    const [max2Allowed, setMax2Allowed] = useState(true);

    // Vehicle & Seats
    const [vehicles, setVehicles] = useState([]);
    const [selectedVehicleIdx, setSelectedVehicleIdx] = useState(0);
    const [totalSeats, setTotalSeats] = useState(4);
    const SEAT_TYPES = [
        { type: "front",       label: "Front Seat",              icon: "car-outline" },
        { type: "backWindow",  label: "Back Window Seat",        icon: "car-sport-outline" },
        { type: "backMiddle",  label: "Back Middle Seat",        icon: "people-outline" },
        { type: "backArmrest", label: "Back Seat w/ Armrest",    icon: "accessibility-outline" },
        { type: "thirdRow",    label: "Third Row Seat",          icon: "bus-outline" },
        { type: "any",         label: "Any Seat (No Preference)", icon: "grid-outline" },
    ];
    const [seatCounts, setSeatCounts] = useState(
        Object.fromEntries(SEAT_TYPES.map(s => [s.type, 0]))
    );
    const seatTotal = Object.values(seatCounts).reduce((a, b) => a + b, 0);

    const onPlaceSelected = (data, details, type) => {
        const location = {
            name: data.structured_formatting?.main_text || data.description,
            address: data.description,
            latitude: details.geometry.location.lat,
            longitude: details.geometry.location.lng,
        };

        if (type === "start") setStartLocation(location);
        else setEndLocation(location);
    };

    const fetchRoute = async () => {
        if (!startLocation || !endLocation) return;

        setCalculatingRoute(true);
        try {
            const resp = await fetch(
                `https://maps.googleapis.com/maps/api/directions/json?origin=${startLocation.latitude},${startLocation.longitude}&destination=${endLocation.latitude},${endLocation.longitude}&key=${GOOGLE_API_KEY}`
            );
            const data = await resp.json();

            if (data.status !== "OK" || !data.routes.length) {
                throw new Error("No route found");
            }

            const route = data.routes[0];
            const leg = route.legs[0];
            const points = polyline.decode(route.overview_polyline.points);
            const coords = points.map(([lat, lng]) => ({ latitude: lat, longitude: lng }));
            const distanceKm = leg.distance.value / 1000;
            const durationMins = leg.duration.value / 60;

            // Extract Grids
            const grids = [...new Set(points.map(([lat, lng]) => latLngToGrid(lat, lng)))];

            // Calculate Recommended Fare (Example logic: ₹12/km + ₹30 base)
            const recFare = Math.round((distanceKm * 12) + 30);
            setRecommendedFare(recFare);
            setExtraFare(""); // Reset extra fare

            setRouteCoordinates(coords);
            setRouteData({
                encodedPolyline: route.overview_polyline.points,
                gridsCovered: grids,
                metrics: {
                    totalDistanceKm: distanceKm,
                    durationMinutes: durationMins,
                },
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

            // Fit map to route
            setTimeout(() => {
                mapRef.current?.fitToCoordinates(coords, {
                    edgePadding: { top: 100, right: 50, bottom: 350, left: 50 },
                    animated: true,
                });
            }, 500);

        } catch (error) {
            console.error("Route Error:", error);
            Alert.alert("Error", "Failed to calculate route. Please try again.");
            setRouteData(null); // Reset if failed
        } finally {
            setCalculatingRoute(false);
        }
    };

    const handleClearRoute = () => {
        setRouteData(null);
        setRouteCoordinates([]);
        // Optional: clear start/end locations if desired, currently keeping them
    };

    useEffect(() => {
        if (startLocation && endLocation) {
            fetchRoute();
        }
    }, [startLocation, endLocation]);

    useEffect(() => {
        const loadVehicles = async () => {
            if (!user?.id) return;
            try {
                const res = await fetch(`${BACKEND_URL}/api/driver-profile/${user.id}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.vehicles?.length) {
                        setVehicles(data.vehicles);
                        // Pre-seed total seats from first vehicle
                        if (data.vehicles[0]?.totalSeats) {
                            setTotalSeats(data.vehicles[0].totalSeats);
                        }
                    }
                }
            } catch (e) { console.error("Failed to load vehicles:", e); }
        };
        loadVehicles();
    }, [user?.id]);

    useEffect(() => {
        (async () => {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return;

            let location = await Location.getCurrentPositionAsync({});
            setCurrentLocation({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
            });

            if (mapRef.current && !startLocation && !endLocation) {
                mapRef.current.animateToRegion({
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                    latitudeDelta: 0.05,
                    longitudeDelta: 0.05,
                });
            }
        })();
    }, []);

    const handlePublish = async () => {
        if (!routeData) {
            Alert.alert("No Route", "Please select valid locations.");
            return;
        }

        if (vehicles.length === 0) {
            Alert.alert(
                "No Vehicle Registered",
                "You need to register at least one vehicle before creating a ride.",
                [
                    { text: "Cancel", style: "cancel" },
                    { text: "Add Vehicle", onPress: () => router.push("/profile/vehicles") },
                ]
            );
            return;
        }

        setIsPublishing(true);
        try {
            const finalFare = recommendedFare + (Number(extraFare) || 0);

            const payload = {
                driver: {
                    userId: user.id,
                    name: user.fullName,
                    profileImage: user.imageUrl,
                },
                route: routeData,
                schedule: { departureTime: date.toISOString() },
                pricing: { baseFare: finalFare },
                seats: {
                    total: totalSeats,
                    available: totalSeats,
                    seatTypes: SEAT_TYPES
                        .filter(s => seatCounts[s.type] > 0)
                        .map(s => ({ type: s.type, label: s.label, count: seatCounts[s.type] })),
                },
                vehicle: vehicles[selectedVehicleIdx] ? {
                    brand: vehicles[selectedVehicleIdx].brand,
                    model: vehicles[selectedVehicleIdx].model,
                    year: vehicles[selectedVehicleIdx].year,
                    color: vehicles[selectedVehicleIdx].color,
                    licensePlate: vehicles[selectedVehicleIdx].licensePlate,
                    image: vehicles[selectedVehicleIdx].images?.[0] || null,
                } : null,
                preferences: { petsAllowed, smokingAllowed, max2Allowed },
                metrics: routeData.metrics,
            };

            const response = await fetch(`${BACKEND_URL}/api/rides`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const result = await response.json();

            if (response.ok) {
                Alert.alert("Success", "Ride published successfully!", [
                    { text: "OK", onPress: () => router.push("/(app)/my-rides?tab=driver") }
                ]);
            } else {
                throw new Error(result.message || "Failed to publish ride");
            }
        } catch (error) {
            console.error("Publish Error:", error);
            Alert.alert("Error", error.message || "Something went wrong.");
        } finally {
            setIsPublishing(false);
        }
    };

    // Autocomplete Styles
    const autocompleteStyles = {
        container: { flex: 0 },
        textInput: {
            height: 44,
            borderRadius: 8,
            paddingHorizontal: 10,
            fontSize: 14,
            backgroundColor: '#F3F4F6',
            color: '#000',
        },
        listView: {
            position: 'absolute',
            top: 44,
            left: 0,
            right: 0,
            backgroundColor: 'white',
            borderRadius: 8,
            elevation: 10,
            zIndex: 1000,
        },
    };

    return (
        <KeyboardAvoidingView
            behavior="padding"
            keyboardVerticalOffset={100}
            style={tw`flex-1 bg-white`}
        >

            {/* 1. Header (Floating Overlay) */}
            <View style={[tw`absolute top-12 left-4 z-50`]}>
                <TouchableOpacity onPress={() => router.back()} style={tw`bg-white p-2 rounded-full shadow-md`}>
                    <Ionicons name="arrow-back" size={24} color="#000" />
                </TouchableOpacity>
            </View>

            {/* 2. Map (Flex Middle) */}
            <View style={tw`flex-1 relative z-0`}>
                <MapView
                    ref={mapRef}
                    provider={PROVIDER_GOOGLE}
                    style={tw`flex-1`}
                    onPress={() => Keyboard.dismiss()}
                    initialRegion={{
                        latitude: 12.9716, longitude: 77.5946,
                        latitudeDelta: 0.05, longitudeDelta: 0.05,
                    }}
                >
                    {routeCoordinates.length > 0 && (
                        <Polyline coordinates={routeCoordinates} strokeColor={theme.light.primary} strokeWidth={4} />
                    )}
                    {startLocation && <Marker coordinate={startLocation} title="Start" pinColor="green" />}
                    {endLocation && <Marker coordinate={endLocation} title="End" pinColor="red" />}

                    {currentLocation && !routeCoordinates.length && (
                        <Marker coordinate={currentLocation}>
                            <View style={tw`bg-white p-1 rounded-full shadow-md border border-gray-100`}>
                                <Image source={{ uri: user?.imageUrl }} style={tw`w-8 h-8 rounded-full`} />
                            </View>
                        </Marker>
                    )}
                </MapView>

                {calculatingRoute && (
                    <View style={tw`absolute inset-0 bg-white/50 justify-center items-center`}>
                        <ActivityIndicator size="large" color={theme.light.primary} />
                    </View>
                )}
            </View>

            {/* 3. Bottom Section: Conditional Rendering (Inputs or Details) */}
            <View style={[tw`bg-white rounded-t-3xl shadow-xl w-full z-10`, { minHeight: 200 }]}>
                {!routeData ? (
                    /* Search Inputs */
                    <View style={tw`p-5 pt-8 pb-10`}>
                        <Text style={tw`text-lg font-bold mb-4 text-gray-800`}>Where are you going?</Text>
                        <View style={tw`flex-row`}>
                            <View style={tw`w-8 items-center pt-3`}>
                                <View style={tw`w-3 h-3 bg-green-500 rounded-full`} />
                                <View style={tw`w-0.5 flex-1 bg-gray-300 my-1`} />
                                <View style={tw`w-3 h-3 bg-red-500 rounded-sm`} />
                            </View>

                            <View style={tw`flex-1 gap-3`}>
                                <View style={{ zIndex: 100 }}>
                                    <GooglePlacesAutocomplete
                                        placeholder="Starting Point"
                                        fetchDetails={true}
                                        onPress={(data, details = null) => onPlaceSelected(data, details, "start")}
                                        query={{ key: GOOGLE_API_KEY, language: "en" }}
                                        enablePoweredByContainer={false}
                                        debounce={200}
                                        minLength={2}
                                        styles={autocompleteStyles}
                                        textInputProps={{ placeholderTextColor: "#9ca3af" }}
                                    />
                                </View>
                                <View style={{ zIndex: 50 }}>
                                    <GooglePlacesAutocomplete
                                        placeholder="Destination"
                                        fetchDetails={true}
                                        onPress={(data, details = null) => onPlaceSelected(data, details, "end")}
                                        query={{ key: GOOGLE_API_KEY, language: "en" }}
                                        enablePoweredByContainer={false}
                                        debounce={200}
                                        minLength={2}
                                        styles={autocompleteStyles}
                                        textInputProps={{ placeholderTextColor: "#9ca3af" }}
                                    />
                                </View>
                            </View>
                        </View>
                    </View>
                ) : (
                    /* Ride Details Sheet */
                    <View style={{ maxHeight: Dimensions.get('window').height * 0.6 }}>
                        <View style={tw`h-1 w-12 bg-gray-300 rounded-full self-center mt-3 mb-2`} />
                        <View style={tw`flex-row justify-between items-center px-6 pb-2`}>
                            <Text style={tw`text-lg font-bold text-gray-800`}>Ride Details</Text>
                            <TouchableOpacity onPress={handleClearRoute} style={tw`bg-gray-100 p-2 rounded-full`}>
                                <Ionicons name="close" size={20} color="gray" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView contentContainerStyle={tw`p-6 pt-0 pb-12`}>
                            {/* Summary */}
                            <View style={tw`bg-gray-50 p-4 rounded-xl mb-6 border border-gray-100`}>
                                <View style={tw`flex-row justify-between items-center`}>
                                    <View>
                                        <Text style={tw`text-gray-500 text-xs font-bold`}>DISTANCE</Text>
                                        <Text style={tw`text-lg font-bold text-gray-900`}>{routeData.metrics.totalDistanceKm.toFixed(1)} km</Text>
                                    </View>
                                    <View style={tw`items-end`}>
                                        <Text style={tw`text-gray-500 text-xs font-bold`}>DURATION</Text>
                                        <Text style={tw`text-lg font-bold text-gray-900`}>{Math.round(routeData.metrics.durationMinutes)} min</Text>
                                    </View>
                                </View>
                            </View>

                            {/* Date & Time */}
                            <Text style={tw`text-xs font-bold text-gray-400 mb-2 uppercase`}>Departure Time</Text>
                            <View style={tw`flex-row gap-3 mb-6`}>
                                <TouchableOpacity onPress={() => setShowDatePicker(true)} style={tw`flex-1 bg-white p-3 rounded-xl border border-gray-200 flex-row items-center justify-center shadow-sm`}>
                                    <Ionicons name="calendar-outline" size={18} color="gray" style={tw`mr-2`} />
                                    <Text style={tw`font-semibold text-gray-900`}>{date.toLocaleDateString()}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setShowTimePicker(true)} style={tw`flex-1 bg-white p-3 rounded-xl border border-gray-200 flex-row items-center justify-center shadow-sm`}>
                                    <Ionicons name="time-outline" size={18} color="gray" style={tw`mr-2`} />
                                    <Text style={tw`font-semibold text-gray-900`}>{date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Pickers Logic */}
                            {showDatePicker && (
                                <DateTimePicker
                                    value={date}
                                    mode="date"
                                    onChange={(event, selectedDate) => {
                                        setShowDatePicker(false);
                                        if (selectedDate) setDate(prev => { const d = new Date(prev); d.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()); return d; });
                                    }}
                                />
                            )}
                            {showTimePicker && (
                                <DateTimePicker
                                    value={date}
                                    mode="time"
                                    onChange={(event, selectedDate) => {
                                        setShowTimePicker(false);
                                        if (selectedDate) setDate(prev => { const d = new Date(prev); d.setHours(selectedDate.getHours(), selectedDate.getMinutes()); return d; });
                                    }}
                                />
                            )}

                            {/* Vehicle Picker */}
                            {vehicles.length > 0 && (
                                <>
                                    <Text style={tw`text-xs font-bold text-gray-400 mb-2 uppercase`}>Vehicle</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`mb-6`}>
                                        {vehicles.map((v, idx) => (
                                            <TouchableOpacity
                                                key={idx}
                                                onPress={() => {
                                                    setSelectedVehicleIdx(idx);
                                                    // Pre-populate total seats from this vehicle
                                                    if (v.totalSeats) {
                                                        setTotalSeats(v.totalSeats);
                                                        setSeatCounts(Object.fromEntries(SEAT_TYPES.map(s => [s.type, 0])));
                                                    }
                                                }}
                                                style={[
                                                    tw`mr-3 rounded-xl border-2 overflow-hidden`,
                                                    { width: 160, borderColor: selectedVehicleIdx === idx ? theme.light.primary : '#E5E7EB' }
                                                ]}
                                            >
                                                {v.images?.[0] ? (
                                                    <Image source={{ uri: v.images[0] }} style={{ width: 160, height: 90 }} resizeMode="cover" />
                                                ) : (
                                                    <View style={[tw`justify-center items-center`, { width: 160, height: 90, backgroundColor: '#F3F4F6' }]}>
                                                        <MaterialCommunityIcons name="car" size={36} color="#9CA3AF" />
                                                    </View>
                                                )}
                                                <View style={tw`p-2`}>
                                                    <Text style={tw`font-bold text-gray-900 text-sm`}>{v.brand} {v.model}</Text>
                                                    <Text style={tw`text-gray-500 text-xs`}>{v.color} · {v.year}</Text>
                                                    <Text style={tw`text-gray-400 text-xs`}>{v.licensePlate}</Text>
                                                </View>
                                                {selectedVehicleIdx === idx && (
                                                    <View style={[tw`absolute top-2 right-2 rounded-full p-0.5`, { backgroundColor: theme.light.primary }]}>
                                                        <Ionicons name="checkmark" size={12} color="white" />
                                                    </View>
                                                )}
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </>
                            )}

                            {/* Seat Configuration */}
                            <Text style={tw`text-xs font-bold text-gray-400 mb-2 uppercase`}>Seat Configuration</Text>
                            <View style={tw`bg-white p-4 rounded-xl border border-gray-200 mb-2 shadow-sm`}>
                                {/* Total seats stepper */}
                                <View style={tw`flex-row justify-between items-center pb-3 mb-3 border-b border-gray-100`}>
                                    <View>
                                        <Text style={tw`font-semibold text-gray-900`}>Total Seats Offered</Text>
                                        <Text style={tw`text-xs text-gray-400`}>How many passengers can join?</Text>
                                    </View>
                                    <View style={tw`flex-row items-center gap-3`}>
                                        <TouchableOpacity
                                            onPress={() => {
                                                const next = Math.max(1, totalSeats - 1);
                                                setTotalSeats(next);
                                                // clamp seatCounts to new total
                                                setSeatCounts(prev => {
                                                    const updated = { ...prev };
                                                    let excess = Object.values(updated).reduce((a,b)=>a+b,0) - next;
                                                    for (const k of Object.keys(updated).reverse()) {
                                                        if (excess <= 0) break;
                                                        const cut = Math.min(updated[k], excess);
                                                        updated[k] -= cut;
                                                        excess -= cut;
                                                    }
                                                    return updated;
                                                });
                                            }}
                                            style={tw`w-8 h-8 bg-gray-100 rounded-full items-center justify-center`}
                                        >
                                            <Ionicons name="remove" size={18} color="#374151" />
                                        </TouchableOpacity>
                                        <Text style={tw`text-lg font-bold text-gray-900 w-6 text-center`}>{totalSeats}</Text>
                                        <TouchableOpacity
                                            onPress={() => setTotalSeats(t => Math.min(t + 1, 12))}
                                            style={[tw`w-8 h-8 rounded-full items-center justify-center`, { backgroundColor: theme.light.primary }]}
                                        >
                                            <Ionicons name="add" size={18} color="white" />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {/* Per-type seat rows */}
                                {SEAT_TYPES.map(seat => (
                                    <View key={seat.type} style={tw`flex-row items-center justify-between py-2`}>
                                        <View style={tw`flex-row items-center flex-1`}>
                                            <Ionicons name={seat.icon} size={18} color="#6B7280" style={tw`mr-3`} />
                                            <Text style={tw`text-gray-700 text-sm flex-1`}>{seat.label}</Text>
                                        </View>
                                        <View style={tw`flex-row items-center gap-2`}>
                                            <TouchableOpacity
                                                onPress={() => setSeatCounts(prev => ({ ...prev, [seat.type]: Math.max(0, prev[seat.type] - 1) }))}
                                                disabled={seatCounts[seat.type] === 0}
                                                style={[tw`w-7 h-7 rounded-full items-center justify-center`, seatCounts[seat.type] === 0 ? tw`bg-gray-100` : tw`bg-gray-200`]}
                                            >
                                                <Ionicons name="remove" size={15} color={seatCounts[seat.type] === 0 ? '#D1D5DB' : '#374151'} />
                                            </TouchableOpacity>
                                            <Text style={tw`text-sm font-semibold text-gray-900 w-5 text-center`}>{seatCounts[seat.type]}</Text>
                                            <TouchableOpacity
                                                onPress={() => {
                                                    if (seatTotal < totalSeats) {
                                                        setSeatCounts(prev => ({ ...prev, [seat.type]: prev[seat.type] + 1 }));
                                                    }
                                                }}
                                                disabled={seatTotal >= totalSeats}
                                                style={[tw`w-7 h-7 rounded-full items-center justify-center`, seatTotal >= totalSeats ? tw`bg-gray-100` : { backgroundColor: theme.light.primary }]}
                                            >
                                                <Ionicons name="add" size={15} color={seatTotal >= totalSeats ? '#D1D5DB' : 'white'} />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ))}

                                {/* Tally indicator */}
                                <View style={[tw`mt-3 pt-3 border-t border-gray-100 flex-row justify-between items-center`]}>
                                    <Text style={tw`text-xs text-gray-500`}>Allocated: {seatTotal} / {totalSeats}</Text>
                                    {seatTotal < totalSeats && (
                                        <Text style={tw`text-xs text-amber-500 font-medium`}>{totalSeats - seatTotal} seat{totalSeats - seatTotal > 1 ? 's' : ''} unassigned — OK or assign above</Text>
                                    )}
                                    {seatTotal === totalSeats && (
                                        <Text style={[tw`text-xs font-medium`, { color: theme.light.success }]}>✓ All seats assigned</Text>
                                    )}
                                </View>
                            </View>
                            <View style={tw`mb-6`} />

                            {/* Pricing */}
                            <View style={tw`bg-white p-4 rounded-xl border border-gray-200 mb-6 gap-2 shadow-sm`}>
                                <View style={tw`flex-row justify-between`}>
                                    <Text style={tw`text-gray-600`}>Base Price (Rec.)</Text>
                                    <Text style={tw`font-semibold`}>₹{recommendedFare}</Text>
                                </View>
                                <View style={tw`flex-row items-center border-t border-gray-100 pt-2`}>
                                    <TextInput
                                        value={extraFare}
                                        onChangeText={setExtraFare}
                                        placeholder="+ Extra Amount"
                                        keyboardType="numeric"
                                        style={tw`flex-1 text-base font-medium text-gray-900 h-10`}
                                    />
                                    <Text style={tw`font-bold text-green-700 text-lg`}>
                                        Total: ₹{recommendedFare + (Number(extraFare) || 0)}
                                    </Text>
                                </View>
                            </View>

                            {/* Preferences */}
                            <Text style={tw`text-xs font-bold text-gray-400 mb-2 uppercase`}>Preferences</Text>
                            <View style={tw`flex-row flex-wrap gap-3 mb-8`}>
                                {[
                                    { label: "Pets Allowed", icon: "paw-outline", value: petsAllowed, setter: setPetsAllowed },
                                    { label: "No Smoking", icon: "ban-outline", value: smokingAllowed, setter: setSmokingAllowed },
                                    { label: "Max 2 Back", icon: "people-outline", value: max2Allowed, setter: setMax2Allowed },
                                ].map((item, idx) => (
                                    <TouchableOpacity
                                        key={idx}
                                        activeOpacity={0.8}
                                        onPress={() => item.setter(!item.value)}
                                        style={[
                                            tw`flex-row items-center px-4 py-2 rounded-full`,
                                            item.value
                                                ? { backgroundColor: theme.light.primary }
                                                : { backgroundColor: "#F3F4F6" }
                                        ]}
                                    >
                                        <Ionicons
                                            name={item.icon}
                                            size={16}
                                            color={item.value ? "white" : "#6B7280"}
                                            style={tw`mr-2`}
                                        />
                                        <Text
                                            style={[
                                                tw`text-sm font-medium`,
                                                { color: item.value ? "white" : "#6B7280" }
                                            ]}
                                        >
                                            {item.label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Submit */}
                            <TouchableOpacity
                                onPress={handlePublish}
                                disabled={isPublishing}
                                style={[tw`py-4 rounded-xl items-center shadow-lg`, { backgroundColor: theme.light.primary }, isPublishing && tw`opacity-70`]}
                            >
                                {isPublishing ? <ActivityIndicator color="white" /> : <Text style={tw`text-white font-bold text-lg`}>Publish Ride</Text>}
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                )}
            </View>
        </KeyboardAvoidingView>
    );
}
