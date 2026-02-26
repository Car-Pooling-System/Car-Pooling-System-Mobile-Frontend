import {
    View, Text, ScrollView, TextInput, TouchableOpacity,
    Alert, ActivityIndicator, Image, useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState } from "react";
import { useUser } from "@clerk/clerk-expo";
import { useRouter, useLocalSearchParams } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import tw from "twrnc";
import { theme } from "../../../constants/Colors";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const SEAT_TYPES = [
    { type: "front",       label: "Front Seat",               icon: "car-outline" },
    { type: "backWindow",  label: "Back Window Seat",         icon: "car-sport-outline" },
    { type: "backMiddle",  label: "Back Middle Seat",         icon: "people-outline" },
    { type: "backArmrest", label: "Back Seat w/ Armrest",     icon: "accessibility-outline" },
    { type: "thirdRow",    label: "Third Row Seat",           icon: "bus-outline" },
    { type: "any",         label: "Any Seat (No Preference)", icon: "grid-outline" },
];

const formatDuration = (mins) => {
    const total = Math.round(mins);
    const d = Math.floor(total / 1440);
    const h = Math.floor((total % 1440) / 60);
    const m = total % 60;
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0 || parts.length === 0) parts.push(`${m}m`);
    return parts.join(' ');
};

export default function RideDetails() {
    const { user } = useUser();
    const router = useRouter();
    const scheme = useColorScheme();
    const colors = theme[scheme ?? "light"];
    const params = useLocalSearchParams();

    const routeData = params.routeData ? JSON.parse(params.routeData) : null;
    const vehicles = params.vehicles ? JSON.parse(params.vehicles) : [];

    const [date, setDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);

    const [extraFare, setExtraFare] = useState("");
    const [recommendedFare] = useState(
        routeData ? Math.round((routeData.metrics.totalDistanceKm * 12) + 30) : 0
    );

    const [isPublishing, setIsPublishing] = useState(false);

    const [petsAllowed, setPetsAllowed] = useState(false);
    const [smokingAllowed, setSmokingAllowed] = useState(false);
    const [luggageSpace, setLuggageSpace] = useState(false);

    const [selectedVehicleIdx, setSelectedVehicleIdx] = useState(0);
    const [totalSeats, setTotalSeats] = useState(
        vehicles[0]?.totalSeats || 4
    );
    const [seatCounts, setSeatCounts] = useState(() => ({
        front: 0, backWindow: 0, backMiddle: 0, backArmrest: 0, thirdRow: 0,
        any: vehicles[0]?.totalSeats || 4,
    }));
    const seatTotal = Object.values(seatCounts).reduce((a, b) => a + b, 0);

    const [extraHours, setExtraHours] = useState(0);
    const [extraMins, setExtraMins] = useState(0);
    const extraTimeMinutes = extraHours * 60 + extraMins;

    if (!routeData) {
        return (
            <View style={[tw`flex-1 justify-center items-center`, { backgroundColor: colors.background }]}>
                <Text style={[tw`text-base`, { color: colors.textSecondary }]}>No route data. Go back and select locations.</Text>
                <TouchableOpacity onPress={() => router.back()} style={[tw`mt-4 px-6 py-3 rounded-xl`, { backgroundColor: colors.primary }]}>
                    <Text style={tw`text-white font-bold`}>Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const handlePublish = async () => {
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
                schedule: { departureTime: date.toISOString(), extraTimeMinutes },
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
                    hasLuggageSpace: vehicles[selectedVehicleIdx].hasLuggageSpace || false,
                } : null,
                preferences: { petsAllowed, smokingAllowed, luggageSpace },
                metrics: {
                    ...routeData.metrics,
                    durationMinutes: routeData.metrics.durationMinutes + extraTimeMinutes,
                },
            };

            const response = await fetch(`${BACKEND_URL}/api/rides`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const result = await response.json();

            if (response.ok) {
                Alert.alert("Success", "Ride published successfully!", [
                    {
                        text: "OK",
                        onPress: () => {
                            // Navigate to my-rides AND reset the hosting stack so
                            // coming back to Create Ride starts fresh
                            router.dismissAll();
                            router.replace("/(app)/my-rides?tab=driver");
                        },
                    },
                ]);
            } else {
                throw new Error(result.message || "Failed to publish ride");
            }
        } catch (error) {
            Alert.alert("Error", error.message || "Something went wrong.");
        } finally {
            setIsPublishing(false);
        }
    };

    const errors = [];
    if (vehicles.length === 0) errors.push("Register a vehicle before publishing");
    if (date <= new Date()) errors.push("Departure time must be in the future");
    const canPublish = errors.length === 0;

    return (
        <View style={[tw`flex-1`, { backgroundColor: colors.background }]}>
            {/* Header */}
            <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.surface }}>
            <View style={[tw`flex-row items-center px-4 pt-2 pb-4 border-b`, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={tw`mr-3 p-1`}>
                    <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <View style={tw`flex-1`}>
                    <Text style={[tw`text-lg font-bold`, { color: colors.textPrimary }]}>New Ride</Text>
                    <Text style={[tw`text-xs`, { color: colors.textSecondary }]}>
                        {routeData.start.name} → {routeData.end.name}
                    </Text>
                </View>
                {/* Distance / Duration pill */}
                <View style={[tw`px-3 py-1.5 rounded-full`, { backgroundColor: colors.primarySoft }]}>
                    <Text style={[tw`text-xs font-bold`, { color: colors.primary }]}>
                        {routeData.metrics.totalDistanceKm.toFixed(1)} km · {formatDuration(routeData.metrics.durationMinutes)}
                    </Text>
                </View>
            </View>
            </SafeAreaView>

            <ScrollView contentContainerStyle={tw`p-4 pb-12`} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                {/* ── Break & Stop Time ── */}
                <Text style={[tw`text-xs font-bold mb-2 uppercase`, { color: colors.textMuted }]}>Break & Stop Time</Text>
                <View style={[tw`rounded-xl border mb-5 overflow-hidden`, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={[tw`flex-row items-center px-4 py-2.5`, { backgroundColor: colors.surfaceMuted }]}>
                        <Ionicons name="cafe-outline" size={14} color={colors.textMuted} style={tw`mr-2`} />
                        <Text style={[tw`text-xs flex-1`, { color: colors.textMuted }]}>
                            {extraTimeMinutes === 0 ? 'No break added' : `+${formatDuration(extraTimeMinutes)} added to trip duration`}
                        </Text>
                        {extraTimeMinutes > 0 && (
                            <TouchableOpacity onPress={() => { setExtraHours(0); setExtraMins(0); }}>
                                <Text style={[tw`text-xs font-bold`, { color: colors.danger }]}>Clear</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    <View style={tw`flex-row items-center justify-center px-6 py-4 gap-3`}>
                        {/* Hours */}
                        <View style={tw`flex-1 items-center gap-2`}>
                            <Text style={[tw`text-[10px] font-bold uppercase tracking-wider`, { color: colors.textMuted }]}>Hours</Text>
                            <View style={tw`flex-row items-center gap-2`}>
                                <TouchableOpacity onPress={() => setExtraHours(h => Math.max(0, h - 1))} disabled={extraHours === 0}
                                    style={[tw`w-7 h-7 rounded-full items-center justify-center`, { backgroundColor: extraHours === 0 ? colors.surfaceMuted : colors.border }]}>
                                    <Ionicons name="remove" size={14} color={extraHours === 0 ? colors.textMuted : colors.textPrimary} />
                                </TouchableOpacity>
                                <Text style={[tw`text-2xl font-bold w-8 text-center`, { color: extraHours > 0 ? colors.primary : colors.textMuted }]}>{extraHours}</Text>
                                <TouchableOpacity onPress={() => setExtraHours(h => Math.min(23, h + 1))}
                                    style={[tw`w-7 h-7 rounded-full items-center justify-center`, { backgroundColor: colors.primary }]}>
                                    <Ionicons name="add" size={14} color="white" />
                                </TouchableOpacity>
                            </View>
                        </View>
                        <Text style={[tw`text-2xl font-light pb-1`, { color: colors.border }]}>:</Text>
                        {/* Minutes */}
                        <View style={tw`flex-1 items-center gap-2`}>
                            <Text style={[tw`text-[10px] font-bold uppercase tracking-wider`, { color: colors.textMuted }]}>Min (×15)</Text>
                            <View style={tw`flex-row items-center gap-2`}>
                                <TouchableOpacity onPress={() => setExtraMins(m => Math.max(0, m - 15))} disabled={extraMins === 0}
                                    style={[tw`w-7 h-7 rounded-full items-center justify-center`, { backgroundColor: extraMins === 0 ? colors.surfaceMuted : colors.border }]}>
                                    <Ionicons name="remove" size={14} color={extraMins === 0 ? colors.textMuted : colors.textPrimary} />
                                </TouchableOpacity>
                                <Text style={[tw`text-2xl font-bold w-8 text-center`, { color: extraMins > 0 ? colors.primary : colors.textMuted }]}>{extraMins}</Text>
                                <TouchableOpacity onPress={() => setExtraMins(m => (m + 15) % 60)}
                                    style={[tw`w-7 h-7 rounded-full items-center justify-center`, { backgroundColor: colors.primary }]}>
                                    <Ionicons name="add" size={14} color="white" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                    {/* Presets */}
                    <View style={[tw`flex-row px-4 pb-4 gap-2`, { borderTopWidth: 1, borderTopColor: colors.border }]}>
                        {[{ h: 0, m: 15, label: '15m' }, { h: 0, m: 30, label: '30m' }, { h: 1, m: 0, label: '1h' }, { h: 1, m: 30, label: '1h 30m' }, { h: 2, m: 0, label: '2h' }].map(p => {
                            const active = extraHours === p.h && extraMins === p.m;
                            return (
                                <TouchableOpacity key={p.label} onPress={() => { setExtraHours(p.h); setExtraMins(p.m); }}
                                    style={[tw`flex-1 py-2 rounded-lg border items-center mt-3`,
                                        active ? { backgroundColor: colors.primary, borderColor: colors.primary }
                                               : { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                    <Text style={[tw`text-xs font-bold`, { color: active ? 'white' : colors.textSecondary }]}>{p.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                {/* ── Departure Time ── */}
                <Text style={[tw`text-xs font-bold mb-2 uppercase`, { color: colors.textMuted }]}>Departure Time</Text>
                <View style={tw`flex-row gap-3 mb-5`}>
                    <TouchableOpacity onPress={() => setShowDatePicker(true)}
                        style={[tw`flex-1 p-3 rounded-xl border flex-row items-center justify-center`, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} style={tw`mr-2`} />
                        <Text style={[tw`font-semibold`, { color: colors.textPrimary }]}>{date.toLocaleDateString()}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowTimePicker(true)}
                        style={[tw`flex-1 p-3 rounded-xl border flex-row items-center justify-center`, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Ionicons name="time-outline" size={18} color={colors.textSecondary} style={tw`mr-2`} />
                        <Text style={[tw`font-semibold`, { color: colors.textPrimary }]}>
                            {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                    </TouchableOpacity>
                </View>
                {showDatePicker && (
                    <DateTimePicker value={date} mode="date"
                        onChange={(e, d) => { setShowDatePicker(false); if (d) setDate(prev => { const n = new Date(prev); n.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); return n; }); }} />
                )}
                {showTimePicker && (
                    <DateTimePicker value={date} mode="time"
                        onChange={(e, d) => { setShowTimePicker(false); if (d) setDate(prev => { const n = new Date(prev); n.setHours(d.getHours(), d.getMinutes()); return n; }); }} />
                )}

                {/* ── Vehicle Picker ── */}
                {vehicles.length > 0 && (
                    <>
                        <Text style={[tw`text-xs font-bold mb-2 uppercase`, { color: colors.textMuted }]}>Vehicle (Insured Only)</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`mb-5`}>
                            {vehicles.map((v, idx) => (
                                <TouchableOpacity key={idx}
                                    onPress={() => {
                                        setSelectedVehicleIdx(idx);
                                        if (v.totalSeats) {
                                            setTotalSeats(v.totalSeats);
                                            setSeatCounts({ front: 0, backWindow: 0, backMiddle: 0, backArmrest: 0, thirdRow: 0, any: v.totalSeats });
                                        }
                                    }}
                                    style={[tw`mr-3 rounded-xl border-2 overflow-hidden`,
                                        { width: 160, borderColor: selectedVehicleIdx === idx ? colors.primary : colors.border }]}>
                                    {v.images?.[0] ? (
                                        <Image source={{ uri: v.images[0] }} style={{ width: 160, height: 90 }} resizeMode="cover" />
                                    ) : (
                                        <View style={[tw`justify-center items-center`, { width: 160, height: 90, backgroundColor: colors.surfaceMuted }]}>
                                            <MaterialCommunityIcons name="car" size={36} color={colors.textMuted} />
                                        </View>
                                    )}
                                    <View style={[tw`p-2`, { backgroundColor: colors.surface }]}>
                                        <Text style={[tw`font-bold text-sm`, { color: colors.textPrimary }]}>{v.brand} {v.model}</Text>
                                        <Text style={[tw`text-xs`, { color: colors.textSecondary }]}>{v.color} · {v.year}</Text>
                                        <Text style={[tw`text-xs`, { color: colors.textMuted }]}>{v.licensePlate}</Text>
                                    </View>
                                    {selectedVehicleIdx === idx && (
                                        <View style={[tw`absolute top-2 right-2 rounded-full p-0.5`, { backgroundColor: colors.primary }]}>
                                            <Ionicons name="checkmark" size={12} color="white" />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </>
                )}

                {/* ── Seat Configuration ── */}
                <Text style={[tw`text-xs font-bold mb-2 uppercase`, { color: colors.textMuted }]}>Seat Configuration</Text>
                <View style={[tw`rounded-xl border mb-5 p-4`, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    {/* Total seats stepper */}
                    {(() => {
                        const vehicleCapacity = vehicles[selectedVehicleIdx]?.totalSeats || 12;
                        const selectedVehicle = vehicles[selectedVehicleIdx];
                        return (
                            <View style={[tw`pb-3 mb-3 border-b`, { borderColor: colors.border }]}>
                                <View style={tw`flex-row justify-between items-center`}>
                                    <View>
                                        <Text style={[tw`font-semibold`, { color: colors.textPrimary }]}>Total Seats Offered</Text>
                                        <Text style={[tw`text-xs`, { color: colors.textMuted }]}>
                                            {selectedVehicle ? `Max ${vehicleCapacity} · ${selectedVehicle.brand} ${selectedVehicle.model}` : 'How many passengers can join?'}
                                        </Text>
                                    </View>
                                    <View style={tw`flex-row items-center gap-3`}>
                                        <TouchableOpacity
                                            onPress={() => {
                                                const next = Math.max(1, totalSeats - 1);
                                                setTotalSeats(next);
                                                setSeatCounts(prev => {
                                                    const updated = { ...prev };
                                                    let excess = Object.values(updated).reduce((a, b) => a + b, 0) - next;
                                                    for (const k of Object.keys(updated).reverse()) {
                                                        if (excess <= 0) break;
                                                        const cut = Math.min(updated[k], excess);
                                                        updated[k] -= cut;
                                                        excess -= cut;
                                                    }
                                                    return updated;
                                                });
                                            }}
                                            style={[tw`w-8 h-8 rounded-full items-center justify-center`, { backgroundColor: colors.surfaceMuted }]}>
                                            <Ionicons name="remove" size={18} color={colors.textPrimary} />
                                        </TouchableOpacity>
                                        <Text style={[tw`text-lg font-bold w-6 text-center`, { color: colors.textPrimary }]}>{totalSeats}</Text>
                                        <TouchableOpacity
                                            onPress={() => {
                                                if (totalSeats < vehicleCapacity) {
                                                    setTotalSeats(t => t + 1);
                                                    setSeatCounts(prev => ({ ...prev, any: prev.any + 1 }));
                                                }
                                            }}
                                            disabled={totalSeats >= vehicleCapacity}
                                            style={[tw`w-8 h-8 rounded-full items-center justify-center`,
                                                { backgroundColor: totalSeats >= vehicleCapacity ? colors.surfaceMuted : colors.primary }]}>
                                            <Ionicons name="add" size={18} color={totalSeats >= vehicleCapacity ? colors.textMuted : 'white'} />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                {totalSeats >= vehicleCapacity && (
                                    <Text style={[tw`text-xs mt-1`, { color: '#d97706' }]}>⚠ At vehicle capacity ({vehicleCapacity} seats)</Text>
                                )}
                            </View>
                        );
                    })()}

                    {SEAT_TYPES.map(seat => (
                        <View key={seat.type} style={tw`flex-row items-center justify-between py-2`}>
                            <View style={tw`flex-row items-center flex-1`}>
                                <Ionicons name={seat.icon} size={18} color={colors.textSecondary} style={tw`mr-3`} />
                                <Text style={[tw`text-sm flex-1`, { color: colors.textPrimary }]}>{seat.label}</Text>
                            </View>
                            <View style={tw`flex-row items-center gap-2`}>
                                <TouchableOpacity
                                    onPress={() => setSeatCounts(prev => ({ ...prev, [seat.type]: Math.max(0, prev[seat.type] - 1) }))}
                                    disabled={seatCounts[seat.type] === 0}
                                    style={[tw`w-7 h-7 rounded-full items-center justify-center`,
                                        { backgroundColor: seatCounts[seat.type] === 0 ? colors.surfaceMuted : colors.border }]}>
                                    <Ionicons name="remove" size={15} color={seatCounts[seat.type] === 0 ? colors.textMuted : colors.textPrimary} />
                                </TouchableOpacity>
                                <Text style={[tw`text-sm font-semibold w-5 text-center`, { color: colors.textPrimary }]}>{seatCounts[seat.type]}</Text>
                                <TouchableOpacity
                                    onPress={() => { if (seatTotal < totalSeats) setSeatCounts(prev => ({ ...prev, [seat.type]: prev[seat.type] + 1 })); }}
                                    disabled={seatTotal >= totalSeats}
                                    style={[tw`w-7 h-7 rounded-full items-center justify-center`,
                                        { backgroundColor: seatTotal >= totalSeats ? colors.surfaceMuted : colors.primary }]}>
                                    <Ionicons name="add" size={15} color={seatTotal >= totalSeats ? colors.textMuted : 'white'} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}

                    <View style={[tw`mt-3 pt-3 border-t flex-row justify-between items-center`, { borderColor: colors.border }]}>
                        <Text style={[tw`text-xs`, { color: colors.textSecondary }]}>Allocated: {seatTotal} / {totalSeats}</Text>
                        {seatTotal < totalSeats && (
                            <Text style={[tw`text-xs font-medium`, { color: '#d97706' }]}>{totalSeats - seatTotal} seat{totalSeats - seatTotal > 1 ? 's' : ''} unassigned</Text>
                        )}
                        {seatTotal === totalSeats && (
                            <Text style={[tw`text-xs font-medium`, { color: colors.success }]}>✓ All seats assigned</Text>
                        )}
                    </View>
                </View>

                {/* ── Pricing ── */}
                <Text style={[tw`text-xs font-bold mb-2 uppercase`, { color: colors.textMuted }]}>Pricing</Text>
                <View style={[tw`rounded-xl border mb-5 overflow-hidden`, { borderColor: colors.border }]}>
                    <View style={[tw`p-4 flex-row items-center justify-between`, { backgroundColor: colors.successSoft }]}>
                        <View>
                            <Text style={[tw`text-xs font-bold mb-0.5 uppercase`, { color: colors.success }]}>Suggested Fare</Text>
                            <Text style={[tw`text-3xl font-bold`, { color: colors.textPrimary }]}>₹{recommendedFare.toLocaleString('en-IN')}</Text>
                            <Text style={[tw`text-xs mt-0.5`, { color: colors.textSecondary }]}>
                                {routeData.metrics.totalDistanceKm.toFixed(0)} km · ₹12/km + ₹30 base
                            </Text>
                        </View>
                        <View style={[tw`w-14 h-14 rounded-full items-center justify-center`, { backgroundColor: colors.successSoft }]}>
                            <Ionicons name="pricetag" size={26} color={colors.success} />
                        </View>
                    </View>
                    <View style={[tw`p-4`, { backgroundColor: colors.surface }]}>
                        <Text style={[tw`text-xs font-semibold mb-2 uppercase`, { color: colors.textMuted }]}>Adjust Amount</Text>
                        <View style={tw`flex-row items-center gap-2 mb-3`}>
                            <View style={[tw`flex-1 flex-row items-center rounded-lg border px-3`, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                                <Text style={[tw`text-base mr-1`, { color: colors.textMuted }]}>+₹</Text>
                                <TextInput
                                    value={extraFare}
                                    onChangeText={setExtraFare}
                                    placeholder="0"
                                    keyboardType="numeric"
                                    placeholderTextColor={colors.textMuted}
                                    style={[tw`flex-1 text-base font-semibold h-10`, { color: colors.textPrimary }]}
                                />
                                {extraFare !== '' && (
                                    <TouchableOpacity onPress={() => setExtraFare('')}>
                                        <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                                    </TouchableOpacity>
                                )}
                            </View>
                            {[50, 100, 200].map(amt => (
                                <TouchableOpacity key={amt}
                                    onPress={() => setExtraFare(String((Number(extraFare) || 0) + amt))}
                                    style={[tw`px-3 py-2 rounded-lg border`, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                                    <Text style={[tw`text-xs font-bold`, { color: colors.textSecondary }]}>+{amt}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <View style={[tw`flex-row items-center justify-between pt-3 border-t`, { borderColor: colors.border }]}>
                            <Text style={[tw`text-sm`, { color: colors.textSecondary }]}>Passengers will pay</Text>
                            <Text style={[tw`text-2xl font-bold`, { color: colors.primary }]}>
                                ₹{(recommendedFare + (Number(extraFare) || 0)).toLocaleString('en-IN')}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* ── Preferences ── */}
                <Text style={[tw`text-xs font-bold mb-2 uppercase`, { color: colors.textMuted }]}>Preferences</Text>
                <View style={tw`flex-row flex-wrap gap-3 mb-6`}>
                    {[
                        { label: "Pets Allowed", icon: "paw-outline", value: petsAllowed, setter: setPetsAllowed },
                        { label: "No Smoking", icon: "ban-outline", value: smokingAllowed, setter: setSmokingAllowed },
                        { label: "Luggage Space", icon: "briefcase-outline", value: luggageSpace, setter: setLuggageSpace },
                    ].map((item, idx) => (
                        <TouchableOpacity key={idx} activeOpacity={0.8} onPress={() => item.setter(!item.value)}
                            style={[tw`flex-row items-center px-4 py-2 rounded-full`,
                                { backgroundColor: item.value ? colors.primary : colors.surfaceMuted }]}>
                            <Ionicons name={item.icon} size={16} color={item.value ? "white" : colors.textSecondary} style={tw`mr-2`} />
                            <Text style={[tw`text-sm font-medium`, { color: item.value ? "white" : colors.textSecondary }]}>{item.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* ── Validation & Publish ── */}
                {errors.length > 0 && (
                    <View style={[tw`rounded-xl p-3 mb-3 gap-1 border`, { backgroundColor: colors.dangerSoft || '#fee2e2', borderColor: colors.danger }]}>
                        {errors.map((err, i) => (
                            <View key={i} style={tw`flex-row items-center gap-2`}>
                                <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
                                <Text style={[tw`text-sm flex-1`, { color: colors.danger }]}>{err}</Text>
                            </View>
                        ))}
                    </View>
                )}

                <TouchableOpacity
                    onPress={handlePublish}
                    disabled={isPublishing || !canPublish}
                    style={[tw`py-4 rounded-xl items-center`,
                        canPublish ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceMuted },
                        isPublishing && tw`opacity-70`]}>
                    {isPublishing
                        ? <ActivityIndicator color="white" />
                        : <Text style={[tw`font-bold text-lg`, { color: canPublish ? 'white' : colors.textMuted }]}>Publish Ride</Text>}
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}
