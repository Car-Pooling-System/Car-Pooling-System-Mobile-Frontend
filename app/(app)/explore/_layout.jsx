import { View, Text } from 'react-native'
import React from 'react'
import { StatusBar } from 'expo-status-bar'
import { Stack } from 'expo-router'

const ExploreLayout = () => {
    return (
        <>
            <StatusBar style='auto' />
            <Stack screenOptions={{
                headerShown:false
            }}/>
        </>
    )
}

export default ExploreLayout