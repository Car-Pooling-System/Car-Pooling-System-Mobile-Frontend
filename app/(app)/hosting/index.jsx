import { View, Text } from "react-native";
import tw from "twrnc";

export default function CreateRide() {
    return (
        <View style={tw`flex-1 justify-center items-center bg-white`}>
            <Text style={tw`text-2xl font-bold`}>Create Ride</Text>
            <Text style={tw`text-gray-500 mt-2`}>This is create ride page</Text>
        </View>
    );
}
