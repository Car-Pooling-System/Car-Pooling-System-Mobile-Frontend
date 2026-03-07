import {
    View, Text, ScrollView, TouchableOpacity, Image,
    useColorScheme, Linking, Alert, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import tw from "twrnc";
import { theme } from "../../../constants/Colors";

export default function DriverDetails() {
    const params = useLocalSearchParams();
    const router = useRouter();
    const scheme = useColorScheme();
    const colors = theme[scheme ?? "light"];

    const {
        driverName,
        driverImage,
        driverRating,
        driverReviews,
        driverRidesHosted,
        driverRidesCompleted,
        driverTrustScore,
        driverPhone,
        driverHoursDriven,
        driverDistanceKm,
        isVerified: isVerifiedParam,
        verEmail, verPhone, verLicense, verVehicle,
    } = params;

    const isVerified = isVerifiedParam === "1";
    const rating = parseFloat(driverRating) || 0;
    const reviews = parseInt(driverReviews) || 0;
    const ridesHosted = parseInt(driverRidesHosted) || 0;
    const ridesCompleted = parseInt(driverRidesCompleted) || 0;
    const trustScore = parseInt(driverTrustScore) || 0;
    const hoursDriven = parseFloat(driverHoursDriven) || 0;
    const distanceKm = parseFloat(driverDistanceKm) || 0;

    const handleCall = () => {
        if (!driverPhone) {
            Alert.alert("Unavailable", "Driver's phone number is not available.");
            return;
        }
        const url = Platform.OS === "ios"
            ? `telprompt:${driverPhone}`
            : `tel:${driverPhone}`;
        Linking.canOpenURL(url)
            .then((supported) => {
                if (supported) Linking.openURL(url);
                else Alert.alert("Error", "Unable to make a call on this device.");
            })
            .catch(() => Alert.alert("Error", "Failed to open dialer."));
    };

    const handleSMS = () => {
        if (!driverPhone) {
            Alert.alert("Unavailable", "Driver's phone number is not available.");
            return;
        }
        const url = `sms:${driverPhone}`;
        Linking.openURL(url).catch(() =>
            Alert.alert("Error", "Failed to open messaging app.")
        );
    };

    /* Trust score color */
    const trustColor = trustScore >= 80
        ? colors.success
        : trustScore >= 50
            ? "#f59e0b"
            : "#ef4444";

    const trustLabel = trustScore >= 80
        ? "Excellent"
        : trustScore >= 50
            ? "Good"
            : "Low";

    return (
        <View style={[tw`flex-1`, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View
                style={[
                    tw`pt-12 pb-4 px-5 flex-row items-center`,
                    { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
            >
                <TouchableOpacity onPress={() => router.back()} style={tw`mr-4`}>
                    <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={[tw`text-lg font-bold flex-1`, { color: colors.textPrimary }]}>Driver Profile</Text>
            </View>

            <ScrollView contentContainerStyle={tw`pb-20`} showsVerticalScrollIndicator={false}>
                {/* Profile Hero */}
                <View style={[tw`items-center pt-8 pb-6 px-5`, { backgroundColor: colors.surface }]}>
                    <View style={tw`relative`}>
                        {driverImage ? (
                            <Image
                                source={{ uri: driverImage }}
                                style={tw`w-24 h-24 rounded-full bg-gray-100`}
                            />
                        ) : (
                            <View
                                style={[
                                    tw`w-24 h-24 rounded-full items-center justify-center`,
                                    { backgroundColor: colors.surfaceMuted },
                                ]}
                            >
                                <Ionicons name="person" size={40} color={colors.textMuted} />
                            </View>
                        )}
                        {isVerified && (
                            <View
                                style={[
                                    tw`absolute -bottom-1 -right-1 w-7 h-7 rounded-full items-center justify-center border-2 border-white`,
                                    { backgroundColor: colors.success },
                                ]}
                            >
                                <Ionicons name="checkmark" size={14} color="white" />
                            </View>
                        )}
                    </View>

                    <Text style={[tw`text-xl font-bold mt-3`, { color: colors.textPrimary }]}>
                        {driverName || "Driver"}
                    </Text>

                    {/* Rating */}
                    <View style={tw`flex-row items-center gap-1.5 mt-2`}>
                        <Ionicons name="star" size={16} color="#f59e0b" />
                        <Text style={[tw`text-base font-bold`, { color: colors.textPrimary }]}>
                            {rating > 0 ? rating.toFixed(1) : "—"}
                        </Text>
                        {reviews > 0 && (
                            <Text style={[tw`text-sm`, { color: colors.textMuted }]}>
                                ({reviews} review{reviews !== 1 ? "s" : ""})
                            </Text>
                        )}
                    </View>

                    {/* Verified badge */}
                    <View
                        style={[
                            tw`flex-row items-center gap-1.5 mt-2 px-3 py-1.5 rounded-full`,
                            { backgroundColor: isVerified ? colors.successSoft : colors.dangerSoft },
                        ]}
                    >
                        <Ionicons
                            name={isVerified ? "shield-checkmark" : "shield-outline"}
                            size={13}
                            color={isVerified ? colors.success : colors.danger}
                        />
                        <Text
                            style={[
                                tw`text-xs font-bold`,
                                { color: isVerified ? colors.success : colors.danger },
                            ]}
                        >
                            {isVerified ? "Fully Verified" : "Not Fully Verified"}
                        </Text>
                    </View>
                </View>

                {/* Contact Actions */}
                <View style={tw`flex-row justify-center gap-4 px-5 mt-4`}>
                    <TouchableOpacity
                        onPress={handleCall}
                        style={[
                            tw`flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-2xl`,
                            { backgroundColor: colors.primary },
                        ]}
                    >
                        <Ionicons name="call" size={18} color="white" />
                        <Text style={tw`text-sm font-bold text-white`}>Call</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={handleSMS}
                        style={[
                            tw`flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-2xl border`,
                            { borderColor: colors.primary, backgroundColor: colors.primarySoft },
                        ]}
                    >
                        <Ionicons name="chatbubble" size={18} color={colors.primary} />
                        <Text style={[tw`text-sm font-bold`, { color: colors.primary }]}>Message</Text>
                    </TouchableOpacity>
                </View>

                {/* Trust Score */}
                <View
                    style={[
                        tw`mx-5 mt-4 rounded-2xl p-5`,
                        { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                    ]}
                >
                    <Text
                        style={[tw`text-xs font-extrabold tracking-widest mb-3`, { color: colors.textSecondary }]}
                    >
                        TRUST SCORE
                    </Text>
                    <View style={tw`flex-row items-center gap-4`}>
                        <View
                            style={[
                                tw`w-16 h-16 rounded-full items-center justify-center border-4`,
                                { borderColor: trustColor },
                            ]}
                        >
                            <Text style={[tw`text-lg font-extrabold`, { color: trustColor }]}>
                                {trustScore}
                            </Text>
                        </View>
                        <View style={tw`flex-1`}>
                            <Text style={[tw`text-base font-bold`, { color: trustColor }]}>
                                {trustLabel}
                            </Text>
                            <Text style={[tw`text-xs mt-1`, { color: colors.textMuted }]}>
                                Based on ride history, ratings, and verification status
                            </Text>
                        </View>
                    </View>

                    {/* Trust bar */}
                    <View style={[tw`mt-3 h-2 rounded-full`, { backgroundColor: colors.surfaceMuted }]}>
                        <View
                            style={[
                                tw`h-2 rounded-full`,
                                { width: `${Math.min(trustScore, 100)}%`, backgroundColor: trustColor },
                            ]}
                        />
                    </View>
                </View>

                {/* Stats Grid */}
                <View
                    style={[
                        tw`mx-5 mt-4 rounded-2xl p-5`,
                        { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                    ]}
                >
                    <Text
                        style={[tw`text-xs font-extrabold tracking-widest mb-4`, { color: colors.textSecondary }]}
                    >
                        DRIVER STATS
                    </Text>

                    <View style={tw`flex-row flex-wrap`}>
                        {/* Rides Hosted */}
                        <View style={tw`w-1/2 items-center mb-5`}>
                            <View
                                style={[
                                    tw`w-10 h-10 rounded-full items-center justify-center mb-2`,
                                    { backgroundColor: colors.primarySoft },
                                ]}
                            >
                                <Ionicons name="car" size={18} color={colors.primary} />
                            </View>
                            <Text style={[tw`text-lg font-bold`, { color: colors.textPrimary }]}>{ridesHosted}</Text>
                            <Text style={[tw`text-xs`, { color: colors.textMuted }]}>Rides Hosted</Text>
                        </View>

                        {/* Rides Completed */}
                        <View style={tw`w-1/2 items-center mb-5`}>
                            <View
                                style={[
                                    tw`w-10 h-10 rounded-full items-center justify-center mb-2`,
                                    { backgroundColor: colors.successSoft },
                                ]}
                            >
                                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                            </View>
                            <Text style={[tw`text-lg font-bold`, { color: colors.textPrimary }]}>{ridesCompleted}</Text>
                            <Text style={[tw`text-xs`, { color: colors.textMuted }]}>Completed</Text>
                        </View>

                        {/* Hours Driven */}
                        <View style={tw`w-1/2 items-center mb-5`}>
                            <View
                                style={[
                                    tw`w-10 h-10 rounded-full items-center justify-center mb-2`,
                                    { backgroundColor: "rgba(245,158,11,0.12)" },
                                ]}
                            >
                                <Ionicons name="time" size={18} color="#f59e0b" />
                            </View>
                            <Text style={[tw`text-lg font-bold`, { color: colors.textPrimary }]}>
                                {hoursDriven > 0 ? `${Math.round(hoursDriven)}h` : "—"}
                            </Text>
                            <Text style={[tw`text-xs`, { color: colors.textMuted }]}>Hours Driven</Text>
                        </View>

                        {/* Distance */}
                        <View style={tw`w-1/2 items-center mb-5`}>
                            <View
                                style={[
                                    tw`w-10 h-10 rounded-full items-center justify-center mb-2`,
                                    { backgroundColor: "rgba(139,92,246,0.12)" },
                                ]}
                            >
                                <Ionicons name="speedometer" size={18} color="#8b5cf6" />
                            </View>
                            <Text style={[tw`text-lg font-bold`, { color: colors.textPrimary }]}>
                                {distanceKm > 0 ? `${Math.round(distanceKm)}` : "—"}
                            </Text>
                            <Text style={[tw`text-xs`, { color: colors.textMuted }]}>km Driven</Text>
                        </View>
                    </View>
                </View>

                {/* Verification Details */}
                <View
                    style={[
                        tw`mx-5 mt-4 rounded-2xl p-5`,
                        { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                    ]}
                >
                    <Text
                        style={[tw`text-xs font-extrabold tracking-widest mb-4`, { color: colors.textSecondary }]}
                    >
                        VERIFICATION STATUS
                    </Text>

                    {[
                        { label: "Email", verified: verEmail === "1", icon: "mail" },
                        { label: "Phone", verified: verPhone === "1", icon: "call" },
                        { label: "Driving License", verified: verLicense === "1", icon: "document-text" },
                        { label: "Vehicle", verified: verVehicle === "1", icon: "car-sport" },
                    ].map((item, i) => (
                        <View
                            key={i}
                            style={[
                                tw`flex-row items-center py-3`,
                                i !== 3 && { borderBottomWidth: 1, borderBottomColor: colors.borderLight || colors.border },
                            ]}
                        >
                            <View
                                style={[
                                    tw`w-9 h-9 rounded-full items-center justify-center mr-3`,
                                    {
                                        backgroundColor: item.verified
                                            ? colors.successSoft
                                            : colors.dangerSoft || "rgba(239,68,68,0.08)",
                                    },
                                ]}
                            >
                                <Ionicons
                                    name={item.icon}
                                    size={16}
                                    color={item.verified ? colors.success : colors.danger || "#ef4444"}
                                />
                            </View>
                            <Text style={[tw`text-sm flex-1 font-semibold`, { color: colors.textPrimary }]}>
                                {item.label}
                            </Text>
                            <View
                                style={[
                                    tw`flex-row items-center gap-1 px-2.5 py-1 rounded-full`,
                                    {
                                        backgroundColor: item.verified
                                            ? colors.successSoft
                                            : colors.dangerSoft || "rgba(239,68,68,0.08)",
                                    },
                                ]}
                            >
                                <Ionicons
                                    name={item.verified ? "checkmark-circle" : "close-circle"}
                                    size={12}
                                    color={item.verified ? colors.success : colors.danger || "#ef4444"}
                                />
                                <Text
                                    style={[
                                        tw`text-[10px] font-bold`,
                                        { color: item.verified ? colors.success : colors.danger || "#ef4444" },
                                    ]}
                                >
                                    {item.verified ? "Verified" : "Unverified"}
                                </Text>
                            </View>
                        </View>
                    ))}
                </View>

                {/* Contact Info */}
                {driverPhone ? (
                    <View
                        style={[
                            tw`mx-5 mt-4 rounded-2xl p-5`,
                            { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                        ]}
                    >
                        <Text
                            style={[tw`text-xs font-extrabold tracking-widest mb-3`, { color: colors.textSecondary }]}
                        >
                            CONTACT INFO
                        </Text>
                        <TouchableOpacity
                            onPress={handleCall}
                            style={tw`flex-row items-center gap-3 py-2`}
                        >
                            <View
                                style={[
                                    tw`w-9 h-9 rounded-full items-center justify-center`,
                                    { backgroundColor: colors.primarySoft },
                                ]}
                            >
                                <Ionicons name="call" size={16} color={colors.primary} />
                            </View>
                            <View style={tw`flex-1`}>
                                <Text style={[tw`text-sm font-semibold`, { color: colors.textPrimary }]}>
                                    {driverPhone}
                                </Text>
                                <Text style={[tw`text-xs`, { color: colors.textMuted }]}>Phone</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                        </TouchableOpacity>
                    </View>
                ) : null}
            </ScrollView>
        </View>
    );
}
