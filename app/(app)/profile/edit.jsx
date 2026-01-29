import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    Image,
    ActivityIndicator,
    Alert,
} from "react-native";
import { useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import tw from "twrnc";
import { theme } from "../../../constants/Colors";
import { useColorScheme } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function EditProfile() {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const scheme = useColorScheme();
    const colors = theme[scheme ?? "light"];

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [saving, setSaving] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);

    /* ---------------- INIT FROM unsafeMetadata ---------------- */
    useEffect(() => {
        if (isLoaded && user) {
            setFirstName(
                user.unsafeMetadata?.firstName || user.firstName || ""
            );
            setLastName(
                user.unsafeMetadata?.lastName || user.lastName || ""
            );
        }
    }, [isLoaded, user]);

    if (!isLoaded || !user) return null;

    /* ---------------- IMAGE PICK (BASE64 – SAME AS WORKING) ---------------- */
    const pickImage = async () => {
        const { status } =
            await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
            Alert.alert("Permission needed", "Allow photo access");
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.8,
            allowsEditing: true,
            aspect: [1, 1],
            base64: true,
        });

        if (result.canceled || !result.assets[0].base64) return;

        try {
            setUploadingImage(true);
            const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
            await user.setProfileImage({ file: base64Image });
        } catch (err) {
            console.error("Image upload failed", err);
            Alert.alert("Error", "Failed to update profile image");
        } finally {
            setUploadingImage(false);
        }
    };

    /* ---------------- SAVE NAME (unsafeMetadata – SAME AS WORKING) ---------------- */
    const saveProfile = async () => {
        if (!firstName.trim() || !lastName.trim()) {
            Alert.alert("Error", "Please enter both first and last name");
            return;
        }

        try {
            setSaving(true);

            await user.update({
                unsafeMetadata: {
                    firstName: firstName.trim(),
                    lastName: lastName.trim(),
                },
            });

            Alert.alert("Success", "Profile updated");
            router.back();
        } catch (err) {
            console.error("Profile update failed", err);
            Alert.alert("Error", "Failed to update profile");
        } finally {
            setSaving(false);
        }
    };

    return (
        <View
            style={[
                tw`flex-1 px-4 pt-6`,
                { backgroundColor: colors.background },
            ]}
        >
            
            <Text
                style={[
                    tw`text-xl font-bold mb-6`,
                    { color: colors.textPrimary },
                ]}
            >
                <Ionicons onPress={() => {
                    router.back()
                }} name="arrow-back" size={18}/> Edit Profile
            </Text>

            {/* Profile Image */}
            <TouchableOpacity
                onPress={pickImage}
                disabled={uploadingImage}
                style={tw`items-center mb-6`}
            >
                <Image
                    source={{ uri: user.imageUrl }}
                    style={tw`w-28 h-28 rounded-full`}
                />
                {uploadingImage ? (
                    <ActivityIndicator style={tw`mt-2`} />
                ) : (
                    <Text style={{ color: colors.primary, marginTop: 8 }}>
                        Change Photo
                    </Text>
                )}
            </TouchableOpacity>

            {/* First Name */}
            <Text style={{ color: colors.textSecondary }}>First Name</Text>
            <TextInput
                value={firstName}
                onChangeText={setFirstName}
                style={[
                    tw`p-3 rounded-xl mt-2 mb-4`,
                    { backgroundColor: colors.surface },
                ]}
            />

            {/* Last Name */}
            <Text style={{ color: colors.textSecondary }}>Last Name</Text>
            <TextInput
                value={lastName}
                onChangeText={setLastName}
                style={[
                    tw`p-3 rounded-xl mt-2`,
                    { backgroundColor: colors.surface },
                ]}
            />

            {/* Save */}
            <TouchableOpacity
                onPress={saveProfile}
                disabled={saving}
                style={[
                    tw`mt-8 py-4 rounded-xl`,
                    {
                        backgroundColor: saving
                            ? colors.surfaceMuted
                            : colors.primary,
                    },
                ]}
            >
                {saving ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text
                        style={[
                            tw`text-center font-bold`,
                            { color: colors.primaryText },
                        ]}
                    >
                        Save Changes
                    </Text>
                )}
            </TouchableOpacity>
        </View>
    );
}
