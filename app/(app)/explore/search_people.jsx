import { View, Text } from 'react-native'
import React from 'react'
import tw from 'twrnc'
import { Ionicons } from '@expo/vector-icons'

const SearchPeople = () => {
    return (
        <View>
            <View style={tw`pl-2 flex-row justify-start items-center`}>
                <Ionicons name='arrow-back' size={24} />
                <Text style={tw`p-3 font-bold text-2xl`}>Search People</Text>
            </View>
        </View>
    )
}

export default SearchPeople