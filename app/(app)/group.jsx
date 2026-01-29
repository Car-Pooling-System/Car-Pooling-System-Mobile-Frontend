import { View, Text, TouchableOpacity, Image } from "react-native";
import { useAuth, useUser } from "@clerk/clerk-expo";
import tw from "twrnc";
import { useColorScheme } from "react-native";
import { theme } from "../../constants/Colors";
import { Redirect, useRouter } from "expo-router";

export default function Group() {
    const { signOut } = useAuth();
    const { user } = useUser();
    const { isSignedIn } = useAuth();
    const scheme = useColorScheme();
    const colors = theme[scheme ?? "light"];
    const router = useRouter();

    if (!isSignedIn) {
        return <Redirect href={"/(auth)/sign-in"} />
    }

    if (!user) return null;

    return (
        <View
            style={[
                tw`flex-1 px-6 justify-center`,
                { backgroundColor: colors.background },
            ]}
        >
            {/* Card / Surface */}
            <View
                style={[
                    tw`rounded-xl p-6 items-center`,
                    {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                        borderWidth: 1,
                    },
                ]}
            >
                {/* Avatar */}
                <Image
                    source={{ uri: user.imageUrl }}
                    style={[
                        tw`w-16 h-16 rounded-full mb-4`,
                        { borderWidth: 2, borderColor: colors.primary },
                    ]}
                />

                {/* Primary text */}
                <Text
                    style={[
                        tw`text-xl font-bold mb-1`,
                        { color: colors.textPrimary },
                    ]}
                >
                    Welcome 🎉
                </Text>

                {/* Secondary text */}
                <Text
                    style={[
                        tw`text-sm mb-4`,
                        { color: colors.textSecondary },
                    ]}
                >
                    {user.primaryEmailAddress?.emailAddress}
                </Text>

                {/* Success badge */}
                <View
                    style={[
                        tw`px-4 py-1 rounded-full mb-3`,
                        { backgroundColor: colors.successSoft },
                    ]}
                >
                    <Text
                        style={[
                            tw`text-xs font-bold`,
                            { color: colors.success },
                        ]}
                    >
                        You are owed ₹120
                    </Text>
                </View>

                {/* Danger badge */}
                <View
                    style={[
                        tw`px-4 py-1 rounded-full mb-6`,
                        { backgroundColor: colors.dangerSoft },
                    ]}
                >
                    <Text
                        style={[
                            tw`text-xs font-bold`,
                            { color: colors.danger },
                        ]}
                    >
                        You owe ₹40
                    </Text>
                </View>

                {/* Primary button */}
                <TouchableOpacity
                    style={[
                        tw`w-full py-3 rounded-xl mb-3`,
                        { backgroundColor: colors.primary },
                    ]}
                >
                    <Text
                        style={[
                            tw`text-center font-bold`,
                            { color: colors.primaryText },
                        ]}
                    >
                        Add New Bill
                    </Text>
                </TouchableOpacity>

                {/* Secondary button */}
                <TouchableOpacity
                    style={[
                        tw`w-full py-3 rounded-xl mb-6`,
                        {
                            backgroundColor: colors.surfaceMuted,
                            borderColor: colors.border,
                            borderWidth: 1,
                        },
                    ]}
                >
                    <Text
                        style={[
                            tw`text-center font-semibold`,
                            { color: colors.textPrimary },
                        ]}
                    >
                        View Groups
                    </Text>
                </TouchableOpacity>

                {/* Logout (danger action) */}
                <TouchableOpacity
                    onPress={async () => {
                        await signOut();
                        router.replace("/(auth)/sign-in");
                    }}
                    style={[
                        tw`w-full py-3 rounded-xl`,
                        { backgroundColor: colors.dangerSoft },
                    ]}
                >
                    <Text
                        style={[
                            tw`text-center font-bold`,
                            { color: colors.danger },
                        ]}
                    >
                        Sign Out
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Theme debug footer */}
            <Text
                style={[
                    tw`text-center mt-6 text-xs`,
                    { color: colors.textMuted },
                ]}
            >
                Theme mode: {colors.mode}
            </Text>
        </View>
    );
}
