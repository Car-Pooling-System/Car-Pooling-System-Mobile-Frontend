import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, Alert, ActivityIndicator, Switch } from "react-native";
import { useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import tw from "twrnc";
import { uploadToStorage, deleteMultipleFromStorage } from "../../../utils/uploadToStorage";
import { uriToBlob, getFileExtension } from "../../../utils/imageHelper";
import { useUser } from "@clerk/clerk-expo";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function EditVehicle() {
    const router = useRouter();
    const { user } = useUser();
    const params = useLocalSearchParams();

    // Parse the vehicle data from params
    const vehicleData = params.vehicle ? JSON.parse(params.vehicle) : {};
    const mode = params.mode || "edit"; // "add" or "edit"
    const vehicleIndex = params.vehicleIndex !== undefined ? parseInt(params.vehicleIndex) : null;

    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [formData, setFormData] = useState({
        brand: vehicleData.brand || "",
        model: vehicleData.model || "",
        year: vehicleData.year || "",
        color: vehicleData.color || "",
        licensePlate: vehicleData.licensePlate || "",
        totalSeats: vehicleData.totalSeats || 4,
        hasLuggageSpace: vehicleData.hasLuggageSpace || false,
        images: vehicleData.images || []
    });

    const pickImages = async () => {
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

            if (status !== 'granted') {
                Alert.alert('Permission needed', 'Please grant camera roll permissions');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsMultipleSelection: true,
                quality: 0.8,
                aspect: [4, 3],
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                await uploadNewImages(result.assets);
            }
        } catch (error) {
            console.error("Error picking images:", error);
            Alert.alert("Error", "Failed to pick images");
        }
    };

    const uploadNewImages = async (assets) => {
        setUploading(true);
        try {
            const uploadPromises = assets.map(async (asset) => {
                const blob = await uriToBlob(asset.uri);
                const extension = getFileExtension(asset.uri, asset.mimeType);
                const fileName = `vehicle-${Date.now()}.${extension}`;
                return await uploadToStorage(blob, `vehicles/${user.id}`, fileName);
            });

            const uploadedUrls = await Promise.all(uploadPromises);
            setFormData(prev => ({
                ...prev,
                images: [...prev.images, ...uploadedUrls]
            }));

            Alert.alert("Success", "Images uploaded successfully");
        } catch (error) {
            console.error("Error uploading images:", error);
            Alert.alert("Error", "Failed to upload images");
        } finally {
            setUploading(false);
        }
    };

    const removeImage = async (index) => {
        Alert.alert(
            "Remove Image",
            "Are you sure you want to remove this image?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Remove",
                    style: "destructive",
                    onPress: async () => {
                        const imageUrl = formData.images[index];
                        const newImages = formData.images.filter((_, i) => i !== index);
                        setFormData(prev => ({ ...prev, images: newImages }));

                        // Delete from Firebase Storage
                        await deleteMultipleFromStorage([imageUrl]);
                    }
                }
            ]
        );
    };

    const handleSave = async () => {
        // Validation
        if (!formData.brand || !formData.model || !formData.year || !formData.color || !formData.licensePlate) {
            Alert.alert("Error", "Please fill in all fields");
            return;
        }

        setLoading(true);
        try {
            if (mode === "add") {
                // Adding a new vehicle
                const response = await fetch(`${BACKEND_URL}/api/driver-vehicles/${user.id}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(formData)
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.message || 'Failed to add vehicle');
                }

                Alert.alert("Success", "Vehicle added successfully", [
                    { text: "OK", onPress: () => router.back() }
                ]);
            } else {
                // Editing an existing vehicle
                const response = await fetch(`${BACKEND_URL}/api/driver-vehicles/${user.id}/${vehicleIndex}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(formData)
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.message || 'Failed to update vehicle');
                }

                // Delete old images from storage if they were replaced
                const oldImages = vehicleData.images || [];
                const removedImages = oldImages.filter(img => !formData.images.includes(img));
                if (removedImages.length > 0) {
                    await deleteMultipleFromStorage(removedImages);
                }

                Alert.alert("Success", "Vehicle updated successfully", [
                    { text: "OK", onPress: () => router.back() }
                ]);
            }
        } catch (error) {
            console.error("Error saving vehicle:", error);
            Alert.alert("Error", mode === "add" ? "Failed to add vehicle" : "Failed to update vehicle");
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={tw`flex-1 bg-gray-50`}>
            {/* Header */}
            <View style={tw`bg-white px-4 pt-6 pb-4 shadow-sm`}>
                <View style={tw`flex-row items-center`}>
                    <TouchableOpacity onPress={() => router.back()} style={tw`mr-4`}>
                        <Ionicons name="arrow-back" size={24} color="#000" />
                    </TouchableOpacity>
                    <Text style={tw`text-xl font-bold flex-1`}>
                        {mode === "add" ? "Add Vehicle" : "Edit Vehicle"}
                    </Text>
                    <TouchableOpacity onPress={handleSave} disabled={loading}>
                        {loading ? (
                            <ActivityIndicator size="small" color="#007AFF" />
                        ) : (
                            <Text style={tw`text-blue-500 font-semibold`}>Save</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView style={tw`flex-1`} contentContainerStyle={tw`p-4`}>
                {/* Vehicle Details Form */}
                <View style={tw`bg-white rounded-xl p-4 mb-4`}>
                    <Text style={tw`text-lg font-bold mb-4`}>Vehicle Information</Text>

                    <Text style={tw`text-gray-700 mb-2`}>Brand</Text>
                    <TextInput
                        style={tw`bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-4`}
                        value={formData.brand}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, brand: text }))}
                        placeholder="e.g., Toyota"
                    />

                    <Text style={tw`text-gray-700 mb-2`}>Model</Text>
                    <TextInput
                        style={tw`bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-4`}
                        value={formData.model}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, model: text }))}
                        placeholder="e.g., Camry"
                    />

                    <Text style={tw`text-gray-700 mb-2`}>Year</Text>
                    <TextInput
                        style={tw`bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-4`}
                        value={formData.year}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, year: text }))}
                        placeholder="e.g., 2020"
                        keyboardType="numeric"
                    />

                    <Text style={tw`text-gray-700 mb-2`}>Color</Text>
                    <TextInput
                        style={tw`bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-4`}
                        value={formData.color}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, color: text }))}
                        placeholder="e.g., Silver"
                    />

                    <Text style={tw`text-gray-700 mb-2`}>License Plate</Text>
                    <TextInput
                        style={tw`bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-4`}
                        value={formData.licensePlate}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, licensePlate: text.toUpperCase() }))}
                        placeholder="e.g., ABC 123"
                        autoCapitalize="characters"
                    />

                    <Text style={tw`text-gray-700 mb-2`}>Total Passenger Seats</Text>
                    <Text style={tw`text-gray-400 text-xs mb-3`}>Maximum number of passengers this vehicle can carry (excluding driver)</Text>
                    <View style={tw`flex-row items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-4`}>
                        <TouchableOpacity
                            onPress={() => setFormData(prev => ({ ...prev, totalSeats: Math.max(1, prev.totalSeats - 1) }))}
                            style={tw`w-9 h-9 bg-gray-200 rounded-full items-center justify-center`}
                        >
                            <Ionicons name="remove" size={20} color="#374151" />
                        </TouchableOpacity>
                        <View style={tw`items-center`}>
                            <Text style={tw`text-2xl font-bold text-gray-900`}>{formData.totalSeats}</Text>
                            <Text style={tw`text-xs text-gray-400`}>seat{formData.totalSeats !== 1 ? 's' : ''}</Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => setFormData(prev => ({ ...prev, totalSeats: Math.min(12, prev.totalSeats + 1) }))}
                            style={tw`w-9 h-9 bg-blue-500 rounded-full items-center justify-center`}
                        >
                            <Ionicons name="add" size={20} color="white" />
                        </TouchableOpacity>
                    </View>

                    {/* Luggage Space */}
                    <View style={tw`flex-row items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-4`}>
                        <View style={tw`flex-1`}>
                            <Text style={tw`text-gray-700 font-medium`}>Luggage Space Available</Text>
                            <Text style={tw`text-gray-400 text-xs mt-0.5`}>Does your vehicle have boot/trunk space for luggage?</Text>
                        </View>
                        <Switch
                            value={formData.hasLuggageSpace}
                            onValueChange={(val) => setFormData(prev => ({ ...prev, hasLuggageSpace: val }))}
                            trackColor={{ false: "#d1d5db", true: "#86efac" }}
                            thumbColor={formData.hasLuggageSpace ? "#16a34a" : "#f4f3f4"}
                        />
                    </View>
                </View>

                {/* Vehicle Images */}
                <View style={tw`bg-white rounded-xl p-4 mb-4`}>
                    <View style={tw`flex-row items-center justify-between mb-4`}>
                        <Text style={tw`text-lg font-bold`}>Vehicle Images</Text>
                        <TouchableOpacity
                            onPress={pickImages}
                            disabled={uploading}
                            style={tw`flex-row items-center bg-blue-500 px-4 py-2 rounded-lg`}
                        >
                            {uploading ? (
                                <ActivityIndicator size="small" color="white" />
                            ) : (
                                <>
                                    <Ionicons name="camera" size={18} color="white" />
                                    <Text style={tw`text-white font-semibold ml-2`}>Add</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>

                    {formData.images.length > 0 ? (
                        <View style={tw`flex-row flex-wrap`}>
                            {formData.images.map((img, index) => (
                                <View key={index} style={tw`relative w-1/3 p-1`}>
                                    <Image
                                        source={{ uri: img }}
                                        style={tw`w-full h-24 rounded-lg bg-gray-200`}
                                    />
                                    <TouchableOpacity
                                        onPress={() => removeImage(index)}
                                        style={tw`absolute top-2 right-2 bg-red-500 rounded-full p-1`}
                                    >
                                        <Ionicons name="close" size={16} color="white" />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>
                    ) : (
                        <View style={tw`items-center py-8 bg-gray-50 rounded-lg`}>
                            <Ionicons name="images-outline" size={48} color="#ccc" />
                            <Text style={tw`text-gray-400 mt-2`}>No images uploaded</Text>
                        </View>
                    )}
                </View>
            </ScrollView>
        </View>
    );
}
