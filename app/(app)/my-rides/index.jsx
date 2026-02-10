import { View, Text } from "react-native";
import tw from "twrnc";

export default function MyRides() {
    return (
        <View style={tw`flex-1 justify-center items-center bg-white`}>
            <Text style={tw`text-2xl font-bold`}>My Rides</Text>
            <Text style={tw`text-gray-500 mt-2`}>This is rides page</Text>
        </View>
    );
}
