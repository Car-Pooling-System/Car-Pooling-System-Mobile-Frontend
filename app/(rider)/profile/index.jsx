import { View, Text, TouchableOpacity, Image, ScrollView, Alert, useColorScheme, ActivityIndicator, TextInput, Modal } from "react-native";
import { useUser, useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useState, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import tw from "twrnc";
import { theme } from "../../../constants/Colors";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function RiderProfile() {
    const { user } = useUser();
    const { signOut } = useAuth();
    const router = useRouter();
    const scheme = useColorScheme();
    const colors = theme[scheme ?? "light"];
    const [loading, setLoading] = useState(false);
    const [riderVerification, setRiderVerification] = useState({ aadharVerified: false });
    const [aadharVerifying, setAadharVerifying] = useState(false);

    // Emergency contacts state
    const [emergencyContacts, setEmergencyContacts] = useState([
        { name: "", email: "", phone: "" },
        { name: "", email: "", phone: "" },
        { name: "", email: "", phone: "" },
    ]);
    const [savingContacts, setSavingContacts] = useState(false);
    const [hasSosCode, setHasSosCode] = useState(false);
    const [showSosCodeModal, setShowSosCodeModal] = useState(false);
    const [sosCode, setSosCode] = useState("");
    const [sosCodeConfirm, setSosCodeConfirm] = useState("");
    const [savingSosCode, setSavingSosCode] = useState(false);

    const fetchRiderVerification = async () => {
        if (!user?.id || !BACKEND_URL) return;
        try {
            const res = await fetch(`${BACKEND_URL}/api/rider/rider-verification/${user.id}`);
            if (res.ok) setRiderVerification(await res.json());
        } catch (e) { /* silent */ }
    };

    const fetchEmergencyData = async () => {
        if (!user?.id || !BACKEND_URL) return;
        try {
            const res = await fetch(`${BACKEND_URL}/api/rider/emergency/${user.id}`);
            if (res.ok) {
                const data = await res.json();
                if (data.emergencyContacts?.length > 0) {
                    const padded = [...data.emergencyContacts];
                    while (padded.length < 3) padded.push({ name: "", email: "", phone: "" });
                    setEmergencyContacts(padded.slice(0, 3));
                }
                setHasSosCode(data.hasSosCode || false);
            }
        } catch (e) { /* silent */ }
    };

    useEffect(() => {
        fetchRiderVerification();
        fetchEmergencyData();
    }, [user?.id]);

    const handleSaveContacts = async () => {
        const validContacts = emergencyContacts.filter(c => c.email && c.email.includes("@"));
        if (validContacts.length === 0) {
            Alert.alert("Error", "Please add at least one contact with a valid email.");
            return;
        }
        setSavingContacts(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/rider/emergency/${user.id}/contacts`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contacts: validContacts }),
            });
            const data = await res.json();
            if (res.ok) {
                Alert.alert("✅ Saved", `${validContacts.length} emergency contact(s) saved.`);
            } else {
                Alert.alert("Error", data.message || "Failed to save");
            }
        } catch (e) {
            Alert.alert("Error", "Failed to save contacts");
        } finally {
            setSavingContacts(false);
        }
    };

    const handleSaveSosCode = async () => {
        if (!sosCode || sosCode.length < 4) {
            Alert.alert("Error", "Secret code must be at least 4 characters.");
            return;
        }
        if (sosCode !== sosCodeConfirm) {
            Alert.alert("Error", "Codes don't match. Please try again.");
            return;
        }
        setSavingSosCode(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/rider/emergency/${user.id}/sos-code`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: sosCode }),
            });
            if (res.ok) {
                setHasSosCode(true);
                setShowSosCodeModal(false);
                setSosCode("");
                setSosCodeConfirm("");
                Alert.alert("✅ Saved", "SOS secret code has been set. Enter this code to cancel an SOS alert.");
            } else {
                const data = await res.json();
                Alert.alert("Error", data.message || "Failed to save");
            }
        } catch (e) {
            Alert.alert("Error", "Failed to save code");
        } finally {
            setSavingSosCode(false);
        }
    };

    const updateContact = (index, field, value) => {
        setEmergencyContacts(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    };

    const handleMockVerifyAadhar = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: '*/*',
                copyToCacheDirectory: false,
            });
            if (result.canceled || !result.assets?.length) return;

            setAadharVerifying(true);
            // Mock: 1.5 s simulated verification — always passes
            await new Promise(r => setTimeout(r, 1500));

            const res = await fetch(`${BACKEND_URL}/api/rider/rider-verification/${user.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ aadharVerified: true }),
            });
            if (res.ok) {
                setRiderVerification(prev => ({ ...prev, aadharVerified: true }));
                Alert.alert('Aadhaar Verified ✓', 'Your Aadhaar has been verified successfully!');
            }
        } catch (e) {
            Alert.alert('Error', 'Verification failed. Please try again.');
        } finally {
            setAadharVerifying(false);
        }
    };

    const handleSwitchToDriver = async () => {
        Alert.alert(
            "Switch to Driver",
            "This will switch your account to driver mode.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Switch",
                    onPress: async () => {
                        try {
                            setLoading(true);
                            await user.update({
                                unsafeMetadata: { ...user.unsafeMetadata, role: "driver" },
                            });
                            router.replace("/(app)/my-rides");
                        } catch (e) {
                            Alert.alert("Error", "Could not switch role.");
                        } finally {
                            setLoading(false);
                        }
                    },
                },
            ]
        );
    };

    const handleSignOut = async () => {
        Alert.alert("Sign Out", "Are you sure you want to sign out?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Sign Out",
                style: "destructive",
                onPress: async () => {
                    try {
                        setLoading(true);
                        await signOut();
                        router.replace("/(auth)/sign-in");
                    } catch (e) {
                        console.error("Sign out error:", e);
                    } finally {
                        setLoading(false);
                    }
                },
            },
        ]);
    };

    return (
        <ScrollView style={[tw`flex-1`, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[tw`pt-12 pb-6 px-6 items-center`, { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                <Image
                    source={{ uri: user?.imageUrl || "https://ui-avatars.com/api/?name=Rider" }}
                    style={tw`w-20 h-20 rounded-full mb-3`}
                />
                <Text style={[tw`text-xl font-extrabold`, { color: colors.textPrimary }]}>
                    {user?.fullName || user?.firstName || "Rider"}
                </Text>
                <Text style={[tw`text-sm mt-1`, { color: colors.textSecondary }]}>
                    {user?.primaryEmailAddress?.emailAddress}
                </Text>
                <View style={[tw`mt-2 px-3 py-1 rounded-full`, { backgroundColor: colors.primarySoft }]}>
                    <Text style={[tw`text-xs font-bold`, { color: colors.primary }]}>Rider</Text>
                </View>
            </View>

            {loading && (
                <View style={tw`items-center py-6`}>
                    <ActivityIndicator size="small" color={colors.primary} />
                </View>
            )}

            {/* Verification Status */}
            <View style={[tw`mx-6 mt-6 rounded-2xl overflow-hidden`, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                <View style={[tw`px-4 py-3 flex-row items-center`, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                    <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
                    <Text style={[tw`text-base font-bold ml-2`, { color: colors.textPrimary }]}>Verification Status</Text>
                </View>

                <View style={tw`px-4 py-1`}>
                    {/* Email - always verified */}
                    <View style={tw`flex-row justify-between items-center py-3 border-b`} >
                        <Text style={[tw`text-sm`, { color: colors.textPrimary }]}>Email</Text>
                        <View style={tw`flex-row items-center gap-1 bg-green-100 px-3 py-1 rounded-full`}>
                            <Ionicons name="checkmark-circle" size={11} color="#15803d" />
                            <Text style={tw`text-xs font-semibold text-green-700`}>Verified</Text>
                        </View>
                    </View>

                    {/* Aadhaar */}
                    <View style={tw`flex-row justify-between items-center py-3`}>
                        <View>
                            <Text style={[tw`text-sm font-medium`, { color: colors.textPrimary }]}>Aadhaar</Text>
                            <Text style={[tw`text-xs mt-0.5`, { color: colors.textMuted }]}>Government ID document</Text>
                        </View>
                        {riderVerification.aadharVerified ? (
                            <View style={tw`flex-row items-center gap-1 bg-green-100 px-3 py-1 rounded-full`}>
                                <Ionicons name="checkmark-circle" size={11} color="#15803d" />
                                <Text style={tw`text-xs font-semibold text-green-700`}>Verified</Text>
                            </View>
                        ) : aadharVerifying ? (
                            <View style={tw`flex-row items-center gap-2`}>
                                <ActivityIndicator size="small" color={colors.primary} />
                                <Text style={[tw`text-xs`, { color: colors.textSecondary }]}>Verifying...</Text>
                            </View>
                        ) : (
                            <TouchableOpacity
                                onPress={handleMockVerifyAadhar}
                                style={[tw`flex-row items-center gap-1 px-3 py-1.5 rounded-xl`, { backgroundColor: colors.primarySoft }]}
                            >
                                <Ionicons name="cloud-upload-outline" size={12} color={colors.primary} />
                                <Text style={[tw`text-xs font-bold`, { color: colors.primary }]}>Upload & Verify</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </View>

            {/* Switch to Driver */}
            <View style={[tw`mx-6 mt-6 rounded-2xl overflow-hidden`, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                <TouchableOpacity
                    onPress={handleSwitchToDriver}
                    disabled={loading}
                    style={tw`flex-row items-center px-4 py-4`}
                >
                    <View style={[tw`w-10 h-10 rounded-xl items-center justify-center mr-4`, { backgroundColor: colors.primarySoft }]}>
                        <Ionicons name="car" size={20} color={colors.primary} />
                    </View>
                    <View style={tw`flex-1`}>
                        <Text style={[tw`font-semibold text-base`, { color: colors.textPrimary }]}>Switch to Driver</Text>
                        <Text style={[tw`text-xs mt-0.5`, { color: colors.textSecondary }]}>Start offering rides</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
            </View>

            {/* ═══════ Emergency Contacts ═══════ */}
            <View style={[tw`mx-6 mt-6 rounded-2xl overflow-hidden`, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                <View style={[tw`px-4 py-3 flex-row items-center`, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                    <Ionicons name="call" size={18} color="#dc2626" />
                    <Text style={[tw`text-base font-bold ml-2`, { color: colors.textPrimary }]}>Emergency Contacts</Text>
                    <Text style={[tw`text-[10px] ml-2 px-2 py-0.5 rounded-full font-bold`, { backgroundColor: "#fef2f2", color: "#dc2626" }]}>SOS</Text>
                </View>

                <View style={tw`px-4 py-3`}>
                    <Text style={[tw`text-xs mb-3`, { color: colors.textSecondary }]}>
                        These contacts will be emailed when you trigger an SOS alert during a ride.
                    </Text>

                    {emergencyContacts.map((contact, idx) => (
                        <View key={idx} style={[tw`mb-3 rounded-xl p-3`, { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border }]}>
                            <Text style={[tw`text-[10px] font-bold mb-2`, { color: colors.textMuted }]}>CONTACT {idx + 1}</Text>
                            <TextInput
                                placeholder="Name"
                                value={contact.name}
                                onChangeText={(v) => updateContact(idx, "name", v)}
                                style={[tw`text-sm py-2 px-3 rounded-lg mb-2`, { backgroundColor: colors.surface, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border }]}
                                placeholderTextColor={colors.textMuted}
                            />
                            <TextInput
                                placeholder="Email *"
                                value={contact.email}
                                onChangeText={(v) => updateContact(idx, "email", v)}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                style={[tw`text-sm py-2 px-3 rounded-lg mb-2`, { backgroundColor: colors.surface, color: colors.textPrimary, borderWidth: 1, borderColor: contact.email && !contact.email.includes("@") ? "#dc2626" : colors.border }]}
                                placeholderTextColor={colors.textMuted}
                            />
                            <TextInput
                                placeholder="Phone (optional)"
                                value={contact.phone}
                                onChangeText={(v) => updateContact(idx, "phone", v)}
                                keyboardType="phone-pad"
                                style={[tw`text-sm py-2 px-3 rounded-lg`, { backgroundColor: colors.surface, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border }]}
                                placeholderTextColor={colors.textMuted}
                            />
                        </View>
                    ))}

                    <TouchableOpacity
                        onPress={handleSaveContacts}
                        disabled={savingContacts}
                        style={[tw`py-3 rounded-xl items-center`, { backgroundColor: "#dc2626" }, savingContacts && tw`opacity-50`]}
                    >
                        {savingContacts ? (
                            <ActivityIndicator size="small" color="white" />
                        ) : (
                            <View style={tw`flex-row items-center gap-2`}>
                                <Ionicons name="save" size={16} color="white" />
                                <Text style={tw`text-white font-bold`}>Save Emergency Contacts</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>
            </View>

            {/* ═══════ SOS Secret Code ═══════ */}
            <View style={[tw`mx-6 mt-4 rounded-2xl overflow-hidden`, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                <TouchableOpacity
                    onPress={() => setShowSosCodeModal(true)}
                    style={tw`flex-row items-center px-4 py-4`}
                >
                    <View style={[tw`w-10 h-10 rounded-xl items-center justify-center mr-4`, { backgroundColor: "#fef2f2" }]}>
                        <Ionicons name="key" size={20} color="#dc2626" />
                    </View>
                    <View style={tw`flex-1`}>
                        <Text style={[tw`font-semibold text-base`, { color: colors.textPrimary }]}>SOS Secret Code</Text>
                        <Text style={[tw`text-xs mt-0.5`, { color: colors.textSecondary }]}>
                            {hasSosCode ? "Code is set ✓ — tap to change" : "Set a code to cancel SOS alerts"}
                        </Text>
                    </View>
                    <View style={tw`flex-row items-center gap-1`}>
                        {hasSosCode && <Ionicons name="checkmark-circle" size={16} color="#059669" />}
                        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                    </View>
                </TouchableOpacity>
            </View>

            {/* Sign Out */}
            <View style={tw`mx-6 mt-4 mb-10`}>
                <TouchableOpacity
                    onPress={handleSignOut}
                    disabled={loading}
                    style={[tw`flex-row items-center justify-center py-4 rounded-2xl`, { backgroundColor: colors.danger }]}
                >
                    <Ionicons name="log-out-outline" size={22} color="white" style={tw`mr-2`} />
                    <Text style={tw`text-white font-bold text-base`}>Sign Out</Text>
                </TouchableOpacity>
            </View>

            {/* ═══════ SOS Secret Code Modal ═══════ */}
            <Modal visible={showSosCodeModal} transparent animationType="slide" onRequestClose={() => setShowSosCodeModal(false)}>
                <View style={[tw`flex-1 justify-end`, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
                    <TouchableOpacity style={tw`flex-1`} activeOpacity={1} onPress={() => setShowSosCodeModal(false)} />
                    <View style={[tw`rounded-t-3xl px-6 pt-5 pb-8`, { backgroundColor: colors.surface }]}>
                        <View style={[tw`w-10 h-1 rounded-full self-center mb-5`, { backgroundColor: colors.border }]} />

                        <View style={tw`items-center mb-5`}>
                            <View style={[tw`w-14 h-14 rounded-full items-center justify-center mb-3`, { backgroundColor: "#fef2f2" }]}>
                                <Ionicons name="key" size={28} color="#dc2626" />
                            </View>
                            <Text style={[tw`text-lg font-bold`, { color: colors.textPrimary }]}>Set SOS Secret Code</Text>
                            <Text style={[tw`text-xs mt-1 text-center`, { color: colors.textSecondary }]}>
                                When SOS is triggered, enter this code within the time limit to cancel the alert. If not entered, emergency emails are sent.
                            </Text>
                        </View>

                        <Text style={[tw`text-xs font-bold mb-1 ml-1`, { color: colors.textSecondary }]}>SECRET CODE</Text>
                        <TextInput
                            value={sosCode}
                            onChangeText={setSosCode}
                            secureTextEntry
                            placeholder="Enter secret code (min 4 chars)"
                            placeholderTextColor={colors.textMuted}
                            style={[tw`text-base py-3 px-4 rounded-xl border mb-3`, {
                                color: colors.textPrimary,
                                backgroundColor: colors.surfaceMuted,
                                borderColor: colors.border,
                            }]}
                        />

                        <Text style={[tw`text-xs font-bold mb-1 ml-1`, { color: colors.textSecondary }]}>CONFIRM CODE</Text>
                        <TextInput
                            value={sosCodeConfirm}
                            onChangeText={setSosCodeConfirm}
                            secureTextEntry
                            placeholder="Re-enter secret code"
                            placeholderTextColor={colors.textMuted}
                            style={[tw`text-base py-3 px-4 rounded-xl border mb-5`, {
                                color: colors.textPrimary,
                                backgroundColor: colors.surfaceMuted,
                                borderColor: sosCodeConfirm && sosCode !== sosCodeConfirm ? "#dc2626" : colors.border,
                            }]}
                        />

                        <TouchableOpacity
                            onPress={handleSaveSosCode}
                            disabled={savingSosCode || !sosCode || sosCode.length < 4}
                            style={[tw`py-4 rounded-xl items-center`, { backgroundColor: "#dc2626" }, (savingSosCode || !sosCode || sosCode.length < 4) && tw`opacity-50`]}
                        >
                            {savingSosCode ? (
                                <ActivityIndicator size="small" color="white" />
                            ) : (
                                <Text style={tw`text-white font-bold text-base`}>Save Secret Code</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </ScrollView>
    );
}
