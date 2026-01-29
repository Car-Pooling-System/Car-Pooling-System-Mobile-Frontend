import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "react-native";
import { theme } from "../../constants/Colors";
import { useUser, useAuth,  } from "@clerk/clerk-expo";
import { Redirect } from "expo-router";

export default function TabsLayout() {
    const {user} = useUser();
    const { isSignedIn } = useAuth();
    if (!isSignedIn) {
        return <Redirect href={"/(auth)/sign-in"} />
    }
    const scheme = useColorScheme();
    const colors = theme[scheme ?? "light"];

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

                tabBarIcon: ({ focused, color, size }) => {
                    let iconName;

                    if (route.name === "explore") {
                        iconName = focused ? "compass" : "compass-outline";
                    } else if (route.name === "group") {
                        iconName = focused ? "people" : "people-outline";
                    } else if (route.name === "profile") {
                        iconName = focused ? "person" : "person-outline";
                    } else {
                        iconName = "ellipse";
                    }

                    return (
                        <Ionicons
                            name={iconName}
                            size={focused ? 26 : 22}
                            color={color}
                        />
                    );
                },

                tabBarLabelStyle: {
                    fontSize: 11,
                    fontWeight: "600",
                },
            })}
        >
            <Tabs.Screen name="explore" options={{ title: "Explore" }} />
            <Tabs.Screen name="group" options={{ title: "Groups" }} />
            <Tabs.Screen name="profile" options={{ title: "Profile" }} />
        </Tabs>
    );
}
