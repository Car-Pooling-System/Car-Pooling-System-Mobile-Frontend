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
    const [aadharVerifying, setAadharVerifying] = useState(false);
    const [licenseVerifying, setLicenseVerifying] = useState(false);

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
                    vehicles: [],
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

            // Ensure documents and vehicles array exist
            const processedData = {
                ...data,
                vehicles: data.vehicles || [],
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

            const res = await fetch(`${BACKEND_URL}/api/driver-verification/${user.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ aadharVerified: true }),
            });
            if (res.ok) {
                await fetchDriverData();
                Alert.alert('Aadhaar Verified ✓', 'Your Aadhaar has been verified successfully!');
            }
        } catch (e) {
            Alert.alert('Error', 'Verification failed. Please try again.');
        } finally {
            setAadharVerifying(false);
        }
    };

    const handleMockVerifyLicense = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: '*/*',
                copyToCacheDirectory: false,
            });
            if (result.canceled || !result.assets?.length) return;

            setLicenseVerifying(true);
            // Mock: 1.5 s simulated verification — always passes
            await new Promise(r => setTimeout(r, 1500));

            const res = await fetch(`${BACKEND_URL}/api/driver-verification/${user.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ drivingLicenseVerified: true }),
            });
            if (res.ok) {
                await fetchDriverData();
                Alert.alert('License Verified ✓', 'Your driving license has been verified successfully!');
            }
        } catch (e) {
            Alert.alert('Error', 'Verification failed. Please try again.');
        } finally {
            setLicenseVerifying(false);
        }
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
            <View style={[tw`flex-1 justify-center items-center`, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[tw`mt-4`, { color: colors.textSecondary }]}>Loading profile...</Text>
            </View>
        );
    }

    return (
        <ScrollView
            style={[tw`flex-1`, { backgroundColor: colors.background }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
            {/* Loading Overlay */}
            {uploading && (
                <View style={tw`absolute top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 z-50 justify-center items-center`}>
                    <View style={[tw`p-6 rounded-xl items-center`, { backgroundColor: colors.surface }]}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={[tw`mt-4`, { color: colors.textSecondary }]}>Processing...</Text>
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
                            style={[tw`mt-6 px-8 py-4 rounded-full flex-row items-center`, { backgroundColor: colors.primary }]}
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
                    <View style={[tw`rounded-2xl p-6 w-11/12 max-w-md`, { backgroundColor: colors.surface }]}>
                        <View style={tw`flex-row items-center justify-between mb-4`}>
                            <Text style={[tw`text-xl font-bold`, { color: colors.textPrimary }]}>Edit Phone Number</Text>
                            <TouchableOpacity onPress={() => setPhoneModalVisible(false)}>
                                <Ionicons name="close" size={24} color={colors.textPrimary} />
                            </TouchableOpacity>
                        </View>

                        {!verificationSent ? (
                            <>
                                <Text style={[tw`mb-4`, { color: colors.textSecondary }]}>Enter your phone number to receive a verification code</Text>
                                <View style={[tw`flex-row items-center rounded-lg px-4 py-3 mb-4 border`, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                                    <Text style={[tw`text-lg font-semibold mr-2`, { color: colors.textPrimary }]}>+91</Text>
                                    <TextInput
                                        style={[tw`flex-1 text-lg`, { color: colors.textPrimary }]}
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
                                    style={[tw`py-4 rounded-lg flex-row items-center justify-center`, { backgroundColor: colors.primary }]}
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
                                <Text style={[tw`mb-4 text-center`, { color: colors.textSecondary }]}>
                                    Enter the verification code sent to {phoneNumber}
                                </Text>
                                <TextInput
                                    style={[tw`rounded-lg px-4 py-4 text-center text-2xl font-bold tracking-widest mb-4 border`, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.textPrimary }]}
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
                                    style={[tw`py-4 rounded-lg flex-row items-center justify-center mb-3`, { backgroundColor: colors.success }]}
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
                                    <Text style={[tw`font-semibold`, { color: colors.primary }]}>Resend Code</Text>
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
            <View style={[tw`p-6 mb-3`, { backgroundColor: colors.surface }]}>
                <View style={tw`flex-row items-center justify-between mb-6`}>
                    <Text style={[tw`text-2xl font-bold`, { color: colors.textPrimary }]}>Profile</Text>
                    <View style={tw`flex-row gap-2`}>
                        {editMode ? (
                            <>
                                <TouchableOpacity
                                    onPress={handleSave}
                                    disabled={loading}
                                    style={[tw`px-4 py-2 rounded-lg flex-row items-center`, { backgroundColor: colors.success }]}
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
                                    style={[tw`px-4 py-2 rounded-lg flex-row items-center border`, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
                                >
                                    <Ionicons name="close" size={18} color={colors.textPrimary} />
                                    <Text style={[tw`font-semibold ml-1`, { color: colors.textPrimary }]}>Cancel</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <TouchableOpacity
                                onPress={handleEditToggle}
                                style={[tw`px-4 py-2 rounded-lg flex-row items-center`, { backgroundColor: colors.primary }]}
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
                                    style={[tw`w-32 h-32 rounded-full`, { backgroundColor: colors.surfaceMuted }]}
                                />
                            ) : (
                                <View style={[tw`w-32 h-32 rounded-full justify-center items-center`, { backgroundColor: colors.surfaceMuted }]}>
                                    <Ionicons name="person" size={64} color={colors.textMuted} />
                                </View>
                            )}
                            <View style={[tw`absolute bottom-0 right-0 rounded-full p-2`, { backgroundColor: colors.primary }]}>
                                <Ionicons name="camera" size={20} color="white" />
                            </View>
                        </View>
                    </TouchableOpacity>
                    <Text style={[tw`text-2xl font-bold mt-4`, { color: colors.textPrimary }]}>
                        {user?.firstName || "Driver"} {user?.lastName || ""}
                    </Text>
                    <Text style={[tw`text-sm mt-1`, { color: colors.textSecondary }]}>
                        {user?.primaryEmailAddress?.emailAddress}
                    </Text>
                    {driverData?.phoneNumber ? (
                        <TouchableOpacity
                            style={tw`flex-row items-center mt-2`}
                            onPress={handlePhoneEdit}
                        >
                            <Ionicons name="call" size={16} color={colors.textSecondary} />
                            <Text style={[tw`ml-1 mr-2`, { color: colors.textSecondary }]}>
                                {driverData.phoneNumber}
                            </Text>
                            <Ionicons name="create-outline" size={16} color={colors.primary} />
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={tw`flex-row items-center mt-2`}
                            onPress={handlePhoneEdit}
                        >
                            <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                            <Text style={[tw`ml-1`, { color: colors.primary }]}>Add phone number</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Statistics */}
            <View style={[tw`p-6 mb-3`, { backgroundColor: colors.surface }]}>
                <Text style={[tw`text-xl font-bold mb-4`, { color: colors.textPrimary }]}>Statistics</Text>
                <View style={tw`flex-row justify-between`}>
                    <View style={[tw`items-center flex-1 p-4 rounded-xl mr-2`, { backgroundColor: colors.primarySoft }]}>
                        <Text style={[tw`text-3xl font-bold`, { color: colors.primary }]}>
                            {driverData?.rides?.completed || 0}
                        </Text>
                        <Text style={[tw`text-sm mt-1`, { color: colors.textSecondary }]}>Completed</Text>
                    </View>
                    <View style={[tw`items-center flex-1 p-4 rounded-xl mx-1`, { backgroundColor: colors.successSoft }]}>
                        <Text style={[tw`text-3xl font-bold`, { color: colors.success }]}>
                            {driverData?.rating?.average?.toFixed(1) || "0.0"}
                        </Text>
                        <Text style={[tw`text-sm mt-1`, { color: colors.textSecondary }]}>Rating</Text>
                    </View>
                    <View style={[tw`items-center flex-1 p-4 rounded-xl ml-2`, { backgroundColor: colors.surfaceMuted }]}>
                        <Text style={[tw`text-3xl font-bold`, { color: colors.textPrimary }]}>
                            {driverData?.distanceDrivenKm || 0}
                        </Text>
                        <Text style={[tw`text-sm mt-1`, { color: colors.textSecondary }]}>km</Text>
                    </View>
                </View>
            </View>

            {/* Vehicle Information */}
            <View style={[tw`p-6 mb-3`, { backgroundColor: colors.surface }]}>
                <View style={tw`flex-row items-center justify-between mb-4`}>
                    <View style={tw`flex-row items-center`}>
                        <Ionicons name="car-sport" size={24} color={colors.textPrimary} />
                        <Text style={[tw`text-xl font-bold ml-2`, { color: colors.textPrimary }]}>My Vehicles</Text>
                        {driverData?.vehicles && driverData.vehicles.length > 0 && (
                            <View style={tw`ml-2 flex-row items-center gap-1`}>
                                {(() => {
                                    const ins = driverData.vehicles.filter(v => v.insuranceVerified).length;
                                    const tot = driverData.vehicles.length;
                                    return (
                                        <View style={[tw`px-2 py-1 rounded-full`, { backgroundColor: ins === tot ? colors.successSoft : '#fef3c7' }]}>
                                            <Text style={[tw`text-xs font-bold`, { color: ins === tot ? colors.success : '#92400e' }]}>
                                                {ins}/{tot} Insured
                                            </Text>
                                        </View>
                                    );
                                })()}
                            </View>
                        )}
                    </View>
                    <TouchableOpacity
                        onPress={() => router.push("/profile/vehicles")}
                        style={[tw`px-4 py-2 rounded-lg flex-row items-center`, { backgroundColor: colors.primary }]}
                    >
                        <Ionicons name="settings-outline" size={16} color="white" />
                        <Text style={tw`text-white font-semibold ml-2`}>Manage</Text>
                    </TouchableOpacity>
                </View>

                {driverData?.vehicles && driverData.vehicles.length > 0 ? (
                    <View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`-mx-2`}>
                            {driverData.vehicles.map((vehicle, index) => (
                                <TouchableOpacity
                                    key={index}
                                    onPress={() => router.push("/profile/vehicles")}
                                    style={[tw`mx-2 rounded-xl overflow-hidden w-64 border`, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
                                >
                                    {vehicle.images && vehicle.images.length > 0 ? (
                                        <Image
                                            source={{ uri: vehicle.images[0] }}
                                            style={[tw`w-full h-40`, { backgroundColor: colors.surfaceMuted }]}
                                            resizeMode="cover"
                                        />
                                    ) : (
                                        <View style={[tw`w-full h-40 items-center justify-center`, { backgroundColor: colors.surfaceMuted }]}>
                                            <Ionicons name="car-sport-outline" size={48} color={colors.textMuted} />
                                        </View>
                                    )}
                                    <View style={tw`p-4`}>
                                        <Text style={[tw`font-bold text-lg`, { color: colors.textPrimary }]}>
                                            {vehicle.brand} {vehicle.model}
                                        </Text>
                                        <Text style={[tw`text-sm mt-1`, { color: colors.textSecondary }]}>
                                            {vehicle.year} • {vehicle.color}
                                        </Text>
                                        <View style={[tw`px-3 py-1 rounded-lg mt-2 self-start`, { backgroundColor: colors.border }]}>
                                            <Text style={[tw`font-mono font-bold text-xs`, { color: colors.textPrimary }]}>
                                                {vehicle.licensePlate}
                                            </Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                ) : (
                    <TouchableOpacity
                        onPress={() => router.push("/profile/vehicles")}
                        style={[tw`p-6 rounded-xl items-center border-2 border-dashed`, { borderColor: colors.border }]}
                    >
                        <Ionicons name="car-sport-outline" size={48} color={colors.textMuted} />
                        <Text style={[tw`mt-3 font-semibold`, { color: colors.textSecondary }]}>No vehicles added yet</Text>
                        <Text style={[tw`text-sm mt-1 text-center`, { color: colors.textMuted }]}>
                            Tap to add your first vehicle
                        </Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Verification Status */}
            <View style={[tw`p-6 mb-3`, { backgroundColor: colors.surface }]}>
                <View style={tw`flex-row items-center mb-4`}>
                    <Ionicons name="shield-checkmark" size={24} color={colors.textPrimary} />
                    <Text style={[tw`text-xl font-bold ml-2`, { color: colors.textPrimary }]}>Verification Status</Text>
                </View>
                <View style={[tw`p-4 rounded-xl`, { backgroundColor: colors.surfaceMuted }]}>
                    <VerificationRow label="Email" verified={true} colors={colors} />
                    <VerificationRow label="Phone" verified={driverData?.verification?.phoneVerified} colors={colors} />

                    {/* Aadhaar */}
                    <View style={[tw`flex-row justify-between items-center py-3 border-b`, { borderColor: colors.border }]}>
                        <View>
                            <Text style={[tw`text-sm font-medium`, { color: colors.textPrimary }]}>Aadhaar</Text>
                            <Text style={[tw`text-xs`, { color: colors.textMuted }]}>Government ID document</Text>
                        </View>
                        {driverData?.verification?.aadharVerified ? (
                            <View style={[tw`flex-row items-center gap-1 px-3 py-1 rounded-full`, { backgroundColor: colors.successSoft }]}>
                                <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                                <Text style={[tw`text-xs font-semibold`, { color: colors.success }]}>Verified</Text>
                            </View>
                        ) : aadharVerifying ? (
                            <View style={tw`flex-row items-center gap-2`}>
                                <ActivityIndicator size="small" color={colors.primary} />
                                <Text style={[tw`text-xs`, { color: colors.textSecondary }]}>Verifying...</Text>
                            </View>
                        ) : (
                            <TouchableOpacity
                                onPress={handleMockVerifyAadhar}
                                style={[tw`px-3 py-1.5 rounded-lg flex-row items-center gap-1`, { backgroundColor: colors.primary }]}
                            >
                                <Ionicons name="cloud-upload-outline" size={12} color="white" />
                                <Text style={tw`text-white text-xs font-semibold`}>Upload & Verify</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Driving License */}
                    <View style={[tw`flex-row justify-between items-center py-3`, { borderColor: colors.border }]}>
                        <View>
                            <Text style={[tw`text-sm font-medium`, { color: colors.textPrimary }]}>Driving License</Text>
                            <Text style={[tw`text-xs`, { color: colors.textMuted }]}>Driver's license document</Text>
                        </View>
                        {driverData?.verification?.drivingLicenseVerified ? (
                            <View style={[tw`flex-row items-center gap-1 px-3 py-1 rounded-full`, { backgroundColor: colors.successSoft }]}>
                                <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                                <Text style={[tw`text-xs font-semibold`, { color: colors.success }]}>Verified</Text>
                            </View>
                        ) : licenseVerifying ? (
                            <View style={tw`flex-row items-center gap-2`}>
                                <ActivityIndicator size="small" color={colors.primary} />
                                <Text style={[tw`text-xs`, { color: colors.textSecondary }]}>Verifying...</Text>
                            </View>
                        ) : (
                            <TouchableOpacity
                                onPress={handleMockVerifyLicense}
                                style={[tw`px-3 py-1.5 rounded-lg flex-row items-center gap-1`, { backgroundColor: colors.primary }]}
                            >
                                <Ionicons name="cloud-upload-outline" size={12} color="white" />
                                <Text style={tw`text-white text-xs font-semibold`}>Upload & Verify</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </View>

            {/* Switch to Rider */}
            <View style={[tw`mx-4 mb-3 rounded-2xl overflow-hidden`, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                <TouchableOpacity
                    onPress={() => {
                        Alert.alert(
                            "Switch to Rider",
                            "Switch your account to rider mode?",
                            [
                                { text: "Cancel", style: "cancel" },
                                {
                                    text: "Switch",
                                    onPress: async () => {
                                        try {
                                            setLoading(true);
                                            await user.update({
                                                unsafeMetadata: { ...user.unsafeMetadata, role: "rider" },
                                            });
                                            router.replace("/(rider)/search");
                                        } catch (e) {
                                            Alert.alert("Error", "Could not switch role.");
                                        } finally {
                                            setLoading(false);
                                        }
                                    },
                                },
                            ]
                        );
                    }}
                    style={tw`flex-row items-center px-4 py-4`}
                >
                    <View style={[tw`w-10 h-10 rounded-xl items-center justify-center mr-4`, { backgroundColor: colors.primarySoft }]}>
                        <Ionicons name="person" size={20} color={colors.primary} />
                    </View>
                    <View style={tw`flex-1`}>
                        <Text style={[tw`font-semibold text-base`, { color: colors.textPrimary }]}>Switch to Rider</Text>
                        <Text style={[tw`text-xs mt-0.5`, { color: colors.textSecondary }]}>Book rides as a passenger</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
            </View>

            {/* Logout Button */}
            <View style={[tw`p-6 mb-6`, { backgroundColor: colors.surface }]}>
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
                                            setLoading(true);
                                            await signOut();
                                            router.replace("/(auth)/sign-in");
                                        } catch (error) {
                                            console.error("Error signing out:", error);
                                        } finally {
                                            setLoading(false);
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

function VerificationRow({ label, verified, colors = {} }) {
    return (
        <View style={[tw`flex-row justify-between items-center py-2 border-b`, { borderColor: colors.border || '#e0e0e0' }]}>
            <Text style={[tw`text-sm`, { color: colors.textPrimary || '#111' }]}>{label}</Text>
            <View style={[tw`px-3 py-1 rounded-full`, { backgroundColor: verified ? (colors.successSoft || '#dcfce7') : (colors.dangerSoft || '#fee2e2') }]}>
                <Text style={[tw`text-xs font-semibold`, { color: verified ? (colors.success || '#078829') : (colors.danger || '#e72a08') }]}>
                    {verified ? "Verified" : "Not Verified"}
                </Text>
            </View>
        </View>
    );
}
