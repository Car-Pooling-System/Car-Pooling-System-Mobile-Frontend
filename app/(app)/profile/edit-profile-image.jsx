import { View, Text, TouchableOpacity, Image, Alert, ActivityIndicator } from "react-native";
import { useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import tw from "twrnc";
import { uploadToStorage, deleteFromStorage } from "../../../utils/uploadToStorage";
import { uriToBlob, getFileExtension } from "../../../utils/imageHelper";
import { useUser } from "@clerk/clerk-expo";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function EditProfileImage() {
    const router = useRouter();
    const { user } = useUser();
    const params = useLocalSearchParams();

    const currentImage = params.currentImage || user?.imageUrl || null;
    const [profileImage, setProfileImage] = useState(currentImage);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);

    const pickImage = async (fromCamera = false) => {
        try {
            let result;

            if (fromCamera) {
                const { status } = await ImagePicker.requestCameraPermissionsAsync();

                if (status !== 'granted') {
                    Alert.alert('Permission needed', 'Please grant camera permissions');
                    return;
                }

                result = await ImagePicker.launchCameraAsync({
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                    allowsEditing: true,
                    aspect: [1, 1],
                    quality: 0.8,
                });
            } else {
                const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

                if (status !== 'granted') {
                    Alert.alert('Permission needed', 'Please grant camera roll permissions');
                    return;
                }

                result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                    allowsEditing: true,
                    aspect: [1, 1],
                    quality: 0.8,
                });
            }

            if (!result.canceled && result.assets && result.assets.length > 0) {
                await uploadImage(result.assets[0]);
            }
        } catch (error) {
            console.error("Error picking image:", error);
            Alert.alert("Error", "Failed to pick image");
        }
    };

    const uploadImage = async (asset) => {
        setUploading(true);
        try {
            const blob = await uriToBlob(asset.uri);
            const extension = getFileExtension(asset.uri, asset.mimeType);
            const fileName = `profile-${Date.now()}.${extension}`;
            const downloadURL = await uploadToStorage(blob, `profiles/${user.id}`, fileName);

            // Delete old image from storage (only if it's not from Clerk)
            if (profileImage && !profileImage.includes('clerk.com')) {
                await deleteFromStorage(profileImage);
            }

            setProfileImage(downloadURL);
            Alert.alert("Success", "Profile image uploaded successfully");
        } catch (error) {
            console.error("Error uploading image:", error);
            Alert.alert("Error", "Failed to upload image");
        } finally {
            setUploading(false);
        }
    };

    const handleSave = async () => {
        if (!profileImage) {
            Alert.alert("Error", "Please select a profile image");
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(`${BACKEND_URL}/api/driver-profile/${user.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    profileImage: profileImage
                })
            });

            if (!response.ok) {
                throw new Error('Failed to update profile image');
            }

            Alert.alert("Success", "Profile image updated successfully", [
                { text: "OK", onPress: () => router.back() }
            ]);
        } catch (error) {
            console.error("Error updating profile image:", error);
            Alert.alert("Error", "Failed to update profile image");
        } finally {
            setLoading(false);
        }
    };

    const showImageOptions = () => {
        Alert.alert(
            "Change Profile Picture",
            "Choose an option",
            [
                {
                    text: "Take Photo",
                    onPress: () => pickImage(true)
                },
                {
                    text: "Choose from Gallery",
                    onPress: () => pickImage(false)
                },
                {
                    text: "Cancel",
                    style: "cancel"
                }
            ]
        );
    };

    return (
        <View style={tw`flex-1 bg-gray-50`}>
            {/* Header */}
            <View style={tw`bg-white px-4 pt-12 pb-4 shadow-sm`}>
                <View style={tw`flex-row items-center`}>
                    <TouchableOpacity onPress={() => router.back()} style={tw`mr-4`}>
                        <Ionicons name="arrow-back" size={24} color="#000" />
                    </TouchableOpacity>
                    <Text style={tw`text-xl font-bold flex-1`}>Edit Profile Picture</Text>
                    <TouchableOpacity onPress={handleSave} disabled={loading}>
                        {loading ? (
                            <ActivityIndicator size="small" color="#007AFF" />
                        ) : (
                            <Text style={tw`text-blue-500 font-semibold`}>Save</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </View>

            <View style={tw`flex-1 items-center justify-center p-6`}>
                <View style={tw`items-center`}>
                    {/* Profile Image */}
                    <View style={tw`relative mb-6`}>
                        {profileImage ? (
                            <Image
                                source={{ uri: profileImage }}
                                style={tw`w-40 h-40 rounded-full bg-gray-200`}
                            />
                        ) : (
                            <View style={tw`w-40 h-40 rounded-full bg-gray-300 justify-center items-center`}>
                                <Ionicons name="person" size={80} color="#666" />
                            </View>
                        )}

                        {/* Camera Button */}
                        <TouchableOpacity
                            onPress={showImageOptions}
                            disabled={uploading}
                            style={tw`absolute bottom-0 right-0 bg-blue-500 rounded-full p-3 shadow-lg`}
                        >
                            {uploading ? (
                                <ActivityIndicator size="small" color="white" />
                            ) : (
                                <Ionicons name="camera" size={24} color="white" />
                            )}
                        </TouchableOpacity>
                    </View>

                    <Text style={tw`text-2xl font-bold mb-2`}>
                        {user?.firstName || "Driver"} {user?.lastName || ""}
                    </Text>
                    <Text style={tw`text-gray-600 mb-6 text-center`}>
                        {user?.primaryEmailAddress?.emailAddress}
                    </Text>

                    {/* Change Photo Button */}
                    <TouchableOpacity
                        onPress={showImageOptions}
                        disabled={uploading}
                        style={tw`bg-white border border-gray-200 px-6 py-3 rounded-full flex-row items-center shadow-sm mb-4`}
                    >
                        {uploading ? (
                            <>
                                <ActivityIndicator size="small" color="#007AFF" style={tw`mr-2`} />
                                <Text style={tw`text-blue-500 font-semibold`}>Uploading...</Text>
                            </>
                        ) : (
                            <>
                                <Ionicons name="images-outline" size={20} color="#007AFF" />
                                <Text style={tw`text-blue-500 font-semibold ml-2`}>Change Photo</Text>
                            </>
                        )}
                    </TouchableOpacity>

                    {/* Info Text */}
                    <View style={tw`bg-blue-50 p-4 rounded-xl mt-4`}>
                        <Text style={tw`text-gray-600 text-center text-sm`}>
                            Choose a clear photo of yourself. This helps riders recognize you during pickups.
                        </Text>
                    </View>
                </View>
            </View>
        </View>
    );
}
