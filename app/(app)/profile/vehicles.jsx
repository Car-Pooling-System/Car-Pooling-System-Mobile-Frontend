import { View, Text, ScrollView, TouchableOpacity, Image, Alert, ActivityIndicator } from "react-native";
import { useState, useEffect } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@clerk/clerk-expo";
import tw from "twrnc";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function VehiclesManagement() {
    const router = useRouter();
    const { user } = useUser();
    const [vehicles, setVehicles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        fetchVehicles();
    }, []);

    const fetchVehicles = async () => {
        if (!user?.id) return;

        try {
            const response = await fetch(`${BACKEND_URL}/api/driver-vehicles/${user.id}`);
            
            if (response.ok) {
                const data = await response.json();
                setVehicles(data.vehicles || []);
            } else if (response.status === 404) {
                setVehicles([]);
            }
        } catch (error) {
            console.error("Error fetching vehicles:", error);
            Alert.alert("Error", "Failed to load vehicles");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleAddVehicle = () => {
        router.push({
            pathname: "/profile/edit-vehicle",
            params: { mode: "add" }
        });
    };

    const handleEditVehicle = (vehicle, index) => {
        router.push({
            pathname: "/profile/edit-vehicle",
            params: { 
                vehicle: JSON.stringify(vehicle),
                vehicleIndex: index,
                mode: "edit"
            }
        });
    };

    const handleDeleteVehicle = (index) => {
        Alert.alert(
            "Delete Vehicle",
            "Are you sure you want to delete this vehicle? This action cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        setLoading(true);
                        try {
                            const response = await fetch(
                                `${BACKEND_URL}/api/driver-vehicles/${user.id}/${index}`,
                                { method: 'DELETE' }
                            );

                            if (!response.ok) {
                                throw new Error('Failed to delete vehicle');
                            }

                            Alert.alert("Success", "Vehicle deleted successfully");
                            await fetchVehicles();
                        } catch (error) {
                            console.error("Error deleting vehicle:", error);
                            Alert.alert("Error", "Failed to delete vehicle");
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    if (loading) {
        return (
            <View style={tw`flex-1 justify-center items-center bg-gray-50`}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={tw`mt-4 text-gray-500`}>Loading vehicles...</Text>
            </View>
        );
    }

    return (
        <View style={tw`flex-1 bg-gray-50`}>
            {/* Header */}
            <View style={tw`bg-white px-4 pt-6 pb-4 shadow-sm`}>
                <View style={tw`flex-row items-center`}>
                    <TouchableOpacity onPress={() => router.back()} style={tw`mr-4`}>
                        <Ionicons name="arrow-back" size={24} color="#000" />
                    </TouchableOpacity>
                    <Text style={tw`text-xl font-bold flex-1`}>My Vehicles</Text>
                    <TouchableOpacity onPress={handleAddVehicle} style={tw`bg-blue-500 px-4 py-2 rounded-lg flex-row items-center`}>
                        <Ionicons name="add" size={20} color="white" />
                        <Text style={tw`text-white font-semibold ml-1`}>Add</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView style={tw`flex-1`} contentContainerStyle={tw`p-4`}>
                {vehicles.length === 0 ? (
                    <View style={tw`bg-white rounded-xl p-8 items-center`}>
                        <Ionicons name="car-sport-outline" size={80} color="#ccc" />
                        <Text style={tw`text-gray-400 text-lg mt-4`}>No vehicles added yet</Text>
                        <Text style={tw`text-gray-400 text-sm mt-2 text-center`}>
                            Add your first vehicle to start offering rides
                        </Text>
                        <TouchableOpacity
                            onPress={handleAddVehicle}
                            style={tw`bg-blue-500 px-6 py-3 rounded-lg mt-6 flex-row items-center`}
                        >
                            <Ionicons name="add" size={20} color="white" />
                            <Text style={tw`text-white font-semibold ml-2`}>Add Vehicle</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    vehicles.map((vehicle, index) => (
                        <View key={index} style={tw`bg-white rounded-xl p-4 mb-4 shadow-sm`}>
                            {/* Vehicle Header */}
                            <View style={tw`flex-row items-center justify-between mb-3`}>
                                <View style={tw`flex-row items-center flex-1`}>
                                    <Ionicons name="car-sport" size={24} color="#007AFF" />
                                    <View style={tw`ml-3 flex-1`}>
                                        <Text style={tw`text-lg font-bold`}>
                                            {vehicle.brand} {vehicle.model}
                                        </Text>
                                        <Text style={tw`text-gray-500 text-sm`}>
                                            {vehicle.year} • {vehicle.color}
                                        </Text>
                                    </View>
                                </View>
                                <View style={tw`flex-row gap-2`}>
                                    <TouchableOpacity
                                        onPress={() => handleEditVehicle(vehicle, index)}
                                        style={tw`bg-gray-100 p-2 rounded-lg`}
                                    >
                                        <Ionicons name="pencil" size={20} color="#007AFF" />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => handleDeleteVehicle(index)}
                                        style={tw`bg-red-50 p-2 rounded-lg`}
                                    >
                                        <Ionicons name="trash" size={20} color="#EF4444" />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* License Plate */}
                            <View style={tw`bg-gray-50 px-3 py-2 rounded-lg mb-3 self-start`}>
                                <Text style={tw`font-mono font-bold text-sm`}>
                                    {vehicle.licensePlate}
                                </Text>
                            </View>

                            {/* Vehicle Images */}
                            {vehicle.images && vehicle.images.length > 0 && (
                                <View>
                                    <Text style={tw`text-sm font-semibold mb-2 text-gray-700`}>
                                        Images ({vehicle.images.length})
                                    </Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                        {vehicle.images.map((img, imgIndex) => (
                                            <Image
                                                key={imgIndex}
                                                source={{ uri: img }}
                                                style={tw`w-24 h-20 rounded-lg mr-2 bg-gray-200`}
                                            />
                                        ))}
                                    </ScrollView>
                                </View>
                            )}
                        </View>
                    ))
                )}
            </ScrollView>
        </View>
    );
}
