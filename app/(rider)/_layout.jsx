import { Tabs, Redirect } from "expo-router";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useColorScheme } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../constants/Colors";

export default function RiderLayout() {
    const { isSignedIn } = useAuth();
    const { user } = useUser();
    const scheme = useColorScheme();
    const colors = theme[scheme ?? "light"];

    if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;
    if (user?.unsafeMetadata?.role === "driver") return <Redirect href="/(app)/my-rides" />;

    return (
        <Tabs
            screenOptions={({ route }) => ({
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: colors.surface,
                    borderTopColor: colors.border,
                    height: 64,
                    paddingBottom: 8,
                    paddingTop: 8,
                },
                tabBarActiveTintColor: colors.primary,
                tabBarInactiveTintColor: colors.tabInactive,
                tabBarIcon: ({ focused, color }) => {
                    const icons = {
                        search: focused ? "search" : "search-outline",
                        bookings: focused ? "calendar" : "calendar-outline",
                        profile: focused ? "person" : "person-outline",
                    };
                    return (
                        <Ionicons
                            name={icons[route.name] || "ellipse"}
                            size={focused ? 28 : 24}
                            color={color}
                        />
                    );
                },
                tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
            })}
        >
            <Tabs.Screen name="search" options={{ title: "Find a Ride" }} />
            <Tabs.Screen name="bookings" options={{ title: "My Bookings" }} />
            <Tabs.Screen name="profile" options={{ title: "Profile" }} />
        </Tabs>
    );
}
