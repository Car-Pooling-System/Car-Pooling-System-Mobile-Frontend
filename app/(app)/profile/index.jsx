import { View, Text, ScrollView, Image, ActivityIndicator, RefreshControl, TouchableOpacity, useColorScheme, Alert, TextInput, Linking, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { useUser, useAuth } from "@clerk/clerk-expo";
import { useState, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import tw from "twrnc";
import { theme } from "../../../constants/Colors";
import { uploadToStorage, deleteFromStorage, deleteMultipleFromStorage } from "../../../utils/uploadToStorage";
import { uriToBlob, getFileExtension } from "../../../utils/imageHelper";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function Profile() {
    const { user } = useUser();
    const { signOut } = useAuth();
    const router = useRouter();
    const scheme = useColorScheme();
    const colors = theme[scheme ?? "light"];
    console.log(user?.id);
    const [driverData, setDriverData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [editedData, setEditedData] = useState({});
    const [isNewDriver, setIsNewDriver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);
    const [imageModalVisible, setImageModalVisible] = useState(false);
    const [profileModalVisible, setProfileModalVisible] = useState(false);
    const [phoneModalVisible, setPhoneModalVisible] = useState(false);
    const [phoneNumber, setPhoneNumber] = useState("");
    const [verificationCode, setVerificationCode] = useState("");
    const [verificationSent, setVerificationSent] = useState(false);
    const [verifying, setVerifying] = useState(false);

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

            let data;
            const text = await response.text();
            try {
                data = JSON.parse(text);
            } catch (e) {
                console.error("Failed to parse response as JSON:", text);
                throw new Error("Invalid server response");
            }

            console.log("Parsed response data:", data);

            if (response.status === 404 || (data && data.message === "Driver not found")) {
                console.log("Driver not found. Setting empty state for new driver.");
                setIsNewDriver(true);
                const emptyState = {
                    userId: user.id,
                    vehicle: { images: [] },
                    documents: {
                        drivingLicense: "",
                        vehicleRegistration: "",
                        insurance: ""
                    },
                    verification: {
                        emailVerified: false,
                        phoneVerified: false,
                        drivingLicenseVerified: false,
                        vehicleVerified: false,
                    }
                };
                console.log("Setting empty driver data:", emptyState);
                setDriverData(emptyState);
                setEditedData(emptyState);
                setEditMode(true); // Enable edit mode for new drivers
                return;
            }

            if (!response.ok) {
                throw new Error(data.message || `HTTP error! status: ${response.status}`);
            }

            console.log("Driver data received:", data);

            // Ensure documents and vehicle objects exist even for existing drivers
            const processedData = {
                ...data,
                vehicle: data.vehicle || { images: [] },
                documents: data.documents || {
                    drivingLicense: "",
                    vehicleRegistration: "",
                    insurance: ""
                }
            };

            setIsNewDriver(false);
            setDriverData(processedData);
            setEditedData(processedData);
        } catch (error) {
            console.error("Error fetching driver data:", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const ensureDriverRegistered = async () => {
        if (!isNewDriver) return;

        console.log("Registering new driver...");
        const response = await fetch(`${BACKEND_URL}/api/driver-register/${user.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            throw new Error('Failed to register driver');
        }
        console.log("New driver registered successfully");
        setIsNewDriver(false);
    };

    const handleEditToggle = () => {
        if (editMode) {
            // Cancel - reset data
            setEditedData(driverData);
        }
        setEditMode(!editMode);
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            await ensureDriverRegistered();

            const response = await fetch(`${BACKEND_URL}/api/driver-profile/${user.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(editedData)
            });

            if (!response.ok) {
                throw new Error('Failed to update profile');
            }

            Alert.alert("Success", "Profile updated successfully!");
            setEditMode(false);
            fetchDriverData();
        } catch (error) {
            console.error("Error updating profile:", error);
            Alert.alert("Error", "Failed to update profile");
        } finally {
            setLoading(false);
        }
    };

    const viewProfileImage = () => {
        setProfileModalVisible(true);
    };

    const pickProfileImage = async () => {
        setProfileModalVisible(false);
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

            if (status !== 'granted') {
                Alert.alert('Permission needed', 'Please grant camera roll permissions');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                setUploading(true);
                const asset = result.assets[0];
                const blob = await uriToBlob(asset.uri);
                const extension = getFileExtension(asset.uri, asset.mimeType);
                const fileName = `profile-${Date.now()}.${extension}`;
                const downloadURL = await uploadToStorage(blob, `profiles/${user.id}`, fileName);

                await ensureDriverRegistered();

                const oldImage = driverData?.profileImage;

                // Update database FIRST
                const response = await fetch(`${BACKEND_URL}/api/driver-profile/${user.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ profileImage: downloadURL })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Backend error:', errorText);
                    // Delete the newly uploaded file since DB update failed
                    await deleteFromStorage(downloadURL);
                    throw new Error(`Failed to update backend: ${response.status}`);
                }

                // Only delete old image after DB update succeeds (if exists and not from Clerk)
                if (oldImage && !oldImage.includes('clerk.com')) {
                    try {
                        await deleteFromStorage(oldImage);
                    } catch (storageError) {
                        console.error('Storage deletion error (non-critical):', storageError);
                    }
                }

                Alert.alert("Success", "Profile image updated!");
                await fetchDriverData();
                setUploading(false);
            }
        } catch (error) {
            console.error("Error updating profile image:", error);
            Alert.alert("Error", "Failed to update profile image");
            setUploading(false);
        }
    };

    const handleVehicleImagePress = (image, index) => {
        Alert.alert(
            "Vehicle Image",
            "What would you like to do?",
            [
                {
                    text: "View Full Size",
                    onPress: () => {
                        setSelectedImage(image);
                        setImageModalVisible(true);
                    }
                },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => handleDeleteVehicleImage(index)
                },
                {
                    text: "Cancel",
                    style: "cancel"
                }
            ]
        );
    };

    const handleDeleteVehicleImage = async (index) => {
        Alert.alert(
            "Delete Image",
            "Are you sure you want to delete this image?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        setUploading(true);
                        try {
                            const imageUrl = driverData.vehicle.images[index];
                            const newImages = driverData.vehicle.images.filter((_, i) => i !== index);

                            // Update database FIRST
                            const response = await fetch(`${BACKEND_URL}/api/driver-vehicle/${user.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    images: newImages
                                })
                            });

                            if (!response.ok) {
                                const errorText = await response.text();
                                console.error('Backend error:', errorText);
                                throw new Error(`Failed to update backend: ${response.status}`);
                            }

                            // Only delete from Firebase after DB update succeeds
                            try {
                                await deleteFromStorage(imageUrl);
                            } catch (storageError) {
                                console.error('Storage deletion error (non-critical):', storageError);
                                // Don't fail the whole operation if storage deletion fails
                            }

                            // Update local state immediately
                            setDriverData(prev => ({
                                ...prev,
                                vehicle: { ...prev.vehicle, images: newImages }
                            }));
                            setEditedData(prev => ({
                                ...prev,
                                vehicle: { ...prev.vehicle, images: newImages }
                            }));
                            Alert.alert("Success", "Image deleted!");
                        } catch (error) {
                            console.error("Error deleting image:", error);
                            Alert.alert("Error", "Failed to delete image");
                        } finally {
                            setUploading(false);
                        }
                    }
                }
            ]
        );
    };

    const handleAddVehicleImages = async () => {
        let uploadedUrls = [];
        try {
            if (!BACKEND_URL) {
                Alert.alert("Configuration Error", "Backend URL is not configured.");
                return;
            }

            const currentImageCount = driverData?.vehicle?.images?.length || 0;
            const remainingSlots = 4 - currentImageCount;

            if (remainingSlots <= 0) {
                Alert.alert("Limit Reached", "Maximum 4 vehicle images allowed. Please delete an image before adding more.");
                return;
            }

            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

            if (status !== 'granted') {
                Alert.alert('Permission needed', 'Please grant camera roll permissions');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsMultipleSelection: true,
                quality: 0.8,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                // Limit selection to remaining slots
                const assetsToUpload = result.assets.slice(0, remainingSlots);

                if (result.assets.length > remainingSlots) {
                    Alert.alert("Notice", `Only ${remainingSlots} image(s) will be uploaded to maintain the 4-image limit.`);
                }

                setUploading(true);
                const uploadPromises = assetsToUpload.map(async (asset) => {
                    const blob = await uriToBlob(asset.uri);
                    const extension = getFileExtension(asset.uri, asset.mimeType);
                    const fileName = `vehicle-${Date.now()}-${Math.random()}.${extension}`;
                    return await uploadToStorage(blob, `vehicles/${user.id}`, fileName);
                });

                uploadedUrls = await Promise.all(uploadPromises);

                await ensureDriverRegistered();

                const newImages = [...(driverData.vehicle?.images || []), ...uploadedUrls];

                const response = await fetch(`${BACKEND_URL}/api/driver-vehicle/${user.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        images: newImages
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Failed to update backend: ${response.status} ${errorText}`);
                }

                // Update local state
                setDriverData(prev => ({
                    ...prev,
                    vehicle: { ...prev.vehicle, images: newImages }
                }));
                setEditedData(prev => ({
                    ...prev,
                    vehicle: { ...prev.vehicle, images: newImages }
                }));
                Alert.alert("Success", "Images uploaded!");
                setUploading(false);
            }
        } catch (error) {
            console.error("Error uploading images:", error);

            // Roll back newly uploaded storage files if DB update fails (including network failures).
            if (uploadedUrls.length > 0) {
                await deleteMultipleFromStorage(uploadedUrls);
            }

            if (error?.message?.includes("Network request failed")) {
                Alert.alert("Network Error", "Could not reach backend. Check server status and EXPO_PUBLIC_BACKEND_URL.");
            } else {
                Alert.alert("Error", "Failed to upload images");
            }
            setUploading(false);
        }
    };

    const handleDocumentPress = (docType, docUrl) => {
        const actions = [
            {
                text: docUrl ? "View Document" : "Upload Document",
                onPress: () => {
                    if (docUrl) {
                        Linking.openURL(docUrl);
                    } else {
                        handleUploadDocument(docType);
                    }
                }
            }
        ];

        if (docUrl) {
            actions.push({
                text: "Replace",
                onPress: () => handleUploadDocument(docType)
            });
            actions.push({
                text: "Delete",
                style: "destructive",
                onPress: () => handleDeleteDocument(docType)
            });
        }

        actions.push({
            text: "Cancel",
            style: "cancel"
        });

        Alert.alert(
            docType.replace(/([A-Z])/g, ' $1').trim(),
            "Choose an action",
            actions
        );
    };

    const handleUploadDocument = async (docType) => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: 'application/pdf',
                copyToCacheDirectory: true
            });

            console.log('Document picker result:', result);

            if (!result.canceled && result.assets && result.assets.length > 0) {
                setUploading(true);
                const asset = result.assets[0];
                const blob = await uriToBlob(asset.uri);
                const fileName = `${docType}-${Date.now()}.pdf`;
                const downloadURL = await uploadToStorage(blob, `documents/${user.id}`, fileName);

                await ensureDriverRegistered();

                const oldDocUrl = driverData.documents?.[docType];

                // Update database FIRST
                const response = await fetch(`${BACKEND_URL}/api/driver-docs/${user.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...driverData.documents, [docType]: downloadURL })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Backend error:', errorText);
                    // Delete the newly uploaded file since DB update failed
                    await deleteFromStorage(downloadURL);
                    throw new Error(`Failed to update backend: ${response.status}`);
                }

                // Only delete old document after DB update succeeds
                if (oldDocUrl) {
                    try {
                        await deleteFromStorage(oldDocUrl);
                    } catch (storageError) {
                        console.error('Storage deletion error (non-critical):', storageError);
                        // Don't fail the whole operation if storage deletion fails
                    }
                }

                // Update local state immediately
                const updatedDocs = { ...driverData.documents, [docType]: downloadURL };
                setDriverData(prev => ({ ...prev, documents: updatedDocs }));
                setEditedData(prev => ({ ...prev, documents: updatedDocs }));
                Alert.alert("Success", "Document uploaded!");
                setUploading(false);
            }
        } catch (error) {
            console.error("Error uploading document:", error);
            Alert.alert("Error", error.message || "Failed to upload document");
            setUploading(false);
        }
    };

    const handleDeleteDocument = async (docType) => {
        Alert.alert(
            "Delete Document",
            "Are you sure you want to delete this document?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        setUploading(true);
                        try {
                            const docUrl = driverData.documents[docType];

                            // Update database FIRST
                            const response = await fetch(`${BACKEND_URL}/api/driver-docs/${user.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ ...driverData.documents, [docType]: null })
                            });

                            if (!response.ok) {
                                const errorText = await response.text();
                                console.error('Backend error:', errorText);
                                throw new Error(`Failed to update backend: ${response.status}`);
                            }

                            // Only delete from Firebase after DB update succeeds
                            if (docUrl) {
                                try {
                                    await deleteFromStorage(docUrl);
                                } catch (storageError) {
                                    console.error('Storage deletion error (non-critical):', storageError);
                                    // Don't fail the whole operation if storage deletion fails
                                }
                            }

                            // Update local state immediately
                            const updatedDocs = { ...driverData.documents, [docType]: null };
                            setDriverData(prev => ({ ...prev, documents: updatedDocs }));
                            setEditedData(prev => ({ ...prev, documents: updatedDocs }));
                            Alert.alert("Success", "Document deleted!");
                        } catch (error) {
                            console.error("Error deleting document:", error);
                            Alert.alert("Error", "Failed to delete document");
                        } finally {
                            setUploading(false);
                        }
                    }
                }
            ]
        );
    };

    const handlePhoneEdit = () => {
        setPhoneNumber(driverData?.phoneNumber || "");
        setVerificationSent(false);
        setVerificationCode("");
        setPhoneModalVisible(true);
    };

    const formatPhoneNumber = (text) => {
        const cleaned = text.replace(/\D/g, '');
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
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    phoneNumber: phoneNumber.replace(/\D/g, '')
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Phone verification send error:', errorText);
                throw new Error(`Failed to send verification code: ${response.status}`);
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
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    phoneNumber: phoneNumber.replace(/\D/g, ''),
                    code: verificationCode
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Phone verification verify error:', errorText);
                throw new Error('Invalid verification code');
            }

            setPhoneModalVisible(false);
            Alert.alert("Success", "Phone number updated and verified!");
            await fetchDriverData();
        } catch (error) {
            console.error("Error verifying code:", error);
            Alert.alert("Error", "Invalid verification code. Please try again.");
        } finally {
            setVerifying(false);
        }
    };

    useEffect(() => {
        if (user?.id) {
            fetchDriverData();
        }
    }, [user?.id]);

    useEffect(() => {
        console.log("Current driverData state:", driverData);
    }, [driverData]);

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
            {/* Loading Overlay */}
            {uploading && (
                <View style={tw`absolute top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 z-50 justify-center items-center`}>
                    <View style={tw`bg-white p-6 rounded-xl items-center`}>
                        <ActivityIndicator size="large" color="#007AFF" />
                        <Text style={tw`mt-4 text-gray-600`}>Processing...</Text>
                    </View>
                </View>
            )}

            {/* Profile Image Modal */}
            <Modal
                visible={profileModalVisible}
                transparent={true}
                onRequestClose={() => setProfileModalVisible(false)}
            >
                <View style={tw`flex-1 bg-black bg-opacity-90 justify-center items-center`}>
                    <TouchableOpacity
                        style={tw`absolute top-12 right-4 z-10`}
                        onPress={() => setProfileModalVisible(false)}
                    >
                        <Ionicons name="close-circle" size={36} color="white" />
                    </TouchableOpacity>
                    <View style={tw`items-center`}>
                        {(user?.imageUrl || driverData?.profileImage) ? (
                            <Image
                                source={{ uri: driverData?.profileImage || user?.imageUrl }}
                                style={tw`w-80 h-80 rounded-full bg-gray-200`}
                                resizeMode="cover"
                            />
                        ) : (
                            <View style={tw`w-80 h-80 rounded-full bg-gray-300 justify-center items-center`}>
                                <Ionicons name="person" size={160} color="#666" />
                            </View>
                        )}
                        <TouchableOpacity
                            onPress={pickProfileImage}
                            disabled={uploading}
                            style={tw`mt-6 bg-blue-500 px-8 py-4 rounded-full flex-row items-center`}
                        >
                            {uploading ? (
                                <ActivityIndicator size="small" color="white" />
                            ) : (
                                <>
                                    <Ionicons name="camera" size={24} color="white" />
                                    <Text style={tw`text-white font-bold text-lg ml-2`}>Replace Photo</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Phone Edit Modal */}
            <Modal
                visible={phoneModalVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setPhoneModalVisible(false)}
            >
                <KeyboardAvoidingView
                    style={tw`flex-1 bg-black bg-opacity-50 justify-center items-center`}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <View style={tw`bg-white rounded-2xl p-6 w-11/12 max-w-md`}>
                        <View style={tw`flex-row items-center justify-between mb-4`}>
                            <Text style={tw`text-xl font-bold`}>Edit Phone Number</Text>
                            <TouchableOpacity onPress={() => setPhoneModalVisible(false)}>
                                <Ionicons name="close" size={24} color="#000" />
                            </TouchableOpacity>
                        </View>

                        {!verificationSent ? (
                            <>
                                <Text style={tw`text-gray-600 mb-4`}>Enter your phone number to receive a verification code</Text>
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
                                <TouchableOpacity
                                    onPress={sendVerificationCode}
                                    disabled={loading}
                                    style={tw`bg-blue-500 py-4 rounded-lg flex-row items-center justify-center`}
                                >
                                    {loading ? (
                                        <ActivityIndicator size="small" color="white" />
                                    ) : (
                                        <>
                                            <Ionicons name="send" size={20} color="white" />
                                            <Text style={tw`text-white font-bold ml-2`}>Send Code</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <Text style={tw`text-gray-600 mb-4 text-center`}>
                                    Enter the verification code sent to {phoneNumber}
                                </Text>
                                <TextInput
                                    style={tw`bg-gray-50 border border-gray-200 rounded-lg px-4 py-4 text-center text-2xl font-bold tracking-widest mb-4`}
                                    value={verificationCode}
                                    onChangeText={setVerificationCode}
                                    placeholder="••••••"
                                    keyboardType="number-pad"
                                    maxLength={6}
                                    autoFocus
                                />
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
                                            <Text style={tw`text-white font-bold ml-2`}>Verify</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => {
                                        setVerificationCode("");
                                        sendVerificationCode();
                                    }}
                                    style={tw`items-center py-2`}
                                >
                                    <Text style={tw`text-blue-500 font-semibold`}>Resend Code</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* Image Preview Modal */}
            <Modal
                visible={imageModalVisible}
                transparent={true}
                onRequestClose={() => setImageModalVisible(false)}
            >
                <View style={tw`flex-1 bg-black bg-opacity-90 justify-center items-center`}>
                    <TouchableOpacity
                        style={tw`absolute top-12 right-4 z-10`}
                        onPress={() => setImageModalVisible(false)}
                    >
                        <Ionicons name="close-circle" size={36} color="white" />
                    </TouchableOpacity>
                    {selectedImage && (
                        <Image
                            source={{ uri: selectedImage }}
                            style={tw`w-full h-full`}
                            resizeMode="contain"
                        />
                    )}
                </View>
            </Modal>

            {/* Profile Section - Bigger and Centered */}
            <View style={tw`bg-white p-6 mb-3`}>
                <View style={tw`flex-row items-center justify-between mb-6`}>
                    <Text style={tw`text-2xl font-bold`}>Profile</Text>
                    <View style={tw`flex-row gap-2`}>
                        {editMode ? (
                            <>
                                <TouchableOpacity
                                    onPress={handleSave}
                                    disabled={loading}
                                    style={tw`bg-green-500 px-4 py-2 rounded-lg flex-row items-center`}
                                >
                                    {loading ? (
                                        <ActivityIndicator size="small" color="white" />
                                    ) : (
                                        <>
                                            <Ionicons name="checkmark" size={18} color="white" />
                                            <Text style={tw`text-white font-semibold ml-1`}>Save</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={handleEditToggle}
                                    style={tw`bg-gray-500 px-4 py-2 rounded-lg flex-row items-center`}
                                >
                                    <Ionicons name="close" size={18} color="white" />
                                    <Text style={tw`text-white font-semibold ml-1`}>Cancel</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <TouchableOpacity
                                onPress={handleEditToggle}
                                style={tw`bg-blue-500 px-4 py-2 rounded-lg flex-row items-center`}
                            >
                                <Ionicons name="create-outline" size={18} color="white" />
                                <Text style={tw`text-white font-semibold ml-1`}>Edit</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Centered Profile Image */}
                <View style={tw`items-center mb-6`}>
                    <TouchableOpacity onPress={viewProfileImage} disabled={uploading}>
                        <View style={tw`relative`}>
                            {user?.imageUrl || driverData?.profileImage ? (
                                <Image
                                    source={{ uri: driverData?.profileImage || user?.imageUrl }}
                                    style={tw`w-32 h-32 rounded-full bg-gray-200`}
                                />
                            ) : (
                                <View style={tw`w-32 h-32 rounded-full bg-gray-300 justify-center items-center`}>
                                    <Ionicons name="person" size={64} color="#666" />
                                </View>
                            )}
                            <View style={tw`absolute bottom-0 right-0 bg-blue-500 rounded-full p-2`}>
                                <Ionicons name="camera" size={20} color="white" />
                            </View>
                        </View>
                    </TouchableOpacity>
                    <Text style={tw`text-2xl font-bold mt-4`}>
                        {user?.firstName || "Driver"} {user?.lastName || ""}
                    </Text>
                    <Text style={tw`text-gray-600 text-sm mt-1`}>
                        {user?.primaryEmailAddress?.emailAddress}
                    </Text>
                    {driverData?.phoneNumber ? (
                        <TouchableOpacity
                            style={tw`flex-row items-center mt-2`}
                            onPress={handlePhoneEdit}
                        >
                            <Ionicons name="call" size={16} color="#666" />
                            <Text style={tw`text-gray-600 ml-1 mr-2`}>
                                {driverData.phoneNumber}
                            </Text>
                            <Ionicons name="create-outline" size={16} color="#3b82f6" />
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={tw`flex-row items-center mt-2`}
                            onPress={handlePhoneEdit}
                        >
                            <Ionicons name="add-circle-outline" size={16} color="#3b82f6" />
                            <Text style={tw`text-blue-500 ml-1`}>Add phone number</Text>
                        </TouchableOpacity>
                    )}
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
            {
                driverData?.vehicle && (
                    <View style={tw`bg-white p-6 mb-3`}>
                        <View style={tw`flex-row items-center mb-4`}>
                            <Ionicons name="car-sport" size={24} color="#000" />
                            <Text style={tw`text-xl font-bold ml-2`}>Vehicle Information</Text>
                        </View>
                        <View style={tw`bg-gray-50 p-4 rounded-xl`}>
                            {editMode ? (
                                <>
                                    <EditableField
                                        label="Brand"
                                        value={editedData.vehicle?.brand || ''}
                                        onChangeText={(text) => setEditedData({
                                            ...editedData,
                                            vehicle: { ...editedData.vehicle, brand: text }
                                        })}
                                    />
                                    <EditableField
                                        label="Model"
                                        value={editedData.vehicle?.model || ''}
                                        onChangeText={(text) => setEditedData({
                                            ...editedData,
                                            vehicle: { ...editedData.vehicle, model: text }
                                        })}
                                    />
                                    <EditableField
                                        label="Year"
                                        value={editedData.vehicle?.year || ''}
                                        onChangeText={(text) => setEditedData({
                                            ...editedData,
                                            vehicle: { ...editedData.vehicle, year: text }
                                        })}
                                        keyboardType="numeric"
                                    />
                                    <EditableField
                                        label="Color"
                                        value={editedData.vehicle?.color || ''}
                                        onChangeText={(text) => setEditedData({
                                            ...editedData,
                                            vehicle: { ...editedData.vehicle, color: text }
                                        })}
                                    />
                                    <EditableField
                                        label="License Plate"
                                        value={editedData.vehicle?.licensePlate || ''}
                                        onChangeText={(text) => setEditedData({
                                            ...editedData,
                                            vehicle: { ...editedData.vehicle, licensePlate: text.toUpperCase() }
                                        })}
                                        autoCapitalize="characters"
                                    />
                                </>
                            ) : (
                                <>
                                    <InfoRow label="Brand" value={driverData.vehicle.brand} />
                                    <InfoRow label="Model" value={driverData.vehicle.model} />
                                    <InfoRow label="Year" value={driverData.vehicle.year} />
                                    <InfoRow label="Color" value={driverData.vehicle.color} />
                                    <InfoRow label="License Plate" value={driverData.vehicle.licensePlate} />
                                </>
                            )}
                        </View>
                        {driverData.vehicle.images?.length > 0 && (
                            <View style={tw`mt-4`}>
                                <View style={tw`flex-row items-center justify-between mb-2`}>
                                    <Text style={tw`font-semibold`}>Vehicle Images ({driverData.vehicle.images.length}/4)</Text>
                                    {driverData.vehicle.images.length < 4 && (
                                        <TouchableOpacity
                                            onPress={handleAddVehicleImages}
                                            disabled={uploading}
                                            style={tw`bg-blue-500 px-3 py-1 rounded-lg flex-row items-center`}
                                        >
                                            <Ionicons name="add" size={16} color="white" />
                                            <Text style={tw`text-white text-sm font-semibold ml-1`}>Add</Text>
                                        </TouchableOpacity>
                                    )}
                                    {driverData.vehicle.images.length >= 4 && (
                                        <View style={tw`bg-gray-300 px-3 py-1 rounded-lg`}>
                                            <Text style={tw`text-gray-600 text-sm font-semibold`}>Limit Reached</Text>
                                        </View>
                                    )}
                                </View>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    {driverData.vehicle.images.map((img, i) => (
                                        <TouchableOpacity
                                            key={i}
                                            onPress={() => handleVehicleImagePress(img, i)}
                                        >
                                            <Image
                                                source={{ uri: img }}
                                                style={tw`w-32 h-24 rounded-lg mr-3 bg-gray-200`}
                                            />
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        )}
                        {(!driverData.vehicle.images || driverData.vehicle.images.length === 0) && (
                            <TouchableOpacity
                                onPress={handleAddVehicleImages}
                                disabled={uploading}
                                style={tw`mt-4 border-2 border-dashed border-gray-300 rounded-lg p-6 items-center`}
                            >
                                <Ionicons name="images-outline" size={40} color="#9ca3af" />
                                <Text style={tw`text-gray-600 mt-2`}>Tap to add vehicle images</Text>
                                <Text style={tw`text-gray-400 text-xs mt-1`}>Maximum 4 images allowed</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )
            }

            {/* Verification Status */}
            <View style={tw`bg-white p-6 mb-3`}>
                <View style={tw`flex-row items-center mb-4`}>
                    <Ionicons name="shield-checkmark" size={24} color="#000" />
                    <Text style={tw`text-xl font-bold ml-2`}>Verification Status</Text>
                </View>
                <View style={tw`bg-gray-50 p-4 rounded-xl`}>
                    <VerificationRow
                        label="Email"
                        verified={true}
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
            <View style={tw`bg-white p-6 mb-6`}>
                <View style={tw`flex-row items-center mb-4`}>
                    <Ionicons name="document-text" size={24} color="#000" />
                    <Text style={tw`text-xl font-bold ml-2`}>Documents</Text>
                </View>
                <View style={tw`bg-gray-50 p-4 rounded-xl`}>
                    <TouchableDocumentRow
                        label="Driving License"
                        url={driverData?.documents?.drivingLicense}
                        onPress={() => handleDocumentPress('drivingLicense', driverData?.documents?.drivingLicense)}
                    />
                    <TouchableDocumentRow
                        label="Vehicle Registration"
                        url={driverData?.documents?.vehicleRegistration}
                        onPress={() => handleDocumentPress('vehicleRegistration', driverData?.documents?.vehicleRegistration)}
                    />
                    <TouchableDocumentRow
                        label="Insurance"
                        url={driverData?.documents?.insurance}
                        onPress={() => handleDocumentPress('insurance', driverData?.documents?.insurance)}
                    />
                </View>
            </View>

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
        </ScrollView >
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

function EditableField({ label, value, onChangeText, keyboardType = "default", autoCapitalize = "none" }) {
    return (
        <View style={tw`py-2 border-b border-gray-200`}>
            <Text style={tw`text-gray-600 text-sm mb-1`}>{label}</Text>
            <TextInput
                style={tw`font-semibold text-base`}
                value={value}
                onChangeText={onChangeText}
                keyboardType={keyboardType}
                autoCapitalize={autoCapitalize}
                placeholderTextColor="#9ca3af"
            />
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

function TouchableDocumentRow({ label, url, onPress }) {
    return (
        <TouchableOpacity
            style={tw`flex-row justify-between items-center py-3 border-b border-gray-200`}
            onPress={onPress}
        >
            <Text style={tw`text-gray-700 flex-1`}>{label}</Text>
            {url ? (
                <View style={tw`flex-row items-center`}>
                    <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                    <Text style={tw`text-blue-500 text-sm ml-1 mr-2`}>Uploaded</Text>
                    <Ionicons name="chevron-forward" size={18} color="#3b82f6" />
                </View>
            ) : (
                <View style={tw`flex-row items-center`}>
                    <Text style={tw`text-gray-400 text-sm mr-2`}>Tap to upload</Text>
                    <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
                </View>
            )}
        </TouchableOpacity>
    );
}
