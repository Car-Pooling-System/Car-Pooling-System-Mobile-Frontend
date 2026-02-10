import { View, Text, ScrollView, Image, ActivityIndicator, RefreshControl, TouchableOpacity, useColorScheme, Alert } from "react-native";
import { useUser, useAuth } from "@clerk/clerk-expo";
import { useState, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import tw from "twrnc";
import { theme } from "../../../constants/Colors";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function Profile() {
    const { user } = useUser();
    const { signOut } = useAuth();
    const scheme = useColorScheme();
    const colors = theme[scheme ?? "light"];
    console.log(user?.id);
    const [driverData, setDriverData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchDriverData = async () => {
        if (!user?.id) {
            console.log("User ID not available yet");
            setLoading(false);
            return;
        }

        if (!BACKEND_URL) {
            console.error("BACKEND_URL is not defined");
            setLoading(false);
            return;
        }

        const url = `${BACKEND_URL}/api/driver-profile/${user.id}`;
        console.log("Fetching from:", url);

        try {
            const response = await fetch(url);
            console.log("Response status:", response.status);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            console.log("Driver data received:", data);
            setDriverData(data);
        } catch (error) {
            console.error("Error fetching driver data:", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        if (user?.id) {
            fetchDriverData();
        }
    }, [user?.id]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchDriverData();
    };

    if (loading) {
        return (
            <View style={tw`flex-1 justify-center items-center bg-white`}>
                <ActivityIndicator size="large" color="#000" />
                <Text style={tw`mt-4 text-gray-500`}>Loading profile...</Text>
            </View>
        );
    }

    return (
        <ScrollView
            style={tw`flex-1 bg-gray-50`}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
            {/* Header */}
            <View style={tw`bg-white p-6 mb-3`}>
                <View style={tw`flex-row items-center`}>
                    {user?.imageUrl || driverData?.profileImage ? (
                        <Image
                            source={{ uri: user?.imageUrl || driverData?.profileImage }}
                            style={tw`w-20 h-20 rounded-full bg-gray-200`}
                        />
                    ) : (
                        <View style={tw`w-20 h-20 rounded-full bg-gray-300 justify-center items-center`}>
                            <Ionicons name="person" size={40} color="#666" />
                        </View>
                    )}
                    <View style={tw`ml-4 flex-1`}>
                        <Text style={tw`text-2xl font-bold`}>
                            {user?.firstName || "Driver"} {user?.lastName || ""}
                        </Text>
                        <Text style={tw`text-gray-600 text-sm mt-1`}>
                            {user?.primaryEmailAddress?.emailAddress}
                        </Text>
                        {driverData?.phoneNumber && (
                            <View style={tw`flex-row items-center mt-1`}>
                                <Ionicons name="call" size={14} color="#666" />
                                <Text style={tw`text-gray-600 text-sm ml-1`}>
                                    {driverData.phoneNumber}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>
            </View>

            {/* Statistics */}
            <View style={tw`bg-white p-6 mb-3`}>
                <Text style={tw`text-xl font-bold mb-4`}>Statistics</Text>
                <View style={tw`flex-row justify-between`}>
                    <View style={tw`items-center flex-1 bg-blue-50 p-4 rounded-xl mr-2`}>
                        <Text style={tw`text-3xl font-bold text-blue-600`}>
                            {driverData?.rides?.completed || 0}
                        </Text>
                        <Text style={tw`text-gray-600 text-sm mt-1`}>Completed</Text>
                    </View>
                    <View style={tw`items-center flex-1 bg-green-50 p-4 rounded-xl mx-1`}>
                        <Text style={tw`text-3xl font-bold text-green-600`}>
                            {driverData?.rating?.average?.toFixed(1) || "0.0"}
                        </Text>
                        <Text style={tw`text-gray-600 text-sm mt-1`}>Rating</Text>
                    </View>
                    <View style={tw`items-center flex-1 bg-purple-50 p-4 rounded-xl ml-2`}>
                        <Text style={tw`text-3xl font-bold text-purple-600`}>
                            {driverData?.distanceDrivenKm || 0}
                        </Text>
                        <Text style={tw`text-gray-600 text-sm mt-1`}>km</Text>
                    </View>
                </View>
            </View>

            {/* Vehicle Information */}
            {driverData?.vehicle && (
                <View style={tw`bg-white p-6 mb-3`}>
                    <View style={tw`flex-row items-center mb-4`}>
                        <Ionicons name="car-sport" size={24} color="#000" />
                        <Text style={tw`text-xl font-bold ml-2`}>Vehicle Information</Text>
                    </View>
                    <View style={tw`bg-gray-50 p-4 rounded-xl`}>
                        <InfoRow label="Brand" value={driverData.vehicle.brand} />
                        <InfoRow label="Model" value={driverData.vehicle.model} />
                        <InfoRow label="Year" value={driverData.vehicle.year} />
                        <InfoRow label="Color" value={driverData.vehicle.color} />
                        <InfoRow label="License Plate" value={driverData.vehicle.licensePlate} />
                    </View>
                    {driverData.vehicle.images?.length > 0 && (
                        <View style={tw`mt-4`}>
                            <Text style={tw`font-semibold mb-2`}>Vehicle Images</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                {driverData.vehicle.images.map((img, i) => (
                                    <Image
                                        key={i}
                                        source={{ uri: img }}
                                        style={tw`w-32 h-24 rounded-lg mr-3 bg-gray-200`}
                                    />
                                ))}
                            </ScrollView>
                        </View>
                    )}
                </View>
            )}

            {/* Verification Status */}
            <View style={tw`bg-white p-6 mb-3`}>
                <View style={tw`flex-row items-center mb-4`}>
                    <Ionicons name="shield-checkmark" size={24} color="#000" />
                    <Text style={tw`text-xl font-bold ml-2`}>Verification Status</Text>
                </View>
                <View style={tw`bg-gray-50 p-4 rounded-xl`}>
                    <VerificationRow
                        label="Email"
                        verified={driverData?.verification?.emailVerified}
                    />
                    <VerificationRow
                        label="Phone"
                        verified={driverData?.verification?.phoneVerified}
                    />
                    <VerificationRow
                        label="Driving License"
                        verified={driverData?.verification?.drivingLicenseVerified}
                    />
                    <VerificationRow
                        label="Vehicle"
                        verified={driverData?.verification?.vehicleVerified}
                    />
                </View>
            </View>

            {/* Documents */}
            {driverData?.documents && (
                <View style={tw`bg-white p-6 mb-6`}>
                    <View style={tw`flex-row items-center mb-4`}>
                        <Ionicons name="document-text" size={24} color="#000" />
                        <Text style={tw`text-xl font-bold ml-2`}>Documents</Text>
                    </View>
                    <View style={tw`bg-gray-50 p-4 rounded-xl`}>
                        <DocumentRow label="Driving License" url={driverData.documents.drivingLicense} />
                        <DocumentRow label="Vehicle Registration" url={driverData.documents.vehicleRegistration} />
                        <DocumentRow label="Insurance" url={driverData.documents.insurance} />
                    </View>
                </View>
            )}

            {/* Logout Button */}
            <View style={tw`bg-white p-6 mb-6`}>
                <TouchableOpacity
                    onPress={() => {
                        Alert.alert(
                            "Sign Out",
                            "Are you sure you want to sign out?",
                            [
                                {
                                    text: "Cancel",
                                    style: "cancel"
                                },
                                {
                                    text: "Sign Out",
                                    style: "destructive",
                                    onPress: async () => {
                                        try {
                                            await signOut();
                                        } catch (error) {
                                            console.error("Error signing out:", error);
                                        }
                                    }
                                }
                            ]
                        );
                    }}
                    style={[
                        tw`flex-row items-center justify-center py-4 rounded-xl`,
                        { backgroundColor: colors.danger }
                    ]}
                >
                    <Ionicons name="log-out-outline" size={24} color="white" style={tw`mr-2`} />
                    <Text style={tw`text-white font-bold text-lg`}>Sign Out</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

function InfoRow({ label, value }) {
    return (
        <View style={tw`flex-row justify-between py-2 border-b border-gray-200`}>
            <Text style={tw`text-gray-600`}>{label}</Text>
            <Text style={tw`font-semibold`}>{value || "N/A"}</Text>
        </View>
    );
}

function VerificationRow({ label, verified }) {
    return (
        <View style={tw`flex-row justify-between items-center py-2 border-b border-gray-200`}>
            <Text style={tw`text-gray-700`}>{label}</Text>
            <View
                style={tw`px-3 py-1 rounded-full ${verified ? "bg-green-100" : "bg-red-100"
                    }`}
            >
                <Text
                    style={tw`text-xs font-semibold ${verified ? "text-green-700" : "text-red-700"
                        }`}
                >
                    {verified ? "Verified" : "Not Verified"}
                </Text>
            </View>
        </View>
    );
}

function DocumentRow({ label, url }) {
    return (
        <View style={tw`flex-row justify-between items-center py-2 border-b border-gray-200`}>
            <Text style={tw`text-gray-700`}>{label}</Text>
            {url ? (
                <View style={tw`flex-row items-center`}>
                    <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                    <Text style={tw`text-blue-500 text-sm ml-1`}>Uploaded</Text>
                </View>
            ) : (
                <Text style={tw`text-gray-400 text-sm`}>Not uploaded</Text>
            )}
        </View>
    );
}
