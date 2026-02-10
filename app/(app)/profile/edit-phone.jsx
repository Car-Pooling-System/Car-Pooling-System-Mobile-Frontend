import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import tw from "twrnc";
import { useUser } from "@clerk/clerk-expo";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function EditPhoneNumber() {
    const router = useRouter();
    const { user } = useUser();
    const params = useLocalSearchParams();

    const currentPhone = params.currentPhone || "";
    const [phoneNumber, setPhoneNumber] = useState(currentPhone);
    const [loading, setLoading] = useState(false);
    const [verificationSent, setVerificationSent] = useState(false);
    const [verificationCode, setVerificationCode] = useState("");
    const [verifying, setVerifying] = useState(false);

    const formatPhoneNumber = (text) => {
        // Remove all non-numeric characters
        const cleaned = text.replace(/\D/g, '');

        // Format as needed (e.g., +1 234 567 8900)
        if (cleaned.length <= 3) {
            return cleaned;
        } else if (cleaned.length <= 6) {
            return `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`;
        } else if (cleaned.length <= 10) {
            return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
        }
        return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6, 10)}`;
    };

    const sendVerificationCode = async () => {
        if (!phoneNumber || phoneNumber.replace(/\D/g, '').length < 10) {
            Alert.alert("Error", "Please enter a valid phone number");
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(`${BACKEND_URL}/api/phone-verification/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: user.id,
                    phoneNumber: phoneNumber.replace(/\D/g, '')
                })
            });

            if (!response.ok) {
                throw new Error('Failed to send verification code');
            }

            setVerificationSent(true);
            Alert.alert("Success", "Verification code sent to your phone");
        } catch (error) {
            console.error("Error sending verification code:", error);
            Alert.alert("Error", "Failed to send verification code. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const verifyCode = async () => {
        if (!verificationCode || verificationCode.length < 4) {
            Alert.alert("Error", "Please enter the verification code");
            return;
        }

        setVerifying(true);
        try {
            const response = await fetch(`${BACKEND_URL}/api/phone-verification/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: user.id,
                    phoneNumber: phoneNumber.replace(/\D/g, ''),
                    code: verificationCode
                })
            });

            if (!response.ok) {
                throw new Error('Invalid verification code');
            }

            Alert.alert("Success", "Phone number updated and verified successfully", [
                { text: "OK", onPress: () => router.back() }
            ]);
        } catch (error) {
            console.error("Error verifying code:", error);
            Alert.alert("Error", "Invalid verification code. Please try again.");
        } finally {
            setVerifying(false);
        }
    };

    const handleSaveWithoutVerification = async () => {
        if (!phoneNumber || phoneNumber.replace(/\D/g, '').length < 10) {
            Alert.alert("Error", "Please enter a valid phone number");
            return;
        }

        Alert.alert(
            "Skip Verification?",
            "You can save the phone number without verification, but it won't be verified. Continue?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Save Anyway",
                    onPress: async () => {
                        setLoading(true);
                        try {
                            const response = await fetch(`${BACKEND_URL}/api/driver-profile/${user.id}`, {
                                method: 'PUT',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    phoneNumber: phoneNumber.replace(/\D/g, '')
                                })
                            });

                            if (!response.ok) {
                                throw new Error('Failed to update phone number');
                            }

                            Alert.alert("Success", "Phone number updated (unverified)", [
                                { text: "OK", onPress: () => router.back() }
                            ]);
                        } catch (error) {
                            console.error("Error updating phone number:", error);
                            Alert.alert("Error", "Failed to update phone number");
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    return (
        <KeyboardAvoidingView
            style={tw`flex-1 bg-gray-50`}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            {/* Header */}
            <View style={tw`bg-white px-4 pt-12 pb-4 shadow-sm`}>
                <View style={tw`flex-row items-center`}>
                    <TouchableOpacity onPress={() => router.back()} style={tw`mr-4`}>
                        <Ionicons name="arrow-back" size={24} color="#000" />
                    </TouchableOpacity>
                    <Text style={tw`text-xl font-bold flex-1`}>Edit Phone Number</Text>
                </View>
            </View>

            <View style={tw`flex-1 p-6`}>
                {!verificationSent ? (
                    <>
                        {/* Phone Number Input */}
                        <View style={tw`bg-white rounded-xl p-6 shadow-sm mb-4`}>
                            <View style={tw`flex-row items-center mb-4`}>
                                <View style={tw`bg-blue-100 p-3 rounded-full mr-4`}>
                                    <Ionicons name="call" size={24} color="#3b82f6" />
                                </View>
                                <View style={tw`flex-1`}>
                                    <Text style={tw`text-lg font-bold`}>Phone Number</Text>
                                    <Text style={tw`text-gray-600 text-sm`}>We'll send a verification code</Text>
                                </View>
                            </View>

                            <View style={tw`flex-row items-center bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-4`}>
                                <Text style={tw`text-lg font-semibold text-gray-700 mr-2`}>+1</Text>
                                <TextInput
                                    style={tw`flex-1 text-lg`}
                                    value={phoneNumber}
                                    onChangeText={(text) => setPhoneNumber(formatPhoneNumber(text))}
                                    placeholder="234 567 8900"
                                    keyboardType="phone-pad"
                                    maxLength={12}
                                />
                            </View>

                            <Text style={tw`text-gray-500 text-xs mb-4`}>
                                Enter the 10-digit phone number you want to use
                            </Text>

                            {/* Send Code Button */}
                            <TouchableOpacity
                                onPress={sendVerificationCode}
                                disabled={loading}
                                style={tw`bg-blue-500 py-4 rounded-lg flex-row items-center justify-center mb-3`}
                            >
                                {loading ? (
                                    <ActivityIndicator size="small" color="white" />
                                ) : (
                                    <>
                                        <Ionicons name="send" size={20} color="white" />
                                        <Text style={tw`text-white font-bold text-base ml-2`}>Send Verification Code</Text>
                                    </>
                                )}
                            </TouchableOpacity>

                            {/* Skip Verification Button */}
                            <TouchableOpacity
                                onPress={handleSaveWithoutVerification}
                                disabled={loading}
                                style={tw`border border-gray-300 py-4 rounded-lg items-center`}
                            >
                                <Text style={tw`text-gray-600 font-semibold`}>Save Without Verification</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Info Card */}
                        <View style={tw`bg-yellow-50 border border-yellow-200 p-4 rounded-xl flex-row`}>
                            <Ionicons name="information-circle" size={24} color="#f59e0b" style={tw`mr-3`} />
                            <View style={tw`flex-1`}>
                                <Text style={tw`text-yellow-900 font-semibold mb-1`}>Why verify?</Text>
                                <Text style={tw`text-yellow-800 text-sm`}>
                                    A verified phone number helps riders contact you easily and builds trust in the community.
                                </Text>
                            </View>
                        </View>
                    </>
                ) : (
                    <>
                        {/* Verification Code Input */}
                        <View style={tw`bg-white rounded-xl p-6 shadow-sm mb-4`}>
                            <View style={tw`items-center mb-6`}>
                                <View style={tw`bg-green-100 p-4 rounded-full mb-4`}>
                                    <Ionicons name="shield-checkmark" size={48} color="#10b981" />
                                </View>
                                <Text style={tw`text-xl font-bold mb-2`}>Enter Verification Code</Text>
                                <Text style={tw`text-gray-600 text-center`}>
                                    We sent a code to {phoneNumber}
                                </Text>
                            </View>

                            <TextInput
                                style={tw`bg-gray-50 border border-gray-200 rounded-lg px-4 py-4 text-center text-2xl font-bold tracking-widest mb-6`}
                                value={verificationCode}
                                onChangeText={setVerificationCode}
                                placeholder="Enter code"
                                keyboardType="number-pad"
                                maxLength={6}
                                autoFocus
                            />

                            {/* Verify Button */}
                            <TouchableOpacity
                                onPress={verifyCode}
                                disabled={verifying}
                                style={tw`bg-green-500 py-4 rounded-lg flex-row items-center justify-center mb-3`}
                            >
                                {verifying ? (
                                    <ActivityIndicator size="small" color="white" />
                                ) : (
                                    <>
                                        <Ionicons name="checkmark-circle" size={20} color="white" />
                                        <Text style={tw`text-white font-bold text-base ml-2`}>Verify & Save</Text>
                                    </>
                                )}
                            </TouchableOpacity>

                            {/* Resend Code */}
                            <TouchableOpacity
                                onPress={() => {
                                    setVerificationCode("");
                                    sendVerificationCode();
                                }}
                                style={tw`items-center py-2`}
                            >
                                <Text style={tw`text-blue-500 font-semibold`}>Resend Code</Text>
                            </TouchableOpacity>

                            {/* Change Number */}
                            <TouchableOpacity
                                onPress={() => {
                                    setVerificationSent(false);
                                    setVerificationCode("");
                                }}
                                style={tw`items-center py-2 mt-2`}
                            >
                                <Text style={tw`text-gray-600`}>Change Number</Text>
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </View>
        </KeyboardAvoidingView>
    );
}
