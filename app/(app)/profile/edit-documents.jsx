import { View, Text, TouchableOpacity, ScrollView, Image, Alert, ActivityIndicator } from "react-native";
import { useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import tw from "twrnc";
import { uploadToStorage, deleteFromStorage } from "../../../utils/uploadToStorage";
import { uriToBlob, getFileExtension } from "../../../utils/imageHelper";
import { useUser } from "@clerk/clerk-expo";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function EditDocuments() {
    const router = useRouter();
    const { user } = useUser();
    const params = useLocalSearchParams();

    // Parse the documents data from params
    const documentsData = params.documents ? JSON.parse(params.documents) : {};

    const [loading, setLoading] = useState(false);
    const [uploadingDoc, setUploadingDoc] = useState(null);
    const [documents, setDocuments] = useState({
        drivingLicense: documentsData.drivingLicense || null,
        vehicleRegistration: documentsData.vehicleRegistration || null,
        insurance: documentsData.insurance || null
    });

    const documentTypes = [
        { key: 'drivingLicense', label: 'Driving License', icon: 'id-card' },
        { key: 'vehicleRegistration', label: 'Vehicle Registration', icon: 'document-text' },
        { key: 'insurance', label: 'Insurance', icon: 'shield-checkmark' }
    ];

    const pickDocument = async (docType) => {
        Alert.alert(
            "Upload Document",
            "Choose upload method",
            [
                {
                    text: "Take Photo",
                    onPress: () => takePhoto(docType)
                },
                {
                    text: "Choose from Gallery",
                    onPress: () => pickFromGallery(docType)
                },
                {
                    text: "Pick Document",
                    onPress: () => pickFile(docType)
                },
                {
                    text: "Cancel",
                    style: "cancel"
                }
            ]
        );
    };

    const takePhoto = async (docType) => {
        try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();

            if (status !== 'granted') {
                Alert.alert('Permission needed', 'Please grant camera permissions');
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.9,
                aspect: [4, 3],
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                await uploadDocument(result.assets[0], docType);
            }
        } catch (error) {
            console.error("Error taking photo:", error);
            Alert.alert("Error", "Failed to take photo");
        }
    };

    const pickFromGallery = async (docType) => {
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

            if (status !== 'granted') {
                Alert.alert('Permission needed', 'Please grant camera roll permissions');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.9,
                aspect: [4, 3],
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                await uploadDocument(result.assets[0], docType);
            }
        } catch (error) {
            console.error("Error picking from gallery:", error);
            Alert.alert("Error", "Failed to pick image");
        }
    };

    const pickFile = async (docType) => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['image/*', 'application/pdf'],
                copyToCacheDirectory: true
            });

            if (result.type === 'success' && result.uri) {
                await uploadDocument(result, docType);
            }
        } catch (error) {
            console.error("Error picking document:", error);
            Alert.alert("Error", "Failed to pick document");
        }
    };

    const uploadDocument = async (asset, docType) => {
        setUploadingDoc(docType);
        try {
            const blob = await uriToBlob(asset.uri);
            const extension = getFileExtension(asset.uri, asset.mimeType);
            const fileName = `${docType}-${Date.now()}.${extension}`;
            const downloadURL = await uploadToStorage(blob, `documents/${user.id}`, fileName);

            // Delete old document from storage
            if (documents[docType]) {
                await deleteFromStorage(documents[docType]);
            }

            setDocuments(prev => ({
                ...prev,
                [docType]: downloadURL
            }));

            Alert.alert("Success", "Document uploaded successfully");
        } catch (error) {
            console.error("Error uploading document:", error);
            Alert.alert("Error", "Failed to upload document");
        } finally {
            setUploadingDoc(null);
        }
    };

    const removeDocument = async (docType) => {
        Alert.alert(
            "Remove Document",
            "Are you sure you want to remove this document?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Remove",
                    style: "destructive",
                    onPress: async () => {
                        const docUrl = documents[docType];
                        setDocuments(prev => ({ ...prev, [docType]: null }));

                        // Delete from Firebase Storage
                        if (docUrl) {
                            await deleteFromStorage(docUrl);
                        }
                    }
                }
            ]
        );
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${BACKEND_URL}/api/driver-docs/${user.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    documents: documents
                })
            });

            if (!response.ok) {
                throw new Error('Failed to update documents');
            }

            Alert.alert("Success", "Documents updated successfully", [
                { text: "OK", onPress: () => router.back() }
            ]);
        } catch (error) {
            console.error("Error updating documents:", error);
            Alert.alert("Error", "Failed to update documents");
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={tw`flex-1 bg-gray-50`}>
            {/* Header */}
            <View style={tw`bg-white px-4 pt-12 pb-4 shadow-sm`}>
                <View style={tw`flex-row items-center`}>
                    <TouchableOpacity onPress={() => router.back()} style={tw`mr-4`}>
                        <Ionicons name="arrow-back" size={24} color="#000" />
                    </TouchableOpacity>
                    <Text style={tw`text-xl font-bold flex-1`}>Edit Documents</Text>
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
                <View style={tw`bg-white rounded-xl p-4 mb-4`}>
                    <Text style={tw`text-gray-600 mb-4`}>
                        Upload clear photos or scanned copies of your documents. Accepted formats: JPG, PNG, PDF
                    </Text>

                    {documentTypes.map((docType) => (
                        <View key={docType.key} style={tw`mb-6 pb-6 border-b border-gray-200`}>
                            <View style={tw`flex-row items-center justify-between mb-3`}>
                                <View style={tw`flex-row items-center flex-1`}>
                                    <View style={tw`bg-blue-100 p-2 rounded-lg mr-3`}>
                                        <Ionicons name={docType.icon} size={24} color="#3b82f6" />
                                    </View>
                                    <Text style={tw`text-lg font-semibold`}>{docType.label}</Text>
                                </View>

                                {uploadingDoc === docType.key ? (
                                    <ActivityIndicator size="small" color="#007AFF" />
                                ) : documents[docType.key] ? (
                                    <View style={tw`flex-row items-center`}>
                                        <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                                        <Text style={tw`text-green-600 text-sm ml-1`}>Uploaded</Text>
                                    </View>
                                ) : (
                                    <Text style={tw`text-gray-400 text-sm`}>Not uploaded</Text>
                                )}
                            </View>

                            {documents[docType.key] ? (
                                <View>
                                    {documents[docType.key].endsWith('.pdf') ? (
                                        <View style={tw`bg-red-50 p-4 rounded-lg flex-row items-center justify-between`}>
                                            <View style={tw`flex-row items-center flex-1`}>
                                                <Ionicons name="document" size={32} color="#dc2626" />
                                                <Text style={tw`ml-2 text-gray-700`}>PDF Document</Text>
                                            </View>
                                        </View>
                                    ) : (
                                        <Image
                                            source={{ uri: documents[docType.key] }}
                                            style={tw`w-full h-48 rounded-lg bg-gray-200`}
                                            resizeMode="cover"
                                        />
                                    )}

                                    <View style={tw`flex-row mt-3`}>
                                        <TouchableOpacity
                                            onPress={() => pickDocument(docType.key)}
                                            style={tw`flex-1 bg-blue-500 py-3 rounded-lg mr-2 flex-row items-center justify-center`}
                                            disabled={uploadingDoc === docType.key}
                                        >
                                            <Ionicons name="refresh" size={18} color="white" />
                                            <Text style={tw`text-white font-semibold ml-2`}>Replace</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            onPress={() => removeDocument(docType.key)}
                                            style={tw`flex-1 bg-red-500 py-3 rounded-lg ml-2 flex-row items-center justify-center`}
                                        >
                                            <Ionicons name="trash" size={18} color="white" />
                                            <Text style={tw`text-white font-semibold ml-2`}>Remove</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ) : (
                                <TouchableOpacity
                                    onPress={() => pickDocument(docType.key)}
                                    style={tw`border-2 border-dashed border-gray-300 rounded-lg p-6 items-center`}
                                    disabled={uploadingDoc === docType.key}
                                >
                                    <Ionicons name="cloud-upload-outline" size={40} color="#9ca3af" />
                                    <Text style={tw`text-gray-600 mt-2 text-center`}>
                                        Tap to upload {docType.label.toLowerCase()}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
}
